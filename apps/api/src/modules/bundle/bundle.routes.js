const router = require('express').Router();
const ctrl = require('./bundle.controller');
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');

router.use(authenticate);

// Student-facing catalog of published bundles for this tenant
router.get('/', ctrl.listPublic);

// Admin management
router.get(   '/admin',        requirePermission('course:manage'), ctrl.listAdmin);
router.post(  '/',             requirePermission('course:manage'), ctrl.create);
router.get(   '/:bundleId',    requirePermission('course:manage'), ctrl.getOne);
router.patch( '/:bundleId',    requirePermission('course:manage'), ctrl.update);
router.delete('/:bundleId',    requirePermission('course:manage'), ctrl.remove);

module.exports = router;
