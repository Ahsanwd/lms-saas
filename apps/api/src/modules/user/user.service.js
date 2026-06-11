const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp    = require('sharp');
const userRepo        = require('../../database/repositories/user.repository');
const sessionRepo     = require('../../database/repositories/session.repository');
const inviteRepo      = require('../../database/repositories/invite.repository');
const tenantRepo      = require('../../database/repositories/tenant.repository');
const { queueEmail }  = require('../../jobs/email.job');
const inviteTemplate  = require('../../services/email/templates/invite');
const AppError        = require('../../utils/AppError');
const config          = require('../../config');
const limitGuardSvc   = require('../../services/limitGuard/limitGuard.service');
const { UPLOAD_ROOT, getPublicUrl } = require('../../services/storage/storage.service');

const INVITE_EXPIRY_DEFAULT_HOURS = 72;
const INVITE_EXPIRY_MIN_HOURS     = 1;
const INVITE_EXPIRY_MAX_HOURS     = 720; // 30 days

function removeAvatarFile(avatarUrl) {
  try {
    const prefix = `${config.app.apiUrl}/uploads/`;
    if (!avatarUrl?.startsWith(prefix)) return;
    const rel  = avatarUrl.slice(prefix.length);
    const full = path.join(UPLOAD_ROOT, rel);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch { /* non-fatal */ }
}

// ─── List Users ───────────────────────────────────────────────────────────────
async function listUsers(tenantId, { role, status, search, page = 1, limit = 20 }) {
  const User = require('../../database/models/User.model');
  const filter = { tenantId, deletedAt: null };

  if (role)   filter.role   = role;
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName:  { $regex: search, $options: 'i' } },
      { email:     { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('firstName lastName email role status avatar lastLoginAt createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  return {
    users,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  };
}

// ─── Get User By ID ───────────────────────────────────────────────────────────
async function getUserById(tenantId, userId) {
  const user = await userRepo.findById(tenantId, userId);
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  return user;
}

// ─── Update Own Profile ───────────────────────────────────────────────────────
async function updateProfile(tenantId, userId, { firstName, lastName, timezone, language }) {
  const update = {};
  if (firstName) update.firstName = firstName.trim();
  if (lastName)  update.lastName  = lastName.trim();
  if (timezone)  update.timezone  = timezone;
  if (language)  update.language  = language;

  const user = await userRepo.updateById(userId, update);
  if (!user) throw new AppError('User not found', 404);
  return user;
}

// ─── Avatar Upload ────────────────────────────────────────────────────────────
async function uploadAvatar(tenantId, userId, fileBuffer) {
  const user = await userRepo.findById(tenantId, userId);
  if (!user) throw new AppError('User not found', 404);

  const dest = path.join(UPLOAD_ROOT, 'avatars');
  fs.mkdirSync(dest, { recursive: true });

  const fileName = `${uuidv4()}.jpg`;
  const filePath = path.join(dest, fileName);

  // Resize + center-crop to 256×256, output as optimised JPEG
  await sharp(fileBuffer)
    .resize(256, 256, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 85 })
    .toFile(filePath);

  const avatarUrl = getPublicUrl(filePath);

  // Remove old avatar file before updating DB
  if (user.avatar) removeAvatarFile(user.avatar);

  const updated = await userRepo.updateById(userId, { avatar: avatarUrl });
  return { avatar: avatarUrl, user: updated };
}

// ─── Avatar Delete ────────────────────────────────────────────────────────────
async function deleteAvatar(tenantId, userId) {
  const user = await userRepo.findById(tenantId, userId);
  if (!user) throw new AppError('User not found', 404);
  if (user.avatar) removeAvatarFile(user.avatar);
  await userRepo.updateById(userId, { avatar: null });
}

// ─── Change Own Password ──────────────────────────────────────────────────────
async function changePassword(tenantId, userId, { currentPassword, newPassword }) {
  const user = await require('../../database/models/User.model')
    .findOne({ _id: userId, tenantId, deletedAt: null })
    .select('+passwordHash');

  if (!user) throw new AppError('User not found', 404);

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new AppError('Current password is incorrect', 401, 'WRONG_PASSWORD');

  user.passwordHash = newPassword;
  await user.save();

  await sessionRepo.revokeAllByUser(tenantId, userId);
}

// ─── Update Role ──────────────────────────────────────────────────────────────
async function updateRole(tenantId, targetUserId, { role }, actingUser) {
  if (targetUserId.toString() === actingUser.sub)
    throw new AppError('You cannot change your own role', 400);

  const user = await userRepo.findById(tenantId, targetUserId);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'super_admin')
    throw new AppError('Super admin role cannot be modified', 403);

  await userRepo.updateById(targetUserId, { role });
  await sessionRepo.revokeAllByUser(tenantId, targetUserId);

  return { message: 'Role updated. User sessions revoked.' };
}

