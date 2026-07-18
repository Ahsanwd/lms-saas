const router = require('express').Router();
const { authenticate }  = require('../../middlewares/auth.middleware');
const { requireRole }   = require('../../middlewares/permission.middleware');
const ctrl = require('./refundRequest.controller');

router.use(authenticate);

// Student
router.post('/',     ctrl.request);
router.get('/my',    ctrl.myRequests);

// Admin — financial action (triggers a real refund + exposes tenant-wide
// payment data), so this is tenant_admin-only, not course:manage (which
// instructors also hold for legitimate course-editing purposes).
router.get('/',                          requireRole('tenant_admin'), ctrl.list);
router.post('/:requestId/approve',       requireRole('tenant_admin'), ctrl.approve);
router.post('/:requestId/reject',        requireRole('tenant_admin'), ctrl.reject);

module.exports = router;
