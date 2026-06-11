const router = require('express').Router();
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const ctrl = require('./analytics.controller');

router.use(authenticate);

// Tenant admin + instructor
router.get('/courses',              requirePermission('course:read'),    ctrl.courseReport);

// Tenant admin only
router.get('/students',             requirePermission('user:read'),      ctrl.studentReport);
router.get('/revenue',              requirePermission('billing:read'),   ctrl.revenueReport);
router.get('/instructor-earnings',  requirePermission('user:read'),      ctrl.instructorEarnings);
router.get('/engagement',           requirePermission('course:read'),    ctrl.engagementReport);

module.exports = router;
