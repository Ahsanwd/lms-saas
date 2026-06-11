const router = require('express').Router({ mergeParams: true });
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const ctrl = require('./cohort.controller');

router.use(authenticate);
router.use(requirePermission('course:manage'));

router.get('/',                          ctrl.list);
router.post('/',                         ctrl.create);
router.patch('/:cohortId',              ctrl.update);
router.delete('/:cohortId',             ctrl.remove);
router.post('/:cohortId/enroll',        ctrl.enroll);
router.get('/:cohortId/students',       ctrl.students);

module.exports = router;
