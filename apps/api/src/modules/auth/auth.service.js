const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const userRepo = require('../../database/repositories/user.repository');
const sessionRepo = require('../../database/repositories/session.repository');
const tenantRepo = require('../../database/repositories/tenant.repository');
const auditLogRepo = require('../../database/repositories/authAuditLog.repository');
const Plan = require('../../database/models/Plan.model');
const { signAccessToken, signRefreshToken, verifyRefreshToken, signTempToken, verifyTempToken } = require('../../utils/jwt');
const { encrypt, decrypt } = require('../../utils/crypto');
const { getPermissions } = require('../../config/permissions');
const { queueEmail } = require('../../jobs/email.job');
const verifyEmailTemplate = require('../../services/email/templates/verifyEmail');
const resetPasswordTemplate = require('../../services/email/templates/resetPassword');
const accountLockedAdminTemplate = require('../../services/email/templates/accountLockedAdmin');
const welcomeTenantTemplate = require('../../services/email/templates/welcomeTenant');
const AppError = require('../../utils/AppError');
const config = require('../../config');

// Verify reCAPTCHA v3 token — soft-fail if secret not configured
async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret || !token) return; // skip if not configured
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${secret}&response=${token}`,
  });
  const json = await res.json();
  if (!json.success || (json.score !== undefined && json.score < 0.5)) {
    throw new AppError('Bot protection check failed. Please try again.', 422, 'RECAPTCHA_FAILED');
  }
}

const LOCK_DURATION_MS  = 30 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const RESEND_LIMIT       = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTokens(user, sessionId, rememberMe = false) {
  const permissions = getPermissions(user.role);
  const payload = {
    sub: user._id.toString(),
    tenantId: user.tenantId?.toString(),
    role: user.role,
    permissions,
    sessionId,
  };
  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken({ sessionId }, rememberMe ? '30d' : undefined);
  return { accessToken, refreshToken, permissions };
}

function getDeviceInfo(req) {
  return { ip: req.ip, ua: req.headers['user-agent'] || null };
}

function userPublic(user) {
  return {
    _id: user._id,
    tenantId: user.tenantId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    status: user.status,
    avatar: user.avatar,
    twoFactorEnabled: user.twoFactor?.enabled || false,
  };
}

async function getOrCreateFreePlan() {
  let plan = await Plan.findOne({ slug: 'free' });
  if (!plan) {
    plan = await Plan.create({
      name: 'Free',
      slug: 'free',
      price: { monthly: 0, yearly: 0 },
      limits: { students: 50, instructors: 3, courses: 5, storageGB: 2, maxSessions: 2 },
      features: ['Basic courses', 'Email support'],
      trialDays: 14,
      dbMode: 'shared',
    });
  }
  return plan;
}

// Notify the first tenant_admin when a user gets locked out
async function notifyAdminOfLockout(tenantId, lockedUser, ip) {
  try {
    const User = require('../../database/models/User.model');
    const admin = await User.findOne({ tenantId, role: 'tenant_admin', status: 'active', deletedAt: null });
    if (!admin) return;
    const { tenantName, branding } = await tenantRepo.getBranding(tenantId);
    const template = accountLockedAdminTemplate({
      adminName: admin.firstName,
      userName: `${lockedUser.firstName} ${lockedUser.lastName}`,
      userEmail: lockedUser.email,
      lockUntil: new Date(Date.now() + LOCK_DURATION_MS),
      ip,
      tenantName,
      branding,
    });
    await queueEmail({ to: admin.email, ...template }).catch(() => {});
  } catch {
    // non-critical — never block login flow
  }
}

// Exchange Google auth code for user profile info
async function fetchGoogleProfile(code, redirectUri) {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new AppError('Google OAuth is not configured on this server', 501, 'GOOGLE_NOT_CONFIGURED');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new AppError('Google authentication failed', 401, 'GOOGLE_AUTH_FAILED');

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();
  if (!profile.id) throw new AppError('Could not retrieve Google profile', 401, 'GOOGLE_PROFILE_FAILED');
  return profile; // { id, email, given_name, family_name, picture, verified_email }
}

// Generate 8 one-time backup codes, return plain + stored (hashed) versions
function generateBackupCodes() {
  const plain  = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
  const hashed = plain.map(c => crypto.createHash('sha256').update(c).digest('hex'));
  return { plain, hashed };
}

// ─── Register Tenant (new org signup) ────────────────────────────────────────
async function registerTenant({ firstName, lastName, email, password, tenantName, subdomain, recaptchaToken, req }) {
  await verifyRecaptcha(recaptchaToken);

  const existing = await tenantRepo.findBySubdomain(subdomain);
  if (existing) throw new AppError('Subdomain already taken', 409, 'SUBDOMAIN_EXISTS');

  const plan = await getOrCreateFreePlan();
  const trialEndsAt = new Date(Date.now() + (plan.trialDays || 14) * 24 * 60 * 60 * 1000);

  const tenant = await tenantRepo.create({
    name: tenantName,
    subdomain: subdomain.toLowerCase(),
    contactEmail: email.toLowerCase(),
    plan: plan._id,
    isOnTrial: true,
    trialEndsAt,
    status: 'active',
  });

  const existingUser = await userRepo.findByEmail(tenant._id, email);
  if (existingUser) throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');

  const requireVerification = config.app.requireEmailVerification && tenant.settings?.requireEmailVerification !== false;

  const user = await userRepo.create({
    tenantId: tenant._id,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.toLowerCase().trim(),
    passwordHash: password,
    role: 'tenant_admin',
    status: requireVerification ? 'unverified' : 'active',
  });

  const { branding } = await tenantRepo.getBranding(tenant._id);

  if (requireVerification) {
    const rawToken = user.generateVerificationToken();
    await user.save();
    const verifyUrl = `${config.app.url}/verify-email?token=${rawToken}`;
    const template = verifyEmailTemplate({ name: user.firstName, verifyUrl, tenantName, branding });
    await queueEmail({ to: user.email, tenantId: tenant._id.toString(), ...template }).catch(() => {});
  }

  // Welcome email — always sent regardless of verification requirement
  queueEmail({
    to: user.email,
    tenantId: tenant._id.toString(),
    ...welcomeTenantTemplate({
      adminName:   user.firstName,
      tenantName,
      subdomain:   tenant.subdomain,
      trialEndsAt: tenant.trialEndsAt,
      appUrl:      config.app.url,
      branding,
    }),
  }).catch(() => {});

  auditLogRepo.log({ tenantId: tenant._id, userId: user._id, email: user.email, event: 'register_tenant', ip: req.ip, userAgent: req.headers['user-agent'] });

  const sessionId = uuidv4();
  const { accessToken, refreshToken } = buildTokens(user, sessionId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await sessionRepo.create({ tenantId: tenant._id, userId: user._id, sessionId, refreshToken, deviceInfo: getDeviceInfo(req), expiresAt });

  return {
    accessToken,
    refreshToken,
    user: userPublic(user),
    tenant: { _id: tenant._id, name: tenant.name, subdomain: tenant.subdomain },
  };
}

// ─── Register (self-registration on existing tenant) ─────────────────────────
async function register({ firstName, lastName, email, password, tenantId, tenantName, settings, req }) {
  const existing = await userRepo.findByEmail(tenantId, email);
  if (existing) throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');

  // Skip email verification if tenant has no SMTP configured — user logs in immediately
  const smtpConfigured = !!(settings?.smtp?.host);
  const requireVerification = smtpConfigured && settings?.requireEmailVerification !== false;

  const user = await userRepo.create({
    tenantId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.toLowerCase().trim(),
    passwordHash: password,
    role: 'student',
    status: requireVerification ? 'unverified' : 'active',
  });

  if (requireVerification) {
    const rawToken = user.generateVerificationToken();
    await user.save();
    const verifyUrl = `${config.app.url}/verify-email?token=${rawToken}`;
    const { branding } = await tenantRepo.getBranding(tenantId);
    const template = verifyEmailTemplate({ name: user.firstName, verifyUrl, tenantName, branding });
    await queueEmail({ to: user.email, tenantId: tenantId.toString(), ...template }).catch(() => {});
  }

  auditLogRepo.log({ tenantId, userId: user._id, email: user.email, event: 'register', ip: req?.ip, userAgent: req?.headers?.['user-agent'] });

  return {
    message: requireVerification ? 'Registration successful. Please verify your email.' : 'Registration successful. You can now log in.',
    requiresVerification: requireVerification,
  };
}

// ─── Login ───────────────────────────────────────────────────────────────────
async function login({ email, password, tenantId, rememberMe = false, req }) {
  const deviceInfo = getDeviceInfo(req);
  const user = await userRepo.findByEmail(tenantId, email);

  if (!user) {
    auditLogRepo.log({ tenantId, email, event: 'failed_login', ip: deviceInfo.ip, userAgent: deviceInfo.ua, meta: { reason: 'user_not_found' } });
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (user.isLocked) throw new AppError('Account locked. Try again later.', 423, 'ACCOUNT_LOCKED');

  if (user.status === 'unverified')
    throw new AppError('Please verify your email first.', 403, 'EMAIL_NOT_VERIFIED');
  if (user.status === 'suspended')
    throw new AppError('Account suspended. Contact support.', 403, 'ACCOUNT_SUSPENDED');

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const newAttempts = (user.loginAttempts || 0) + 1;
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      await userRepo.lockAccount(user._id, new Date(Date.now() + LOCK_DURATION_MS));
      auditLogRepo.log({ tenantId, userId: user._id, email, event: 'account_locked', ip: deviceInfo.ip, userAgent: deviceInfo.ua });
      if (tenantId) notifyAdminOfLockout(tenantId, user, deviceInfo.ip);
    } else {
      await userRepo.incrementLoginAttempts(user._id);
    }
    auditLogRepo.log({ tenantId, userId: user._id, email, event: 'failed_login', ip: deviceInfo.ip, userAgent: deviceInfo.ua, meta: { attempt: newAttempts } });
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  await userRepo.resetLoginAttempts(user._id);
  await userRepo.updateById(user._id, { lastLoginAt: new Date() });

  // If 2FA is enabled, issue a short-lived temp token instead of real session
  if (user.twoFactor?.enabled) {
    const tempToken = signTempToken({ sub: user._id.toString(), tenantId: tenantId?.toString() });
    return { requiresTwoFactor: true, tempToken };
  }

  const sessionId = uuidv4();
  const { accessToken, refreshToken } = buildTokens(user, sessionId, rememberMe);
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000);

  await sessionRepo.create({ tenantId, userId: user._id, sessionId, refreshToken, deviceInfo, expiresAt });

  auditLogRepo.log({ tenantId, userId: user._id, email, event: 'login', ip: deviceInfo.ip, userAgent: deviceInfo.ua });

  return { accessToken, refreshToken, user: userPublic(user) };
}

// ─── Verify Email ─────────────────────────────────────────────────────────────
async function verifyEmail({ token, tenantId, req }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const User = require('../../database/models/User.model');
  const user = await User.findOne({
    ...(tenantId ? { tenantId } : {}),
    'emailVerification.tokenHash': tokenHash,
    'emailVerification.expiresAt': { $gt: new Date() },
    deletedAt: null,
  }).select('+emailVerification');

  if (!user) throw new AppError('Invalid or expired verification link', 400, 'INVALID_TOKEN');

  user.status = 'active';
  user.emailVerification.tokenHash = null;
  user.emailVerification.expiresAt = null;
  await user.save();

  auditLogRepo.log({ tenantId: user.tenantId, userId: user._id, email: user.email, event: 'email_verified', ip: req?.ip, userAgent: req?.headers?.['user-agent'] });

  const sessionId = uuidv4();
  const { accessToken, refreshToken } = buildTokens(user, sessionId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await sessionRepo.create({ tenantId: user.tenantId, userId: user._id, sessionId, refreshToken, deviceInfo: getDeviceInfo(req), expiresAt });

  return { accessToken, refreshToken };
}

// ─── Resend Verification ──────────────────────────────────────────────────────
async function resendVerification({ email, tenantId, tenantName }) {
  const user = await userRepo.findByEmail(tenantId, email);
  if (!user || user.status !== 'unverified') return;

  const now = new Date();
  const windowStart = user.emailVerification?.resendWindowStart;
  const resendCount = user.emailVerification?.resendCount || 0;

  if (windowStart && now - windowStart < 60 * 60 * 1000 && resendCount >= RESEND_LIMIT)
    throw new AppError('Too many resend attempts. Try again in an hour.', 429, 'RESEND_LIMIT');

  if (!windowStart || now - windowStart >= 60 * 60 * 1000) {
    user.emailVerification.resendCount = 0;
    user.emailVerification.resendWindowStart = now;
  }

  const rawToken = user.generateVerificationToken();
  user.emailVerification.resendCount += 1;
  await user.save();

  const verifyUrl = `${config.app.url}/verify-email?token=${rawToken}`;
  const { branding } = await tenantRepo.getBranding(tenantId);
  const template = verifyEmailTemplate({ name: user.firstName, verifyUrl, tenantName, branding });
  await queueEmail({ to: user.email, ...template }).catch(() => {});
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
async function forgotPassword({ email, tenantId, tenantName }) {
  const user = await userRepo.findByEmail(tenantId, email);
  if (!user || user.status !== 'active') return;

  const rawToken = user.generatePasswordResetToken();
  await user.save();

  auditLogRepo.log({ tenantId, userId: user._id, email, event: 'password_reset_request' });

  const resetUrl = `${config.app.url}/reset-password?token=${rawToken}`;
  const { branding } = await tenantRepo.getBranding(tenantId);
  const template = resetPasswordTemplate({ name: user.firstName, resetUrl, tenantName, branding });
  await queueEmail({ to: user.email, ...template }).catch(() => {});
}

// ─── Reset Password ───────────────────────────────────────────────────────────
async function resetPassword({ token, newPassword, tenantId }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const User = require('../../database/models/User.model');
  const user = await User.findOne({
    ...(tenantId ? { tenantId } : {}),
    'passwordReset.tokenHash': tokenHash,
    'passwordReset.expiresAt': { $gt: new Date() },
    deletedAt: null,
  }).select('+passwordHash +passwordReset');

  if (!user) throw new AppError('Invalid or expired reset link', 400, 'INVALID_TOKEN');

  const isSame = await user.comparePassword(newPassword);
  if (isSame) throw new AppError('New password cannot be same as current password', 400);

  user.passwordHash = newPassword;
  user.passwordReset.tokenHash = null;
  user.passwordReset.expiresAt = null;
  await user.save();

  await sessionRepo.revokeAllByUser(user.tenantId, user._id);
  auditLogRepo.log({ tenantId: user.tenantId, userId: user._id, email: user.email, event: 'password_reset' });
}

// ─── Refresh Token ────────────────────────────────────────────────────────────
async function refreshTokens({ refreshToken, req }) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');
  }

  const session = await sessionRepo.findBySessionId(decoded.sessionId);

  if (!session) {
    const oldSession = await require('../../database/models/Session.model')
      .findOne({ sessionId: decoded.sessionId });
    if (oldSession) {
      await sessionRepo.revokeAllByUser(oldSession.tenantId, oldSession.userId);
    }
    throw new AppError('Session compromised. All sessions revoked.', 401, 'SESSION_COMPROMISED');
  }

  if (!sessionRepo.verifyTokenHash(session, refreshToken))
    throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');

  if (new Date() > session.expiresAt)
    throw new AppError('Session expired', 401, 'SESSION_EXPIRED');

  const user = await userRepo.findByIdRaw(session.userId);
  if (!user || user.status !== 'active') throw new AppError('User inactive', 403);

  const newSessionId = uuidv4();
  const { accessToken, refreshToken: newRefreshToken } = buildTokens(user, newSessionId);

  await sessionRepo.revokeBySessionId(session.sessionId);
  const expiresAt = new Date(session.expiresAt); // preserve original expiry window
  await sessionRepo.create({ tenantId: session.tenantId, userId: session.userId, sessionId: newSessionId, refreshToken: newRefreshToken, deviceInfo: getDeviceInfo(req), expiresAt });

  return { accessToken, refreshToken: newRefreshToken };
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout({ sessionId, tenantId, userId }) {
  await sessionRepo.revokeBySessionId(sessionId);
  auditLogRepo.log({ tenantId, userId, event: 'logout' });
}

async function logoutAll({ tenantId, userId }) {
  await sessionRepo.revokeAllByUser(tenantId, userId);
  auditLogRepo.log({ tenantId, userId, event: 'logout_all' });
}

async function checkSubdomain(subdomain) {
  const tenant = await tenantRepo.findBySubdomain(subdomain.toLowerCase().trim());
  return { available: !tenant, tenantName: tenant?.name ?? null };
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

function getGoogleAuthUrl({ subdomain }) {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const redirectUri  = process.env.GOOGLE_CALLBACK_URL || `${config.app.url}/auth/google/callback`;
  if (!clientId) throw new AppError('Google OAuth is not configured', 501, 'GOOGLE_NOT_CONFIGURED');

  const state = Buffer.from(JSON.stringify({ subdomain })).toString('base64');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}

async function loginWithGoogle({ code, redirectUri, tenantId, tenantSettings, tenantName, req }) {
  const redirectUriResolved = redirectUri || process.env.GOOGLE_CALLBACK_URL || `${config.app.url}/auth/google/callback`;
  const profile = await fetchGoogleProfile(code, redirectUriResolved);

  const deviceInfo = getDeviceInfo(req);

  // Try to find existing user by Google ID first, then by email
  let user = await userRepo.findByGoogleId(tenantId, profile.id);

  if (!user) {
    user = await userRepo.findByEmail(tenantId, profile.email);
    if (user) {
      // Link Google to existing account
      await userRepo.updateById(user._id, { googleId: profile.id });
    }
  }

  if (!user) {
    // Auto-register if tenant allows self-registration
    if (tenantSettings?.allowSelfRegistration === false)
      throw new AppError('Self-registration is disabled for this organisation', 403, 'REGISTRATION_DISABLED');

    user = await userRepo.create({
      tenantId,
      firstName: profile.given_name || profile.name?.split(' ')[0] || 'User',
      lastName:  profile.family_name || profile.name?.split(' ').slice(1).join(' ') || '',
      email:     profile.email.toLowerCase(),
      passwordHash: crypto.randomBytes(32).toString('hex'), // unusable random password
      googleId:  profile.id,
      role: 'student',
      status: 'active', // Google verifies email — skip verification
      avatar: profile.picture || null,
    });

    auditLogRepo.log({ tenantId, userId: user._id, email: user.email, event: 'login_google', ip: deviceInfo.ip, userAgent: deviceInfo.ua, meta: { action: 'registered' } });
  } else {
    if (user.status === 'suspended')
      throw new AppError('Account suspended. Contact support.', 403, 'ACCOUNT_SUSPENDED');

    await userRepo.updateById(user._id, { lastLoginAt: new Date() });
    auditLogRepo.log({ tenantId, userId: user._id, email: user.email, event: 'login_google', ip: deviceInfo.ip, userAgent: deviceInfo.ua });
  }

  const sessionId = uuidv4();
  const { accessToken, refreshToken } = buildTokens(user, sessionId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await sessionRepo.create({ tenantId, userId: user._id, sessionId, refreshToken, deviceInfo, expiresAt });

  return { accessToken, refreshToken, user: userPublic(user) };
}

// ─── 2FA / TOTP ───────────────────────────────────────────────────────────────

async function setup2FA({ userId, tenantId, tenantName }) {
  const user = await userRepo.findById(tenantId, userId);
  if (!user) throw new AppError('User not found', 404);
  if (user.twoFactor?.enabled) throw new AppError('Two-factor authentication is already enabled', 409, '2FA_ALREADY_ENABLED');

  const secret = speakeasy.generateSecret({
    name:   `${tenantName} (${user.email})`,
    issuer: tenantName,
    length: 20,
  });

  const { plain: backupCodes, hashed: hashedBackupCodes } = generateBackupCodes();

  // Store pending secret (not enabled until user verifies first TOTP code)
  await userRepo.updateById(user._id, {
    'twoFactor.pendingSecret': encrypt(secret.base32),
    'twoFactor.backupCodes':   hashedBackupCodes,
  });

  const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url, { width: 256, margin: 2 });

  return {
    qrDataUrl,                   // base64 PNG — render as <img src={qrDataUrl} />
    otpauthUrl:  secret.otpauth_url,
    secret:      secret.base32,   // for manual entry in authenticator app
    backupCodes,                  // shown ONCE — user must save these
  };
}

async function enable2FA({ userId, tenantId, code }) {
  const user = await userRepo.findByIdWith2FA(tenantId, userId);
  if (!user) throw new AppError('User not found', 404);
  if (user.twoFactor?.enabled) throw new AppError('Two-factor authentication is already enabled', 409, '2FA_ALREADY_ENABLED');

  const pendingSecret = decrypt(user.twoFactor?.pendingSecret);
  if (!pendingSecret) throw new AppError('No 2FA setup in progress. Call /auth/2fa/setup first.', 400, '2FA_NOT_SETUP');

  const isValid = speakeasy.totp.verify({ secret: pendingSecret, encoding: 'base32', token: code, window: 1 });
  if (!isValid) throw new AppError('Invalid authentication code', 400, 'INVALID_2FA_CODE');

  await userRepo.updateById(user._id, {
    'twoFactor.enabled':         true,
    'twoFactor.secretEncrypted': encrypt(pendingSecret),
    'twoFactor.pendingSecret':   null,
    'twoFactor.setupAt':         new Date(),
  });

  auditLogRepo.log({ tenantId, userId, event: '2fa_enabled' });

  return { message: 'Two-factor authentication enabled successfully.' };
}

async function disable2FA({ userId, tenantId, code }) {
  const user = await userRepo.findByIdWith2FA(tenantId, userId);
  if (!user) throw new AppError('User not found', 404);
  if (!user.twoFactor?.enabled) throw new AppError('Two-factor authentication is not enabled', 400, '2FA_NOT_ENABLED');

  const secret = decrypt(user.twoFactor.secretEncrypted);
  const isValid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });
  if (!isValid) throw new AppError('Invalid authentication code', 400, 'INVALID_2FA_CODE');

  await userRepo.updateById(user._id, {
    'twoFactor.enabled':          false,
    'twoFactor.secretEncrypted':  null,
    'twoFactor.pendingSecret':    null,
    'twoFactor.backupCodes':      [],
    'twoFactor.setupAt':          null,
  });

  auditLogRepo.log({ tenantId, userId, event: '2fa_disabled' });

  return { message: 'Two-factor authentication disabled.' };
}

// Called after login returns requiresTwoFactor: true
async function verify2FA({ tempToken, code, req }) {
  let decoded;
  try {
    decoded = verifyTempToken(tempToken);
  } catch {
    throw new AppError('Invalid or expired session. Please log in again.', 401, 'INVALID_TOKEN');
  }

  const userId   = decoded.sub;
  const tenantId = decoded.tenantId || null;

  const user = await userRepo.findByIdWith2FA(tenantId, userId);
  if (!user || user.status !== 'active') throw new AppError('User not found or inactive', 403);

  const secret  = decrypt(user.twoFactor.secretEncrypted);
  let isValid   = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });

  // Allow backup code as fallback
  if (!isValid) {
    const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
    const idx = (user.twoFactor.backupCodes || []).indexOf(codeHash);
    if (idx !== -1) {
      // Burn the backup code — single use
      const remaining = [...user.twoFactor.backupCodes];
      remaining.splice(idx, 1);
      await userRepo.updateById(user._id, { 'twoFactor.backupCodes': remaining });
      isValid = true;
    }
  }

  if (!isValid) {
    auditLogRepo.log({ tenantId, userId, event: '2fa_verify_failed', ip: req.ip });
    throw new AppError('Invalid authentication code', 400, 'INVALID_2FA_CODE');
  }

  await userRepo.updateById(user._id, { lastLoginAt: new Date() });

  const sessionId = uuidv4();
  const { accessToken, refreshToken } = buildTokens(user, sessionId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await sessionRepo.create({ tenantId, userId: user._id, sessionId, refreshToken, deviceInfo: getDeviceInfo(req), expiresAt });

  auditLogRepo.log({ tenantId, userId, event: 'login', ip: req.ip, userAgent: req.headers['user-agent'], meta: { method: '2fa' } });

  return { accessToken, refreshToken, user: userPublic(user) };
}

// ─── Password Policy (public — used by frontend registration form) ────────────
async function getPasswordPolicy(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  const policy = tenant?.settings?.passwordPolicy || {};
  return {
    minLength:        policy.minLength        ?? 8,
    requireUppercase: policy.requireUppercase ?? true,
    requireLowercase: policy.requireLowercase ?? true,
    requireNumbers:   policy.requireNumbers   ?? true,
    requireSymbols:   policy.requireSymbols   ?? false,
  };
}

// ─── Auth Audit Log (admin read) ─────────────────────────────────────────────
async function getAuthLogs({ tenantId, userId, event, limit = 50, skip = 0 }) {
  if (userId) return auditLogRepo.findByUser(tenantId, userId, { limit, skip });
  return auditLogRepo.findByTenant(tenantId, { event, limit, skip });
}

module.exports = {
  registerTenant,
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  refreshTokens,
  logout,
  logoutAll,
  checkSubdomain,
  // Google OAuth
  getGoogleAuthUrl,
  loginWithGoogle,
  // 2FA
  setup2FA,
  enable2FA,
  disable2FA,
  verify2FA,
  // Policy & logs
  getPasswordPolicy,
  getAuthLogs,
};
