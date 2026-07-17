const Tenant = require('../models/Tenant.model');

// Tenant lookups happen on every request — cache for 60s to avoid repeated DB hits
const _tenantCache = new Map();
const TENANT_CACHE_TTL = 60 * 1000;

function _fromCache(key) {
  const entry = _tenantCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TENANT_CACHE_TTL) { _tenantCache.delete(key); return null; }
  return entry.value;
}
function _toCache(key, value) {
  _tenantCache.set(key, { value, ts: Date.now() });
}

class TenantRepository {
  async findBySubdomain(subdomain) {
    const key = `sub:${subdomain}`;
    const cached = _fromCache(key);
    if (cached !== null) return cached;
    const tenant = await Tenant.findOne({ subdomain, deletedAt: null });
    _toCache(key, tenant);
    return tenant;
  }

  async findByCustomDomain(domain) {
    const key = `dom:${domain}`;
    const cached = _fromCache(key);
    if (cached !== null) return cached;
    const tenant = await Tenant.findOne({ customDomain: domain, customDomainVerified: true, deletedAt: null });
    _toCache(key, tenant);
    return tenant;
  }

  findById(id) {
    return Tenant.findOne({ _id: id, deletedAt: null });
  }

  create(data) {
    return Tenant.create(data);
  }

  async updateById(id, update) {
    const result = await Tenant.findByIdAndUpdate(id, update, { new: true });
    // Any tenant mutation may affect status/settings — wipe full cache to be safe
    _tenantCache.clear();
    return result;
  }

  async getBranding(tenantId) {
    if (!tenantId) return { tenantName: 'LMS Platform', branding: {} };
    const tenant = await Tenant.findById(tenantId)
      .select('name settings.logo settings.favicon settings.primaryColor settings.secondaryColor settings.fontFamily settings.header settings.footer')
      .lean();
    if (!tenant) return { tenantName: 'LMS Platform', branding: {} };
    return {
      tenantName: tenant.name || 'LMS Platform',
      branding: {
        logoUrl:        tenant.settings?.logo           || null,
        faviconUrl:     tenant.settings?.favicon        || null,
        primaryColor:   tenant.settings?.primaryColor   || null,
        secondaryColor: tenant.settings?.secondaryColor || null,
        fontFamily:     tenant.settings?.fontFamily      || null,
        header: tenant.settings?.header || null,
        footer: tenant.settings?.footer || null,
      },
    };
  }
}

module.exports = new TenantRepository();
