const router = require('express').Router();
const ctrl = require('./dashboard.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/permission.middleware');

router.use(authenticate);
router.use(requireRole('super_admin'));

router.get('/', ctrl.getSuperAdminDashboard);

module.exports = router;
