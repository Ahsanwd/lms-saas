const router = require('express').Router();
const { authenticate }       = require('../../middlewares/auth.middleware');
const { requirePermission }  = require('../../middlewares/permission.middleware');
const ctrl = require('./refundRequest.controller');

router.use(authenticate);

// Student
router.post('/',     ctrl.request);
router.get('/my',    ctrl.myRequests);

// Admin
router.get('/',                          requirePermission('course:manage'), ctrl.list);
router.post('/:requestId/approve',       requirePermission('course:manage'), ctrl.approve);
router.post('/:requestId/reject',        requirePermission('course:manage'), ctrl.reject);

module.exports = router;
