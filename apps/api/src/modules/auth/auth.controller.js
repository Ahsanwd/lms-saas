const authService = require('./auth.service');
const tenantRepo = require('../../database/repositories/tenant.repository');
const { validateRegister, validateLogin, validateResetPassword } = require('../../validators/auth.validator');
const R = require('../../utils/response');

async function registerTenant(req, res, next) {
  try {
    const { firstName, lastName, email, password, tenantName, subdomain, recaptchaToken } = req.body;
    if (!firstName || !lastName || !email || !password || !tenantName || !subdomain)
      return R.error(res, 'All fields are required', 400);

    const result = await authService.registerTenant({
      firstName, lastName, email, password, tenantName, subdomain, recaptchaToken, req,
    });
    R.created(res, result, 'Account created successfully');
  } catch (err) { next(err); }
}

async function register(req, res, next) {
  try {
    const { firstName, lastName, email, password } = req.body;
    const passwordPolicy = req.tenant.settings?.passwordPolicy;
    validateRegister({ firstName, lastName, email, password }, passwordPolicy);

    const tenant = await tenantRepo.findById(req.tenant.tenantId);
    const result = await authService.register({
      firstName, lastName, email, password,
      tenantId: req.tenant.tenantId,
      tenantName: tenant.name,
      settings: req.tenant.settings,
      req,
    });
    R.created(res, result, result.message);
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password, rememberMe = false } = req.body;
    validateLogin({ email, password });

    const result = await authService.login({
      email, password,
      rememberMe: Boolean(rememberMe),
      tenantId: req.tenant?.tenantId ?? null,
      req,
    });
    R.success(res, result, result.requiresTwoFactor ? '2FA required' : 'Login successful');
  } catch (err) { next(err); }
}

async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) return R.error(res, 'Token is required', 400);

    const tenantId = req.tenant?.tenantId || null;
    const result = await authService.verifyEmail({ token, tenantId, req });
    R.success(res, result, 'Email verified successfully');
  } catch (err) { next(err); }
}

async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return R.error(res, 'Email is required', 400);

    const tenant = await tenantRepo.findById(req.tenant.tenantId);
    await authService.resendVerification({
      email,
      tenantId: req.tenant.tenantId,
      tenantName: tenant.name,
    });
    R.success(res, {}, 'If your email is registered, a verification link has been sent.');
  } catch (err) { next(err); }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const tenant = await tenantRepo.findById(req.tenant.tenantId);
    await authService.forgotPassword({
      email,
      tenantId: req.tenant.tenantId,
      tenantName: tenant.name,
    });
    R.success(res, {}, 'If your email is registered, a reset link has been sent.');
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { token, newPassword, password: bodyPassword } = req.body;
    const password = newPassword || bodyPassword;
    if (!token) return R.error(res, 'Token is required', 400);

    const passwordPolicy = req.tenant?.settings?.passwordPolicy;
    validateResetPassword({ password }, passwordPolicy);

    const tenantId = req.tenant?.tenantId || null;
    await authService.resetPassword({ token, newPassword: password, tenantId });
    R.success(res, {}, 'Password reset successfully. Please log in.');
  } catch (err) { next(err); }
}

async function refresh(req, res, next) {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) return R.unauthorized(res, 'Refresh token required');

    const result = await authService.refreshTokens({ refreshToken, req });
    R.success(res, result, 'Token refreshed');
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    await authService.logout({
      sessionId: req.user.sessionId,
      tenantId:  req.user.tenantId,
      userId:    req.user.sub,
    });
    R.success(res, {}, 'Logged out successfully');
  } catch (err) { next(err); }
}