// ─── Suspend / Unsuspend ──────────────────────────────────────────────────────
async function suspendUser(tenantId, targetUserId, actingUser) {
  if (targetUserId.toString() === actingUser.sub)
    throw new AppError('You cannot suspend yourself', 400);

  const user = await userRepo.findById(tenantId, targetUserId);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'super_admin') throw new AppError('Cannot suspend super admin', 403);
  if (user.status === 'suspended') throw new AppError('User is already suspended', 400);

  await userRepo.updateById(targetUserId, { status: 'suspended' });
  await sessionRepo.revokeAllByUser(tenantId, targetUserId);
}

async function unsuspendUser(tenantId, targetUserId) {
  const user = await userRepo.findById(tenantId, targetUserId);
  if (!user) throw new AppError('User not found', 404);
  if (user.status !== 'suspended') throw new AppError('User is not suspended', 400);
  await userRepo.updateById(targetUserId, { status: 'active' });
}

// ─── Soft Delete User ─────────────────────────────────────────────────────────
async function deleteUser(tenantId, targetUserId, actingUserId) {
  if (targetUserId.toString() === actingUserId)
    throw new AppError('You cannot delete yourself', 400);

  const user = await userRepo.findById(tenantId, targetUserId);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'super_admin') throw new AppError('Cannot delete super admin', 403);

  await user.softDelete(actingUserId);
  await sessionRepo.revokeAllByUser(tenantId, targetUserId);
}

// ─── Invite User ──────────────────────────────────────────────────────────────
async function inviteUser(tenantId, { email, role, name, expiresInHours }, actingUser) {
  const hours = Math.min(
    Math.max(Number(expiresInHours) || INVITE_EXPIRY_DEFAULT_HOURS, INVITE_EXPIRY_MIN_HOURS),
    INVITE_EXPIRY_MAX_HOURS
  );

  const [existing, existingInvite, tenant] = await Promise.all([
    userRepo.findByEmail(tenantId, email),
    inviteRepo.findPendingByEmail(tenantId, email),
    tenantRepo.findById(tenantId),
  ]);

  if (existing) throw new AppError('A user with this email already exists', 409);

  await limitGuardSvc.assertUserLimit(tenantId, tenant.plan, role);

  if (existingInvite) await inviteRepo.revoke(existingInvite._id);

  const rawToken = crypto.randomBytes(32).toString('hex');
  await inviteRepo.create({ tenantId, email, role, name, rawToken, invitedBy: actingUser.sub, expiresInHours: hours });

  const inviter   = await userRepo.findByIdRaw(actingUser.sub);
  const inviteUrl = `${config.app.url}/accept-invite?token=${rawToken}&tenant=${tenant.subdomain}`;
  const template  = inviteTemplate({
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : 'Admin',
    tenantName:  tenant.name,
    branding: {
      logoUrl:      tenant.settings?.logo         || null,
      primaryColor: tenant.settings?.primaryColor || null,
    },
    role,
    inviteUrl,
    expiresInHours: hours,
  });

  await queueEmail({ to: email, ...template });
  return { message: `Invitation sent to ${email}` };
}

// ─── Accept Invite ────────────────────────────────────────────────────────────
async function acceptInvite(tenantId, { token, firstName, lastName, password }) {
  const invite = await inviteRepo.findByRawToken(token);
  if (!invite || invite.tenantId.toString() !== tenantId.toString())
    throw new AppError('Invalid or expired invitation', 400, 'INVALID_INVITE');

  if (new Date() > invite.expiresAt)
    throw new AppError('Invitation has expired', 400, 'INVITE_EXPIRED');

  const existing = await userRepo.findByEmail(tenantId, invite.email);
  if (existing) throw new AppError('An account with this email already exists', 409);

  await userRepo.create({
    tenantId,
    firstName: firstName.trim(),
    lastName:  lastName.trim(),
    email:     invite.email,
    passwordHash: password,
    role:      invite.role,
    status:    'active',
  });

  await inviteRepo.markAccepted(invite._id);
  return { message: 'Account created. You can now log in.' };
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
async function getUserSessions(tenantId, userId) {
  return sessionRepo.findAllByUser(tenantId, userId);
}

async function revokeUserSession(tenantId, targetUserId, sessionId, actingUser) {
  const Session = require('../../database/models/Session.model');
  const session = await Session.findOne({ sessionId, userId: targetUserId, tenantId });
  if (!session) throw new AppError('Session not found', 404);

  const isSelf  = targetUserId.toString() === actingUser.sub;
  const isAdmin = ['tenant_admin', 'super_admin'].includes(actingUser.role);
  if (!isSelf && !isAdmin) throw new AppError('Forbidden', 403);

  await sessionRepo.revokeBySessionId(sessionId);
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCsvText(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const parseRow = (line) => {
    const fields = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, ''));
  return lines.slice(1).map((line, idx) => {
    const values = parseRow(line);
    const row = { _row: idx + 2 };
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim(); });
    return row;
  });
}

