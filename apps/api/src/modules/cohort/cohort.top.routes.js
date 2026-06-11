const router = require('express').Router();
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const ctrl = require('./cohort.controller');

router.use(authenticate);
router.use(requirePermission('course:manage'));

router.get('/',                                    ctrl.listAll);
router.get('/:cohortId',                           ctrl.getOne);
router.get('/:cohortId/students',                  ctrl.students);
router.post('/:cohortId/enroll',                   ctrl.enroll);
router.post('/:cohortId/students/:userId/graduate', ctrl.graduate);
router.post('/:cohortId/graduate-all',             ctrl.graduateAll);
router.get('/:cohortId/report',                    ctrl.report);
router.patch('/:cohortId',                         ctrl.update);
router.delete('/:cohortId',                        ctrl.remove);

module.exports = router;
