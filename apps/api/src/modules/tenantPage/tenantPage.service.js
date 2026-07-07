const tenantPageRepo = require('../../database/repositories/tenantPage.repository');
const AppError = require('../../utils/AppError');

const INSTITUTE_TYPES = ['school', 'academy', 'college', 'university'];
const MAX_TESTIMONIALS = 6;

// Size/count caps — Mixed-typed section data gets zero Mongoose schema
// validation, so these are enforced here in the service layer instead.
const MAX_CUSTOM_CODE_CHARS = 100_000; // per field (html/css/js)
const MAX_CUSTOM_SECTIONS_PER_PAGE = 10;
const MAX_SECTIONS_PER_PAGE = 30;

const FIXED_SECTION_TYPES = ['hero', 'about', 'coursesSection', 'testimonials', 'cta', 'contact'];

const EMPTY_WEBSITE_CONTENT = {
  hero: { headline: null, subheadline: null, ctaText: null, ctaLink: null, backgroundImageUrl: null },
  about: { heading: null, body: null, imageUrl: null, ctaText: null, ctaLink: null },
  coursesSection: { heading: null, subheading: null, displayMode: 'all', categoryId: null, courseIds: [], layout: 'grid' },
  testimonials: [],
  cta: { heading: null, subtext: null, buttonText: null, buttonLink: null },
  contact: { email: null, phone: null, address: null },
};

// ─── Shape adapters ───────────────────────────────────────────────────────────
// Phase 1a keeps the existing GET/PUT /tenant/website request+response shape
// identical (so the current builder UI needs zero changes), while storage
// moves from Tenant.websiteContent to TenantPage.sections[] underneath.

function sectionsFromWebsiteContent(data) {
  return FIXED_SECTION_TYPES.map((type, order) => ({
    type,
    order,
    data: data[type] !== undefined ? data[type] : EMPTY_WEBSITE_CONTENT[type],
  }));
}

function websiteContentFromPage(page) {
  const content = { instituteType: page?.instituteType ?? null, isPublished: page?.isPublished ?? false };
  for (const type of FIXED_SECTION_TYPES) {
    const section = page?.sections?.find((s) => s.type === type);
    content[type] = section ? section.data : EMPTY_WEBSITE_CONTENT[type];
  }
  return content;
}

// ─── Home page (single-page builder — existing /tenant/website contract) ─────

async function getHomePageContent(tenantId) {
  const page = await tenantPageRepo.upsertHomePage(tenantId, { title: 'Home' });
  return websiteContentFromPage(page);
}

async function saveHomePageContent(tenantId, data) {
  const { instituteType, isPublished, testimonials } = data;

  if (instituteType !== undefined && instituteType !== null && !INSTITUTE_TYPES.includes(instituteType))
    throw new AppError('Invalid institute type', 400);
  if (testimonials && testimonials.length > MAX_TESTIMONIALS)
    throw new AppError(`Maximum ${MAX_TESTIMONIALS} testimonials allowed`, 400);

  const sections = sectionsFromWebsiteContent(data);
  validateSections(sections);

  const home = await tenantPageRepo.upsertHomePage(tenantId, { title: 'Home' });
  const updated = await tenantPageRepo.updateById(tenantId, home._id, {
    instituteType: instituteType ?? home.instituteType,
    isPublished: isPublished !== undefined ? !!isPublished : home.isPublished,
    sections,
  });
  return websiteContentFromPage(updated);
}

// Unauthenticated — served on the tenant's public subdomain landing page.
// Returns { isPublished: false } for tenants who've never touched the builder,
// so the frontend's fallback-to-hardcoded-page logic has a safe default.
async function getPublicHomePageContent(tenantId) {
  if (!tenantId) return { isPublished: false };
  const page = await tenantPageRepo.findHomePage(tenantId);
  if (!page) return { isPublished: false };
  return websiteContentFromPage(page);
}

// ─── Validation (shared by the home-page contract above and, later, the
// full multi-page CRUD) ────────────────────────────────────────────────────

function validateSections(sections) {
  if (sections.length > MAX_SECTIONS_PER_PAGE)
    throw new AppError(`A page can have at most ${MAX_SECTIONS_PER_PAGE} sections`, 400);

  const seenFixedTypes = new Set();
  let customCount = 0;

  for (const section of sections) {
    if (FIXED_SECTION_TYPES.includes(section.type)) {
      if (seenFixedTypes.has(section.type))
        throw new AppError(`Only one "${section.type}" section is allowed per page`, 400);
      seenFixedTypes.add(section.type);
    } else if (section.type === 'custom') {
      customCount += 1;
      const { html = '', css = '', js = '' } = section.data || {};
      for (const [field, value] of Object.entries({ html, css, js })) {
        if (String(value).length > MAX_CUSTOM_CODE_CHARS)
          throw new AppError(`Custom code ${field} exceeds the ${MAX_CUSTOM_CODE_CHARS.toLocaleString()} character limit`, 400);
      }
    }
  }

  if (customCount > MAX_CUSTOM_SECTIONS_PER_PAGE)
    throw new AppError(`A page can have at most ${MAX_CUSTOM_SECTIONS_PER_PAGE} Custom Code sections`, 400);
}

module.exports = {
  getHomePageContent,
  saveHomePageContent,
  getPublicHomePageContent,
  // exported for the backfill script and future multi-page CRUD (Phase 1b)
  sectionsFromWebsiteContent,
  websiteContentFromPage,
  validateSections,
};
