const svc = require('./membership.service');
const R   = require('../../utils/response');

// ─── Plan management (Tenant Admin) ───────────────────────────────────────────
async function listPlans(req, res, next) {
  try {
    const isAdmin = req.user.role === 'tenant_admin';
    // Only tenant admins may see inactive/draft plans or per-plan subscriber
    // counts — students/instructors hitting this same shared endpoint (they
    // need it to browse active plans) get the public-safe shape regardless
    // of what query params they send.
    const includeInactive = isAdmin && req.query.all === 'true';
    const plans = await svc.listPlans(req.tenant.tenantId, { includeInactive });
    const safePlans = isAdmin ? plans : plans.map(({ subscribers, ...rest }) => rest);
    R.success(res, { plans: safePlans });
  } catch (err) { next(err); }
}

async function listPublicPlans(req, res, next) {
  try {
    const plans = await svc.listPublicPlans(req.tenant.tenantId);
    R.success(res, { plans });
  } catch (err) { next(err); }
}

async function createPlan(req, res, next) {
  try {
    const plan = await svc.createPlan(req.tenant.tenantId, req.body);
    R.created(res, { plan }, 'Membership plan created');
  } catch (err) { next(err); }
}

async function updatePlan(req, res, next) {
  try {
    const plan = await svc.updatePlan(req.tenant.tenantId, req.params.id, req.body);
    R.success(res, { plan }, 'Membership plan updated');
  } catch (err) { next(err); }
}

async function togglePlan(req, res, next) {
  try {
    const plan = await svc.togglePlan(req.tenant.tenantId, req.params.id);
    R.success(res, { plan }, `Plan ${plan.isActive ? 'activated' : 'deactivated'}`);
  } catch (err) { next(err); }
}

async function deletePlan(req, res, next) {
  try {
    await svc.deletePlan(req.tenant.tenantId, req.params.id);
    R.success(res, {}, 'Plan deleted');
  } catch (err) { next(err); }
}

// ─── Student subscription ─────────────────────────────────────────────────────
async function getMySubscription(req, res, next) {
  try {
    const sub = await svc.getMySubscription(req.tenant.tenantId, req.user.sub);
    R.success(res, { subscription: sub || null });
  } catch (err) { next(err); }
}

async function initiate(req, res, next) {
  try {
    const result = await svc.initiateSubscription(req.tenant.tenantId, req.user.sub, req.body);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function confirm(req, res, next) {
  try {
    const sub = await svc.confirmSubscription(req.tenant.tenantId, req.params.subscriptionId, req.user.sub);
    R.success(res, { subscription: sub }, 'Membership activated');
  } catch (err) { next(err); }
}

async function cancel(req, res, next) {
  try {
    const sub = await svc.cancelSubscription(req.tenant.tenantId, req.user.sub, req.body);
    R.success(res, { subscription: sub }, 'Membership cancelled');
  } catch (err) { next(err); }
}

async function checkAccess(req, res, next) {
  try {
    const result = await svc.checkCourseAccess(req.tenant.tenantId, req.user.sub, req.params.courseId);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function listSubscriptions(req, res, next) {
  try {
    const result = await svc.listSubscriptions(req.tenant.tenantId, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function failedRenewals(req, res, next) {
  try {
    const result = await svc.getFailedRenewals(req.tenant.tenantId, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

module.exports = { listPlans, listPublicPlans, createPlan, updatePlan, togglePlan, deletePlan, getMySubscription, initiate, confirm, cancel, checkAccess, listSubscriptions, failedRenewals };
