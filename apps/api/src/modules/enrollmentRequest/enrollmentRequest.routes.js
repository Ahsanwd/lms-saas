const router = require('express').Router({ mergeParams: true });
const { authenticate }       = require('../../middlewares/auth.middleware');
const { requirePermission }  = require('../../middlewares/permission.middleware');
const ctrl = require('./enrollmentRequest.controller');

router.use(authenticate);

// Student routes — per course
router.post('/my',  ctrl.submit);
router.get('/my',   ctrl.myRequest);

// Admin/Instructor — list + decide
router.get('/',                            requirePermission('course:manage'), ctrl.list);
router.patch('/:requestId/approve',        requirePermission('course:manage'), ctrl.approve);
router.patch('/:requestId/reject',         requirePermission('course:manage'), ctrl.reject);

module.exports = router;
