const router = require('express').Router();
const ctrl = require('./user.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requirePermission, requireRole } = require('../../middlewares/permission.middleware');
const { guardUserLimit } = require('../../middlewares/limitGuard.middleware');

// Public routes (no auth required)
router.post('/invite/accept', ctrl.acceptInvite);

// All routes below require authentication
router.use(authenticate);

// ── Self ──────────────────────────────────────────────────────────────────────
router.patch('/me', ctrl.updateMe);
router.patch('/me/password', ctrl.changePassword);
router.get('/me/sessions', ctrl.mySessions);
router.delete('/me/sessions/:sessionId', ctrl.revokeMySession);
router.post('/me/avatar', ctrl.avatarUpload.single('avatar'), ctrl.uploadAvatar);
router.delete('/me/avatar', ctrl.deleteAvatar);

// ── Invite ────────────────────────────────────────────────────────────────────
router.post('/invite', requirePermission('user:manage'), guardUserLimit(), ctrl.invite);

// ── Bulk Import / Export ───────────────────────────────────────────────────────
router.post('/bulk-import/preview', requirePermission('user:manage'), ctrl.csvUpload.single('file'), ctrl.previewImport);
router.post('/bulk-import', requirePermission('user:manage'), ctrl.csvUpload.single('file'), ctrl.bulkImport);
router.get('/export', requirePermission('user:read'), ctrl.exportCsv);

// ── Admin — User Management ───────────────────────────────────────────────────
router.get('/', requirePermission('user:read'), ctrl.list);
router.get('/:id', requirePermission('user:read'), ctrl.getById);
router.patch('/:id/role', requirePermission('user:manage'), ctrl.updateRole);
router.patch('/:id/suspend', requirePermission('user:manage'), ctrl.suspend);
router.patch('/:id/unsuspend', requirePermission('user:manage'), ctrl.unsuspend);
router.delete('/:id', requirePermission('user:delete'), ctrl.deleteUser);

// ── Admin — Session Management ────────────────────────────────────────────────
router.get('/:id/sessions', requirePermission('user:manage'), ctrl.getUserSessions);
router.delete('/:id/sessions/:sessionId', requirePermission('user:manage'), ctrl.revokeUserSession);

module.exports = router;
