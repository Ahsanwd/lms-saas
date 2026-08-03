const TenantPage = require('../models/TenantPage.model');

class TenantPageRepository {
  findAll(tenantId) {
    return TenantPage.find({ tenantId, deletedAt: null }).sort({ isHomePage: -1, navOrder: 1 });
  }

  findById(tenantId, id) {
    return TenantPage.findOne({ _id: id, tenantId, deletedAt: null });
  }

  findBySlug(tenantId, slug) {
    return TenantPage.findOne({ tenantId, slug, deletedAt: null });
  }

  findHomePage(tenantId) {
    return TenantPage.findOne({ tenantId, isHomePage: true, deletedAt: null });
  }

  // Public — unauthenticated. Single page by slug, must be published.
  findPublishedBySlug(tenantId, slug) {
    return TenantPage.findOne({ tenantId, slug, isPublished: true, deletedAt: null }).lean();
  }

  // Public — unauthenticated. Ordered list for nav rendering.
  findPublishedList(tenantId) {
    return TenantPage.find({ tenantId, isPublished: true, deletedAt: null })
      .select('slug title isHomePage navOrder')
      .sort({ isHomePage: -1, navOrder: 1 })
      .lean();
  }

  create(data) {
    return TenantPage.create(data);
  }

  // Race-safe upsert for the migration backfill / new-tenant provisioning —
  // never creates a duplicate 'home' page for the same tenant even under
  // concurrent calls.
  upsertHomePage(tenantId, data) {
    return TenantPage.findOneAndUpdate(
      { tenantId, slug: 'home' },
      { $setOnInsert: { tenantId, slug: 'home', isHomePage: true, ...data } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  updateById(tenantId, id, update) {
    return TenantPage.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  async softDelete(tenantId, id, userId) {
    const page = await this.findById(tenantId, id);
    if (!page) return null;
    return page.softDelete(userId);
  }

  // Used only by websiteDesign.service.js's applyDesignToTenant — a real
  // delete, not softDelete(). The {tenantId, slug} unique index isn't partial
  // on deletedAt, so a soft-deleted page still occupies its slug and would
  // collide with the new design's page of the same name. Applying a design
  // is already an explicit, user-confirmed destructive replace.
  hardDeleteAllForTenant(tenantId) {
    return TenantPage.deleteMany({ tenantId });
  }

  // Used only by websiteDesign.service.js's applyDesignToTenant, right after
  // hardDeleteAllForTenant — inserts a design's pages for a tenant in one call.
  bulkCreate(pages) {
    return TenantPage.insertMany(pages);
  }
}

module.exports = new TenantPageRepository();
