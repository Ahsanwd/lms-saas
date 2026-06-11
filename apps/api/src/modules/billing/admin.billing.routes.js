const router = require('express').Router();
const ctrl = require('./admin.billing.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/permission.middleware');

router.use(authenticate);
router.use(requireRole('super_admin'));

// Plans
router.get('/plans', ctrl.listPlans);

// Subscriptions
router.get('/subscriptions', ctrl.listSubscriptions);
router.post('/subscriptions', ctrl.createSubscription);
router.patch('/subscriptions/:id/upgrade', ctrl.upgradePlan);
router.patch('/subscriptions/:id/downgrade', ctrl.downgradePlan);
router.patch('/subscriptions/:id/cancel', ctrl.cancelSubscription);
router.patch('/subscriptions/:id/renew', ctrl.renewSubscription);

// Invoices
router.get('/invoices', ctrl.listInvoices);
router.post('/invoices', ctrl.createInvoice);
router.get('/invoices/:id/download', ctrl.downloadInvoice);
router.patch('/invoices/:id/pay', ctrl.markPaid);
router.patch('/invoices/:id/cancel', ctrl.cancelInvoice);

// Coupons
router.get('/coupons', ctrl.listCoupons);
router.post('/coupons', ctrl.createCoupon);
router.patch('/coupons/:id', ctrl.updateCoupon);
router.delete('/coupons/:id', ctrl.deleteCoupon);

// Revenue analytics
router.get('/revenue', ctrl.getRevenueStats);

// Stripe webhook event log
router.get('/webhook-events', async (req, res, next) => {
  try {
    const { listWebhookEvents } = require('../webhook/stripe.webhook');
    const result = await listWebhookEvents({
      page:   req.query.page,
      limit:  req.query.limit,
      status: req.query.status,
      type:   req.query.type,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
