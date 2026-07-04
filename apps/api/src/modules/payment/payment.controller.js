const svc = require('./payment.service');
const trialSvc = require('../course/trial.service');
const bundleSvc = require('../bundle/bundle.service');
const R = require('../../utils/response');

async function initiate(req, res, next) {
  try {
    const result = await svc.initiatePayment(
      req.tenant.tenantId, req.params.courseId, req.user.sub, req.body
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function confirm(req, res, next) {
  try {
    const result = await svc.confirmPayment(
      req.tenant.tenantId, req.params.paymentId, req.user.sub
    );
    R.success(res, result, 'Payment confirmed — enrollment created');
  } catch (err) { next(err); }
}

async function refund(req, res, next) {
  try {
    const payment = await svc.refundPayment(
      req.tenant.tenantId, req.params.paymentId, req.user.sub, req.body
    );
    R.success(res, { payment }, 'Payment refunded');
  } catch (err) { next(err); }
}

async function myPayments(req, res, next) {
  try {
    const result = await svc.getMyPayments(req.tenant.tenantId, req.user.sub, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function coursePayments(req, res, next) {
  try {
    const result = await svc.getCoursePayments(req.tenant.tenantId, req.params.courseId, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

// ── Trial endpoints ───────────────────────────────────────────────────────────
async function startTrial(req, res, next) {
  try {
    const enrollment = await trialSvc.startTrial(
      req.tenant.tenantId, req.params.courseId, req.user.sub
    );
    R.created(res, { enrollment }, 'Trial started');
  } catch (err) { next(err); }
}

async function upgradeTrial(req, res, next) {
  try {
    const enrollment = await trialSvc.upgradeTrial(
      req.tenant.tenantId, req.params.courseId, req.user.sub
    );
    R.success(res, { enrollment }, 'Upgraded to full access');
  } catch (err) { next(err); }
}

async function trialStatus(req, res, next) {
  try {
    const status = await trialSvc.getTrialStatus(
      req.tenant.tenantId, req.params.courseId, req.user.sub
    );
    R.success(res, { trial: status });
  } catch (err) { next(err); }
}

async function listMethods(req, res, next) {
  try {
    const methods = await svc.getPaymentMethods(req.user.sub, req.tenant.tenantId);
    R.success(res, { methods });
  } catch (err) { next(err); }
}

async function setupIntent(req, res, next) {
  try {
    const result = await svc.createSetupIntent(req.user.sub, req.tenant.tenantId);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function deleteMethod(req, res, next) {
  try {
    const result = await svc.deletePaymentMethod(req.user.sub, req.tenant.tenantId, req.params.methodId);
    R.success(res, result, 'Payment method removed');
  } catch (err) { next(err); }
}

// ── Bundle checkout ───────────────────────────────────────────────────────────
async function initiateBundle(req, res, next) {
  try {
    const result = await bundleSvc.initiateBundlePayment(
      req.tenant.tenantId, req.params.bundleId, req.user.sub, req.body
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function confirmBundle(req, res, next) {
  try {
    const result = await bundleSvc.confirmBundlePayment(
      req.tenant.tenantId, req.params.paymentId, req.user.sub
    );
    R.success(res, result, 'Payment confirmed — enrolled in all bundle courses');
  } catch (err) { next(err); }
}

async function refundBundle(req, res, next) {
  try {
    const payment = await bundleSvc.refundBundlePayment(
      req.tenant.tenantId, req.params.paymentId, req.user.sub, req.body
    );
    R.success(res, { payment }, 'Bundle payment refunded');
  } catch (err) { next(err); }
}

async function receiptPdf(req, res, next) {
  try {
    await svc.generateReceiptPdf(
      req.tenant.tenantId, req.params.paymentId, req.user.sub, res
    );
  } catch (err) { next(err); }
}

module.exports = {
  initiate, confirm, refund, myPayments, coursePayments,
  startTrial, upgradeTrial, trialStatus,
  listMethods, setupIntent, deleteMethod,
  initiateBundle, confirmBundle, refundBundle,
  receiptPdf,
};
