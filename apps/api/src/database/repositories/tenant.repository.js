const Tenant = require('../models/Tenant.model');

class TenantRepository {
  findBySubdomain(subdomain) {
    return Tenant.findOne({ subdomain, deletedAt: null });
  }

  findByCustomDomain(domain) {
    return Tenant.findOne({ customDomain: domain, customDomainVerified: true, deletedAt: null });
  }

  findById(id) {
    return Tenant.findOne({ _id: id, deletedAt: null });
  }

  create(data) {
    return Tenant.create(data);
  }

  updateById(id, update) {
    return Tenant.findByIdAndUpdate(id, update, { new: true });
  }

  async getBranding(tenantId) {
    if (!tenantId) return { tenantName: 'LMS Platform', branding: {} };
    const tenant = await Tenant.findById(tenantId)
      .select('name settings.logo settings.favicon settings.primaryColor')
      .lean();
    if (!tenant) return { tenantName: 'LMS Platform', branding: {} };
    return {
      tenantName: tenant.name || 'LMS Platform',
      branding: {
        logoUrl:      tenant.settings?.logo         || null,
        faviconUrl:   tenant.settings?.favicon      || null,
        primaryColor: tenant.settings?.primaryColor || null,
      },
    };
  }
}

module.exports = new TenantRepository();
