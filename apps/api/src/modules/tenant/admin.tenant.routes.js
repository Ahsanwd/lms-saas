const router = require('express').Router();
const ctrl = require('./admin.tenant.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/permission.middleware');

// All admin tenant routes require super_admin role
router.use(authenticate);
router.use(requireRole('super_admin'));

router.get('/', ctrl.listTenants);
router.post('/', ctrl.createTenant);
router.get('/:id', ctrl.getTenant);
router.get('/:id/stats', ctrl.getTenantStats);
router.patch('/:id', ctrl.updateTenant);
router.patch('/:id/suspend', ctrl.suspendTenant);
router.patch('/:id/restore', ctrl.restoreTenant);
router.delete('/:id', ctrl.deleteTenant);
router.patch('/:id/plan', ctrl.changePlan);

module.exports = router;
