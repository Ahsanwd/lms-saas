const tenantRepo = require('../database/repositories/tenant.repository');
const AppError = require('../utils/AppError');

// Resolves tenant from subdomain or custom domain on every request.
// Attaches req.tenant = { tenantId, plan, dbMode, settings } before auth runs.
async function resolveTenant(req, res, next) {
  try {
    const host = req.hostname || req.headers.host?.split(':')[0];
    if (!host) throw new AppError('Unable to determine host', 400);

    let tenant;

    // Determine the API's own hostname so we don't mistake it for a tenant subdomain.
    // e.g. lms-saas-hqex.onrender.com has 3 parts but is NOT a tenant subdomain.
    const apiHost = (process.env.API_URL || '').replace(/^https?:\/\//, '').split('/')[0];
    const isApiOwnHost = apiHost && host === apiHost;

    const parts = host.split('.');
    if (!isApiOwnHost && parts.length >= 3) {
      // Production custom domain: resolve from subdomain (demo.lmsplatform.com)
      tenant = await tenantRepo.findBySubdomain(parts[0]);
    } else {
      // Try custom domain first, then fall back to X-Tenant-Subdomain header (local dev + Render)
      tenant = await tenantRepo.findByCustomDomain(host);
      if (!tenant) {
        const subdomain = req.headers['x-tenant-subdomain'];
        if (subdomain) tenant = await tenantRepo.findBySubdomain(subdomain);
      }
    }

    if (!tenant) {
      // No tenant resolved — allow super admin auth routes to proceed without tenant context
      req.tenant = null;
      return next();
    }

    if (tenant.status === 'suspended')
      throw new AppError('Account suspended. Contact support.', 403, 'TENANT_SUSPENDED');

    if (tenant.status === 'deleted')
      throw new AppError('Not found', 404, 'TENANT_NOT_FOUND');

    req.tenant = {
      tenantId: tenant._id,
      plan: tenant.plan,
      dbMode: tenant.dbMode,
      status: tenant.status,
      settings: tenant.settings,
    };

    next();
  } catch (err) {
    next(err);
  }
}

// Returns 402 for plan_expired tenants so that protected routes are inaccessible
// once the 3-day grace period has ended. Billing, auth, and tenant-settings routes
// are intentionally excluded — apply this middleware only to operational routes.
function requireActivePlan(req, res, next) {
  if (req.tenant?.status === 'plan_expired') {
    return res.status(402).json({
      success: false,
      message: 'Your subscription has expired. Please reactivate to continue.',
      code: 'PLAN_EXPIRED',
    });
  }
  next();
}

module.exports = { resolveTenant, requireActivePlan };
