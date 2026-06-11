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

// Failed email log (tenant_admin only)
router.get('/failed-emails',    requirePermission('tenant:manage'), ctrl.getFailedEmails);

module.exports = router;
