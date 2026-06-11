const router = require('express').Router();
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const ctrl = require('./payment.controller');

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
router.post('/:paymentId/paypal-capture',            ctrl.capturePaypal);

// PayPal subscriptions (membership billing)
router.post('/paypal/subscription',                        ctrl.initiatePaypalSubscription);
router.delete('/paypal/subscription/:subscriptionId',      ctrl.cancelPaypalSubscription);

// Admin
router.get('/courses/:courseId',                    requirePermission('course:manage'), ctrl.coursePayments);
router.post('/:paymentId/refund',                   requirePermission('course:manage'), ctrl.refund);

module.exports = router;
