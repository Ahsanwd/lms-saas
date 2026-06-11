const router = require('express').Router();
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const ctrl = require('./stripeConnect.controller');

router.use(authenticate);

// Any authenticated user can read the connection status
router.get('/status',      ctrl.getStatus);

// Only tenant admins can connect / disconnect
router.get('/auth-url',    requirePermission('course:manage'), ctrl.getAuthUrl);
router.post('/callback',   requirePermission('course:manage'), ctrl.exchangeToken);
router.delete('/disconnect', requirePermission('course:manage'), ctrl.disconnect);

module.exports = router;
