const billingService = require('./billing.service');
const R = require('../../utils/response');

async function getMySubscription(req, res, next) {
  try {
    const sub = await billingService.getMySubscription(req.tenant.tenantId);
    R.success(res, { subscription: sub });
  } catch (err) { next(err); }
}

async function getMyInvoices(req, res, next) {
  try {
    const result = await billingService.getMyInvoices(req.tenant.tenantId, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getInvoice(req, res, next) {
  try {
    const invoice = await billingService.getInvoice(req.tenant.tenantId, req.params.id);
    R.success(res, { invoice });
  } catch (err) { next(err); }
}

async function getPlans(req, res, next) {
  try {
    const plans = await billingService.getAvailablePlans();
    R.success(res, { plans });
  } catch (err) { next(err); }
}

async function createLsCheckout(req, res, next) {
  try {
    const { planSlug, billingCycle } = req.body;
    if (!planSlug || !billingCycle) return R.error(res, 'planSlug and billingCycle are required', 400);
    if (!['basic', 'pro'].includes(planSlug)) return R.error(res, 'Invalid plan', 400);
    if (!['monthly', 'yearly'].includes(billingCycle)) return R.error(res, 'Invalid billing cycle', 400);
    const result = await billingService.createLsCheckout(req.tenant.tenantId, { planSlug, billingCycle });
    R.success(res, result);
  } catch (err) { next(err); }
}

async function createLsTopupCheckout(req, res, next) {
  try {
    const { topupType } = req.body;
    if (!['storage_500', 'viewer_5000'].includes(topupType)) return R.error(res, 'Invalid top-up type', 400);
    const result = await billingService.createLsTopupCheckout(req.tenant.tenantId, topupType);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function validateCoupon(req, res, next) {
  try {
    const { code, planId } = req.body;
    if (!code) return R.error(res, 'Coupon code is required', 400);
    const result = await billingService.validateCoupon(req.tenant.tenantId, code, planId);
    R.success(res, result, 'Coupon is valid');
  } catch (err) { next(err); }
}

async function upgradePlan(req, res, next) {
  try {
    const { planId, billingCycle, couponCode } = req.body;
    if (!planId) return R.error(res, 'planId is required', 400);
    const result = await billingService.upgradePlan(req.tenant.tenantId, { planId, billingCycle, couponCode });
    R.success(res, result, result.requiresPayment ? 'Payment required' : 'Plan upgraded successfully');
  } catch (err) { next(err); }
}

async function confirmSubscriptionPayment(req, res, next) {
  try {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) return R.error(res, 'paymentIntentId is required', 400);
    const result = await billingService.confirmSubscriptionPayment(req.tenant.tenantId, paymentIntentId);
    R.success(res, result, 'Subscription activated');
  } catch (err) { next(err); }
}

async function createPortalSession(req, res, next) {
  try {
    const result = await billingService.createPortalSession(req.tenant.tenantId);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function downloadInvoice(req, res, next) {
  try {
    const { pdf, invoice } = await billingService.downloadInvoice(req.tenant.tenantId, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
}

async function getBillingInfo(req, res, next) {
  try {
    const result = await billingService.getBillingInfo(req.tenant.tenantId);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function listPaymentMethods(req, res, next) {
  try {
    const result = await billingService.listPaymentMethods(req.tenant.tenantId);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function deletePaymentMethod(req, res, next) {
  try {
    const result = await billingService.deletePaymentMethod(req.tenant.tenantId, req.params.pmId);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function reactivatePlan(req, res, next) {
  try {
    const { billingCycle, couponCode } = req.body;
    const result = await billingService.reactivatePlan(req.tenant.tenantId, { billingCycle, couponCode });
    R.success(res, result, result.requiresPayment ? 'Payment required' : 'Subscription reactivated');
  } catch (err) { next(err); }
}

module.exports = {
  getMySubscription, getMyInvoices, getInvoice, getPlans,
  validateCoupon, upgradePlan, reactivatePlan, confirmSubscriptionPayment,
  createPortalSession, downloadInvoice,
  getBillingInfo, listPaymentMethods, deletePaymentMethod,
  createLsCheckout, createLsTopupCheckout,
};