// ─── CSV Dry-Run Preview (validates without creating any records) ─────────────
async function previewBulkImport(tenantId, csvText) {
  const rows = parseCsvText(csvText);
  if (!rows.length) throw new AppError('No valid rows found in CSV. Add a header row and at least one data row.', 400);

  const validator    = require('validator');
  const User         = require('../../database/models/User.model');
  const VALID_ROLES  = ['student', 'instructor', 'tenant_admin'];

  // Fetch all existing emails in this tenant once for O(1) duplicate checks
  const existingDocs = await User.find({ tenantId, deletedAt: null }).select('email').lean();
  const existingEmails = new Set(existingDocs.map(u => u.email.toLowerCase()));

  const valid   = [];
  const invalid = [];
  const seenInCsv = new Set(); // catch duplicates within the same CSV

  for (const row of rows) {
    const rowNum    = row._row;
    const firstName = (row.firstname || '').trim();
    const lastName  = (row.lastname  || '').trim();
    const email     = (row.email     || '').trim().toLowerCase();
    const role      = (row.role      || 'student').trim().toLowerCase();

    if (!firstName || !lastName) {
      invalid.push({ row: rowNum, email: email || '—', reason: 'firstName and lastName are required' });
      continue;
    }
    if (!email || !validator.isEmail(email)) {
      invalid.push({ row: rowNum, email: email || '—', reason: 'Invalid or missing email address' });
      continue;
    }
    if (!VALID_ROLES.includes(role)) {
      invalid.push({ row: rowNum, email, reason: `Invalid role "${role}". Use: student, instructor, tenant_admin` });
      continue;
    }
    if (existingEmails.has(email)) {
      invalid.push({ row: rowNum, email, reason: 'Email already registered in this organisation' });
      continue;
    }
    if (seenInCsv.has(email)) {
      invalid.push({ row: rowNum, email, reason: 'Duplicate email within this CSV file' });
      continue;
    }

    seenInCsv.add(email);
    valid.push({ row: rowNum, firstName, lastName, email, role });
  }

  return {
    total:        rows.length,
    validCount:   valid.length,
    invalidCount: invalid.length,
    valid,
    invalid,
  };
}

// ─── Bulk Import Users ────────────────────────────────────────────────────────
async function bulkImportUsers(tenantId, csvText, actingUser) {
  const rows = parseCsvText(csvText);
  if (!rows.length) throw new AppError('No valid rows found in CSV. Check the file has a header row and at least one data row.', 400);

  const validator   = require('validator');
  const VALID_ROLES = ['student', 'instructor', 'tenant_admin'];
  const results     = { imported: 0, failed: [] };

  for (const row of rows) {
    const rowNum    = row._row;
    const firstName = (row.firstname || '').trim();
    const lastName  = (row.lastname  || '').trim();
    const email     = (row.email     || '').trim().toLowerCase();
    const role      = (row.role      || 'student').trim().toLowerCase();

    if (!firstName || !lastName) {
      results.failed.push({ row: rowNum, email: email || '—', reason: 'firstName and lastName are required' });
      continue;
    }
    if (!email || !validator.isEmail(email)) {
      results.failed.push({ row: rowNum, email: email || '—', reason: 'Invalid or missing email address' });
      continue;
    }
    if (!VALID_ROLES.includes(role)) {
      results.failed.push({ row: rowNum, email, reason: `Invalid role "${role}". Allowed: student, instructor, tenant_admin` });
      continue;
    }

    try {
      await inviteUser(tenantId, { email, role, name: `${firstName} ${lastName}` }, actingUser);
      results.imported++;
    } catch (err) {
      results.failed.push({ row: rowNum, email, reason: err.message });
    }
  }

  return results;
}

// ─── Export Users as CSV ──────────────────────────────────────────────────────
async function exportUsers(tenantId, { role, status, search } = {}) {
  const User = require('../../database/models/User.model');
  const filter = { tenantId, deletedAt: null };
  if (role)   filter.role   = role;
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName:  { $regex: search, $options: 'i' } },
      { email:     { $regex: search, $options: 'i' } },
    ];
  }

  const users = await User.find(filter)
    .select('firstName lastName email role status createdAt lastLoginAt')
    .sort({ createdAt: -1 })
    .lean();

  const esc = (val) => {
    const s = String(val ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const fmtDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

  const header  = 'firstName,lastName,email,role,status,createdAt,lastLoginAt';
  const csvRows = users.map(u =>
    [esc(u.firstName), esc(u.lastName), esc(u.email), esc(u.role),
     esc(u.status), fmtDate(u.createdAt), fmtDate(u.lastLoginAt)].join(',')
  );

  return [header, ...csvRows].join('\n');
}

module.exports = {
  listUsers, getUserById,
  updateProfile,
  uploadAvatar, deleteAvatar,
  changePassword,
  updateRole, suspendUser, unsuspendUser, deleteUser,
  inviteUser, acceptInvite,
  getUserSessions, revokeUserSession,
  previewBulkImport, bulkImportUsers, exportUsers,
};
