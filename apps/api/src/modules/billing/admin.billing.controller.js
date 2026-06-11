const adminBillingService = require('./admin.billing.service');
const planRepo = require('../../database/repositories/plan.repository');
const { validateCreateSubscription, validateCreateInvoice, validateCreateCoupon } = require('../../validators/billing.validator');
const R = require('../../utils/response');

// ── Plans ─────────────────────────────────────────────────────────────────────
async function listPlans(req, res, next) {
  try {
    const plans = await planRepo.findAll();
    R.success(res, { plans });
  } catch (err) { next(err); }
}

// ── Subscriptions ─────────────────────────────────────────────────────────────
async function listSubscriptions(req, res, next) {
  try {
    const result = await adminBillingService.listSubscriptions(req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function createSubscription(req, res, next) {
  try {
    validateCreateSubscription(req.body);
    const sub = await adminBillingService.createSubscription(req.body, req.user.sub);
    R.created(res, { subscription: sub }, 'Subscription created');
  } catch (err) { next(err); }
}

async function upgradePlan(req, res, next) {
  try {
    const result = await adminBillingService.upgradePlan(req.params.id, req.body, req.user.sub);
    R.success(res, result || {}, 'Plan upgraded');
  } catch (err) { next(err); }
}

async function downgradePlan(req, res, next) {
  try {
    const result = await adminBillingService.downgradePlan(req.params.id, req.body, req.user.sub);
    R.success(res, result, result?.message || 'Plan downgraded');
  } catch (err) { next(err); }
}

async function cancelSubscription(req, res, next) {
  try {
    await adminBillingService.cancelSubscription(req.params.id, req.body, req.user.sub);
    R.success(res, {}, 'Subscription cancelled');
  } catch (err) { next(err); }
}

async function renewSubscription(req, res, next) {
  try {
    await adminBillingService.renewSubscription(req.params.id, req.body, req.user.sub);
    R.success(res, {}, 'Subscription renewed');
  } catch (err) { next(err); }
}

// ── Invoices ──────────────────────────────────────────────────────────────────
async function listInvoices(req, res, next) {
  try {
    const result = await adminBillingService.listInvoices(req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function createInvoice(req, res, next) {
  try {
    validateCreateInvoice(req.body);
    const invoice = await adminBillingService.createInvoice(req.body, req.user.sub);
    R.created(res, { invoice }, 'Invoice created');
  } catch (err) { next(err); }
}

async function markPaid(req, res, next) {
  try {
    const invoice = await adminBillingService.markInvoicePaid(req.params.id, req.body, req.user.sub);
    R.success(res, { invoice }, 'Invoice marked as paid');
  } catch (err) { next(err); }
}

async function cancelInvoice(req, res, next) {
  try {
    const invoice = await adminBillingService.cancelInvoice(req.params.id, req.user.sub);
    R.success(res, { invoice }, 'Invoice cancelled');
  } catch (err) { next(err); }
}

// ── Coupons ───────────────────────────────────────────────────────────────────
async function listCoupons(req, res, next) {
  try {
    const result = await adminBillingService.listCoupons(req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function createCoupon(req, res, next) {
  try {
    validateCreateCoupon(req.body);
    const coupon = await adminBillingService.createCoupon(req.body, req.user.sub);
    R.created(res, { coupon }, 'Coupon created');
  } catch (err) { next(err); }
}

async function updateCoupon(req, res, next) {
  try {
    const coupon = await adminBillingService.updateCoupon(req.params.id, req.body, req.user.sub);
    R.success(res, { coupon }, 'Coupon updated');
  } catch (err) { next(err); }
}

async function deleteCoupon(req, res, next) {
  try {
    await adminBillingService.deleteCoupon(req.params.id, req.user.sub);
    R.success(res, {}, 'Coupon deleted');
  } catch (err) { next(err); }
}

// ── Revenue ───────────────────────────────────────────────────────────────────
async function getRevenueStats(req, res, next) {
  try {
    const data = await adminBillingService.getRevenueStats(req.query);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function downloadInvoice(req, res, next) {
  try {
    const invoice = await adminBillingService.getInvoiceById(req.params.id);
    if (!invoice) return R.error(res, 'Invoice not found', 404);
    const { generateInvoicePdf } = require('../../services/pdf/invoice.pdf');
    const pdf = await generateInvoicePdf(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
}

module.exports = {
  listPlans,
  listSubscriptions, createSubscription, upgradePlan, downgradePlan,
  cancelSubscription, renewSubscription,
  listInvoices, createInvoice, markPaid, cancelInvoice, downloadInvoice,
  listCoupons, createCoupon, updateCoupon, deleteCoupon,
  getRevenueStats,
};
