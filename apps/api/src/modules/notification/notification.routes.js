const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const ctrl = require('./notification.controller');

router.use(authenticate);

router.get('/',                 ctrl.listNotifications);
router.get('/grouped',          ctrl.listGrouped);
router.get('/unread-count',     ctrl.getUnreadCount);
router.patch('/read-all',       ctrl.markAllRead);
router.patch('/:id/read',       ctrl.markRead);
router.delete('/:id',           ctrl.deleteNotification);

// Notification preferences (every authenticated user)
router.get('/preferences',      ctrl.getPreferences);
router.patch('/preferences',    ctrl.updatePreferences);

// Failed email log (tenant_admin only) — was gated on 'tenant:manage', a
// permission string that exists nowhere in config/permissions.js (not even
// tenant_admin has it), making this endpoint completely unreachable by any
// tenant-scoped role. Confirmed live: tenant_admin itself got "Permission
// denied: tenant:manage". Switched to 'settings:manage', the existing
// tenant_admin-only permission that already fits "tenant-wide admin
// visibility" (same intent as billing:manage/analytics:manage above it).
router.get('/failed-emails',    requirePermission('settings:manage'), ctrl.getFailedEmails);

module.exports = router;