async function logoutAll(req, res, next) {
  try {
    await authService.logoutAll({ tenantId: req.user.tenantId, userId: req.user.sub });
    R.success(res, {}, 'All sessions revoked');
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const userRepo = require('../../database/repositories/user.repository');
    const user = req.user.role === 'super_admin'
      ? await userRepo.findByIdRaw(req.user.sub)
      : await userRepo.findById(req.user.tenantId, req.user.sub);
    if (!user) return R.notFound(res, 'User not found');
    R.success(res, {
      _id: user._id,
      tenantId: user.tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      lastLoginAt: user.lastLoginAt,
      twoFactorEnabled: user.twoFactor?.enabled || false,
    });
  } catch (err) { next(err); }
}

async function checkSubdomain(req, res, next) {
  try {
    const { subdomain } = req.query;
    if (!subdomain) return R.error(res, 'subdomain is required', 400);
    const result = await authService.checkSubdomain(subdomain);
    R.success(res, result);
  } catch (err) { next(err); }
}

// ─── Password Policy ──────────────────────────────────────────────────────────
async function getPasswordPolicy(req, res, next) {
  try {
    const result = await authService.getPasswordPolicy(req.tenant.tenantId);
    R.success(res, result);
  } catch (err) { next(err); }
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────
async function googleAuthUrl(req, res, next) {
  try {
    const subdomain = req.tenant?.subdomain || req.query.subdomain || '';
    const result = authService.getGoogleAuthUrl({ subdomain });
    R.success(res, result);
  } catch (err) { next(err); }
}

async function googleCallback(req, res, next) {
  try {
    const { code, redirectUri } = req.body;
    if (!code) return R.error(res, 'Authorization code is required', 400);

    const tenant = await tenantRepo.findById(req.tenant.tenantId);
    const result = await authService.loginWithGoogle({
      code,
      redirectUri,
      tenantId:      req.tenant.tenantId,
      tenantSettings: req.tenant.settings,
      tenantName:    tenant.name,
      req,
    });
    R.success(res, result, 'Login successful');
  } catch (err) { next(err); }
}

// ─── 2FA / TOTP ───────────────────────────────────────────────────────────────
async function setup2FA(req, res, next) {
  try {
    const tenant = await tenantRepo.findById(req.user.tenantId);
    const result = await authService.setup2FA({
      userId:     req.user.sub,
      tenantId:   req.user.tenantId,
      tenantName: tenant?.name || 'LMS',
    });
    R.success(res, result, '2FA setup initiated. Scan the QR code and verify with /auth/2fa/enable.');
  } catch (err) { next(err); }
}

async function enable2FA(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return R.error(res, 'Authentication code is required', 400);

    const result = await authService.enable2FA({
      userId:   req.user.sub,
      tenantId: req.user.tenantId,
      code,
    });
    R.success(res, result);
  } catch (err) { next(err); }
}

async function disable2FA(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return R.error(res, 'Authentication code is required', 400);

    const result = await authService.disable2FA({
      userId:   req.user.sub,
      tenantId: req.user.tenantId,
      code,
    });
    R.success(res, result);
  } catch (err) { next(err); }
}

async function verify2FA(req, res, next) {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) return R.error(res, 'tempToken and code are required', 400);

    const result = await authService.verify2FA({ tempToken, code, req });
    R.success(res, result, 'Login successful');
  } catch (err) { next(err); }
}

// ─── Auth Audit Logs (tenant_admin only) ─────────────────────────────────────
async function getAuthLogs(req, res, next) {
  try {
    const { userId, event, limit = 50, skip = 0 } = req.query;
    const result = await authService.getAuthLogs({
      tenantId: req.user.tenantId,
      userId:   userId || null,
      event:    event  || null,
      limit:    Math.min(Number(limit) || 50, 200),
      skip:     Number(skip) || 0,
    });
    R.success(res, result);
  } catch (err) { next(err); }
}

module.exports = {
  registerTenant, register, login,
  verifyEmail, resendVerification,
  forgotPassword, resetPassword,
  refresh, logout, logoutAll, me,
  checkSubdomain, getPasswordPolicy,
  googleAuthUrl, googleCallback,
  setup2FA, enable2FA, disable2FA, verify2FA,
  getAuthLogs,
};
