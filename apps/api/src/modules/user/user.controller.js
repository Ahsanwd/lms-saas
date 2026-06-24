const multer = require('multer');
const userService = require('./user.service');
const {
  validateUpdateProfile,
  validateChangePassword,
  validateInvite,
  validateUpdateRole,
  validateAcceptInvite,
} = require('../../validators/user.validator');
const R = require('../../utils/response');

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, or WebP images are allowed'), false);
    }
  },
});

async function list(req, res, next) {
  try {
    const { role, status, search, page, limit } = req.query;
    const result = await userService.listUsers(req.tenant.tenantId, {
      role, status, search, page, limit,
    });
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const user = await userService.getUserById(req.tenant.tenantId, req.params.id);
    R.success(res, { user });
  } catch (err) { next(err); }
}

async function updateMe(req, res, next) {
  try {
    const { firstName, lastName, timezone, language, avatar } = req.body;
    validateUpdateProfile({ firstName, lastName });
    const user = await userService.updateProfile(
      req.tenant.tenantId, req.user.sub, { firstName, lastName, timezone, language, avatar }
    );
    R.success(res, { user }, 'Profile updated');
  } catch (err) { next(err); }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    validateChangePassword({ currentPassword, newPassword });
    await userService.changePassword(req.tenant.tenantId, req.user.sub, {
      currentPassword, newPassword,
    });
    R.success(res, {}, 'Password changed. Please log in again.');
  } catch (err) { next(err); }
}

async function mySessions(req, res, next) {
  try {
    const sessions = await userService.getUserSessions(req.tenant.tenantId, req.user.sub);
    R.success(res, { sessions });
  } catch (err) { next(err); }
}

async function revokeMySession(req, res, next) {
  try {
    await userService.revokeUserSession(
      req.tenant.tenantId, req.user.sub, req.params.sessionId, req.user
    );
    R.success(res, {}, 'Session revoked');
  } catch (err) { next(err); }
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'Image file is required', 400);
    const result = await userService.uploadAvatar(
      req.tenant.tenantId, req.user.sub, req.file.buffer
    );
    R.success(res, { avatar: result.avatar }, 'Avatar updated');
  } catch (err) { next(err); }
}

async function deleteAvatar(req, res, next) {
  try {
    await userService.deleteAvatar(req.tenant.tenantId, req.user.sub);
    R.success(res, {}, 'Avatar removed');
  } catch (err) { next(err); }
}

async function invite(req, res, next) {
  try {
    const { email, role, name, expiresInHours } = req.body;
    validateInvite({ email, role });
    const result = await userService.inviteUser(
      req.tenant.tenantId, { email, role, name, expiresInHours }, req.user
    );
    R.created(res, { inviteUrl: result.inviteUrl }, result.message);
  } catch (err) { next(err); }
}

async function previewImport(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'CSV file is required', 400);
    const csvText = req.file.buffer.toString('utf-8');
    const result = await userService.previewBulkImport(req.tenant.tenantId, csvText);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function acceptInvite(req, res, next) {
  try {
    const { token, firstName, lastName, password } = req.body;
    if (!token) return R.error(res, 'Invite token is required', 400);
    validateAcceptInvite({ firstName, lastName, password });
    const result = await userService.acceptInvite(req.tenant.tenantId, { token, firstName, lastName, password });
    R.created(res, {}, result.message);
  } catch (err) { next(err); }
}

async function updateRole(req, res, next) {
  try {
    const { role } = req.body;
    validateUpdateRole({ role });
    const result = await userService.updateRole(
      req.tenant.tenantId, req.params.id, { role }, req.user
    );
    R.success(res, {}, result.message);
  } catch (err) { next(err); }
}

async function suspend(req, res, next) {
  try {
    await userService.suspendUser(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, {}, 'User suspended');
  } catch (err) { next(err); }
}

async function unsuspend(req, res, next) {
  try {
    await userService.unsuspendUser(req.tenant.tenantId, req.params.id);
    R.success(res, {}, 'User unsuspended');
  } catch (err) { next(err); }
}

async function deleteUser(req, res, next) {
  try {
    await userService.deleteUser(req.tenant.tenantId, req.params.id, req.user.sub);
    R.success(res, {}, 'User deleted');
  } catch (err) { next(err); }
}

async function getUserSessions(req, res, next) {
  try {
    const sessions = await userService.getUserSessions(req.tenant.tenantId, req.params.id);
    R.success(res, { sessions });
  } catch (err) { next(err); }
}

async function revokeUserSession(req, res, next) {
  try {
    await userService.revokeUserSession(
      req.tenant.tenantId, req.params.id, req.params.sessionId, req.user
    );
    R.success(res, {}, 'Session revoked');
  } catch (err) { next(err); }
}

async function bulkImport(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'CSV file is required', 400);
    const csvText = req.file.buffer.toString('utf-8');
    const result = await userService.bulkImportUsers(req.tenant.tenantId, csvText, req.user);
    R.success(res, result,
      `Import complete: ${result.imported} invited, ${result.failed.length} failed`
    );
  } catch (err) { next(err); }
}

async function exportCsv(req, res, next) {
  try {
    const { role, status, search } = req.query;
    const csv = await userService.exportUsers(req.tenant.tenantId, { role, status, search });
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="users-${date}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}

module.exports = {
  list, getById,
  updateMe, changePassword, mySessions, revokeMySession,
  avatarUpload, uploadAvatar, deleteAvatar,
  invite, acceptInvite,
  updateRole, suspend, unsuspend, deleteUser,
  getUserSessions, revokeUserSession,
  csvUpload, bulkImport, previewImport, exportCsv,
};
