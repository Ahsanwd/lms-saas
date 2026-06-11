const adminTenantService = require('./admin.tenant.service');
const { validateCreateTenant } = require('../../validators/tenant.validator');
const R = require('../../utils/response');

async function listTenants(req, res, next) {
  try {
    const { status, plan, search, page, limit } = req.query;
    const result = await adminTenantService.listTenants({ status, plan, search, page, limit });
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getTenant(req, res, next) {
  try {
    const tenant = await adminTenantService.getTenantById(req.params.id);
    R.success(res, { tenant });
  } catch (err) { next(err); }
}

async function getTenantStats(req, res, next) {
  try {
    const data = await adminTenantService.getTenantStats(req.params.id);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function createTenant(req, res, next) {
  try {
    const { name, subdomain, contactEmail, planId, dbMode } = req.body;
    validateCreateTenant({ name, subdomain, contactEmail, planId });
    const tenant = await adminTenantService.createTenant(
      { name, subdomain, contactEmail, planId, dbMode },
      req.user.sub
    );
    R.created(res, { tenant }, 'Tenant created');
  } catch (err) { next(err); }
}

async function updateTenant(req, res, next) {
  try {
    const tenant = await adminTenantService.updateTenant(req.params.id, req.body);
    R.success(res, { tenant }, 'Tenant updated');
  } catch (err) { next(err); }
}

async function suspendTenant(req, res, next) {
  try {
    await adminTenantService.suspendTenant(req.params.id);
    R.success(res, {}, 'Tenant suspended');
  } catch (err) { next(err); }
}

async function restoreTenant(req, res, next) {
  try {
    await adminTenantService.restoreTenant(req.params.id);
    R.success(res, {}, 'Tenant restored');
  } catch (err) { next(err); }
}

async function deleteTenant(req, res, next) {
  try {
    await adminTenantService.deleteTenant(req.params.id, req.user.sub);
    R.success(res, {}, 'Tenant deleted');
  } catch (err) { next(err); }
}

async function changePlan(req, res, next) {
  try {
    const { planId, planExpiresAt } = req.body;
    if (!planId) return R.error(res, 'planId is required', 400);
    const tenant = await adminTenantService.changeTenantPlan(req.params.id, { planId, planExpiresAt });
    R.success(res, { tenant }, 'Plan updated');
  } catch (err) { next(err); }
}

module.exports = {
  listTenants,
  getTenant,
  getTenantStats,
  createTenant,
  updateTenant,
  suspendTenant,
  restoreTenant,
  deleteTenant,
  changePlan,
};
