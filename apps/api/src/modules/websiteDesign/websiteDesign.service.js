const websiteDesignRepo = require('../../database/repositories/websiteDesign.repository');
const tenantPageRepo = require('../../database/repositories/tenantPage.repository');
const tenantPageService = require('../tenantPage/tenantPage.service');
const tenantService = require('../tenant/tenant.service');

async function getDefaultDesign() {
  return websiteDesignRepo.findDefault();
}

function listDesigns() {
  return websiteDesignRepo.findAll();
}

// Replaces a tenant's entire public website (header, footer, every page)
// with the given design's content. Used by registerTenant() at signup today;
// a future tenant_admin-facing "switch design" flow (behind its own
// confirmation popup) will call this same function.
async function applyDesignToTenant(tenantId, design) {
  // Validate every page's sections up front, before touching anything —
  // reuses tenantPageService.validateSections (already exported) instead of
  // re-implementing the per-type caps/rules.
  for (const page of design.pages) {
    tenantPageService.validateSections(page.sections);
  }

  // Delete-then-insert, not the reverse: the new pages reuse the same slugs
  // (home/about/contact, etc.), so the old docs must be gone first or
  // insertMany hits the {tenantId, slug} unique index. No multi-doc
  // transactions exist anywhere in this codebase — same small non-atomic
  // window as everywhere else here, not a new risk this feature introduces.
  await tenantPageRepo.hardDeleteAllForTenant(tenantId);
  await tenantPageRepo.bulkCreate(
    design.pages.map((page) => ({
      tenantId,
      slug: page.slug,
      title: page.title,
      isHomePage: page.isHomePage,
      isPublished: page.isPublished,
      navOrder: page.navOrder,
      instituteType: page.instituteType,
      sections: page.sections,
    }))
  );

  // Header/footer already has its own validated setter — reuse it rather
  // than duplicating validateHeader/validateFooter here.
  await tenantService.updateHeaderFooterSettings(tenantId, {
    header: design.header,
    footer: design.footer,
  });
}

module.exports = {
  getDefaultDesign,
  listDesigns,
  applyDesignToTenant,
};
