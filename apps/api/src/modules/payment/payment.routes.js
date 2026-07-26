const router = require('express').Router();
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const { upload }            = require('../../services/storage/storage.service');
const ctrl = require('./payment.controller');

const uploadProofFile = upload('payment-proof').single('proof');

router.use(authenticate);

// My payment history
router.get('/my',                           ctrl.myPayments);
router.get('/:paymentId/receipt.pdf',       ctrl.receiptPdf);

// Saved payment methods
router.get('/methods',            ctrl.listMethods);
router.post('/methods/setup',     ctrl.setupIntent);
router.delete('/methods/:methodId', ctrl.deleteMethod);

// Course payment flow (student)
router.post('/courses/:courseId/initiate',          ctrl.initiate);
router.post('/courses/:courseId/trial',             ctrl.startTrial);
router.get('/courses/:courseId/trial',              ctrl.trialStatus);
router.post('/courses/:courseId/trial/upgrade',     ctrl.upgradeTrial);
router.post('/:paymentId/confirm',                  ctrl.confirm);
router.post('/:paymentId/proof',                    uploadProofFile, ctrl.submitProof);

// Bundle payment flow (student)
router.post('/bundles/:bundleId/initiate',          ctrl.initiateBundle);
router.post('/bundles/:paymentId/confirm',          ctrl.confirmBundle);
router.post('/bundles/:paymentId/proof',            uploadProofFile, ctrl.submitBundleProof);

// Admin
router.get('/courses/:courseId',                    requirePermission('course:manage'), ctrl.coursePayments);
router.post('/:paymentId/refund',                   requirePermission('course:manage'), ctrl.refund);
router.post('/bundles/:paymentId/refund',           requirePermission('course:manage'), ctrl.refundBundle);

// Admin — manual payment proof review
router.get('/manual',                               requirePermission('course:manage'), ctrl.pendingManual);
router.post('/:paymentId/approve',                  requirePermission('course:manage'), ctrl.approveManual);
router.post('/:paymentId/reject',                   requirePermission('course:manage'), ctrl.rejectManual);
router.get('/bundles/manual',                        requirePermission('course:manage'), ctrl.pendingManualBundle);
router.post('/bundles/:paymentId/approve',          requirePermission('course:manage'), ctrl.approveManualBundle);
router.post('/bundles/:paymentId/reject',           requirePermission('course:manage'), ctrl.rejectManualBundle);

module.exports = router;
