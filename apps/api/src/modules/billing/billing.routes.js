const router = require('express').Router();
const ctrl = require('./billing.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');

router.use(authenticate);

router.get('/plans', ctrl.getPlans);
router.get('/info',         requirePermission('billing:read'), ctrl.getBillingInfo);
router.get('/subscription', requirePermission('billing:read'), ctrl.getMySubscription);
router.get('/invoices', requirePermission('billing:read'), ctrl.getMyInvoices);
router.get('/invoices/:id', requirePermission('billing:read'), ctrl.getInvoice);
router.get('/invoices/:id/download', requirePermission('billing:read'), ctrl.downloadInvoice);
router.post('/coupons/validate', requirePermission('billing:read'), ctrl.validateCoupon);
router.post('/subscription/upgrade',                requirePermission('billing:read'), ctrl.upgradePlan);
router.post('/subscription/reactivate',             requirePermission('billing:read'), ctrl.reactivatePlan);
router.post('/subscription/payment/confirm',        requirePermission('billing:read'), ctrl.confirmSubscriptionPayment);
router.post('/portal-session',                      requirePermission('billing:read'), ctrl.createPortalSession);
router.get('/payment-methods',                      requirePermission('billing:read'), ctrl.listPaymentMethods);
router.delete('/payment-methods/:pmId',             requirePermission('billing:read'), ctrl.deletePaymentMethod);
router.post('/ls/checkout',                         requirePermission('billing:read'), ctrl.createLsCheckout);

module.exports = router;
