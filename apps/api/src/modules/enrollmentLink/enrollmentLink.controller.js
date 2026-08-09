const svc = require('./enrollmentLink.service');
const R   = require('../../utils/response');

async function create(req, res, next) {
  try {
    if (!req.tenant) return R.error(res, 'Tenant context missing', 400);
    const { title, courseIds, maxUses, expiresAt, priceOverride } = req.body;
    const link = await svc.createLink(
      req.tenant.tenantId, req.user.sub, req.user.role,
      { title, courseIds, maxUses, expiresAt, priceOverride }
    );
    R.created(res, { link }, 'Enrollment link created');
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    if (!req.tenant) return R.error(res, 'Tenant context missing', 400);
    const { page, limit } = req.query;
    const result = await svc.listLinks(
      req.tenant.tenantId, req.user.role, req.user.sub, { page, limit }
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    if (!req.tenant) return R.error(res, 'Tenant context missing', 400);
    await svc.deleteLink(req.tenant.tenantId, req.user.role, req.user.sub, req.params.id);
    R.success(res, {}, 'Link deleted');
  } catch (err) { next(err); }
}

// Public — no auth
async function getPublic(req, res, next) {
  try {
    if (!req.tenant) return R.error(res, 'Tenant not found', 404);
    const info = await svc.getPublicLink(req.tenant.tenantId, req.params.token);
    R.success(res, info);
  } catch (err) { next(err); }
}

// Protected — requires auth
async function join(req, res, next) {
  try {
    if (!req.tenant) return R.error(res, 'Tenant context missing', 400);
    const result = await svc.joinViaLink(req.tenant.tenantId, req.params.token, req.user);
    // Every course could resolve to 'skipped' (unpublished since the link
    // was created) or 'full' (capacity reached) — anything but a blanket
    // "Enrolled successfully!"/"Already enrolled" would be misleading in
    // that case, since the student ends up enrolled in nothing.
    const message = result.enrolled.length > 0
      ? 'Enrolled successfully!'
      : result.results.some(r => r.status === 'already_enrolled')
        ? 'Already enrolled'
        : 'These courses are no longer available';
    R.success(res, result, message);
  } catch (err) { next(err); }
}

module.exports = { create, list, remove, getPublic, join };
