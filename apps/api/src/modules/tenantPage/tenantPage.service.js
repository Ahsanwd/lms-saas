const tenantPageRepo = require('../../database/repositories/tenantPage.repository');
const AppError = require('../../utils/AppError');

const MAX_TESTIMONIALS = 6;
const MAX_TEAM_MEMBERS = 20;
const MAX_SELECTED_BUNDLES = 30;

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

// Every existing top-level route under apps/web/app/ (route groups like
// (auth)/(dashboard) don't add a URL segment, so their children collide with
// tenant-page slugs at the same level) — a tenant page can't use any of these,
// or Next.js's static-route-wins-over-dynamic-catch-all behavior would make it
// permanently unreachable. Known lightweight risk: this list can drift if a
// new top-level route is added later without updating it here (flagged in
// the plan as a follow-up CI check, not blocking this feature).
const RESERVED_SLUGS = new Set([
  'home', 'api',
  // (auth)
  'login', 'register', 'register-tenant', 'accept-invite', 'forgot-password',
  'google-callback', 'reset-password', 'signup', 'verify-email',
  // (dashboard)
  'activity', 'admin', 'analytics', 'announcements', 'assignments', 'billing',
  'bookmarks', 'bundles', 'certificate-builder', 'certificates', 'chat',
  'cohorts', 'contact-submissions', 'coupons', 'course-applications',
  'courses', 'dashboard', 'forum', 'groups', 'live-room', 'media',
  'membership', 'membership-plans', 'my-learning', 'my-payments',
  'notifications', 'profile', 'quizzes', 'refunds', 'search', 'settings',
  'share-links', 'users', 'website-builder',
  // top-level
  'join', 'privacy', 'refund-policy', 'terms', 'verify',
]);

// ─── Section conversion helper (used by the one-time migration backfill) ─────
// Historical bridge from the retired flat `websiteContent` shape to the
// sections[] array — only called by scripts/backfillTenantPages.js now.
function sectionsFromWebsiteContent(data) {
  return FIXED_SECTION_TYPES.map((type, order) => ({
    type,
    order,
    data: data[type] !== undefined ? data[type] : EMPTY_WEBSITE_CONTENT[type],
  }));
}

// ─── Validation ───────────────────────────────────────────────────────────────

// Not folded into FIXED_SECTION_TYPES on purpose — that constant is also used
// by sectionsFromWebsiteContent() to map the legacy flat websiteContent shape,
// which never had a contactForm field. Validated as its own 0-or-1-per-page
// case instead, alongside 'custom'.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSections(sections) {
  if (sections.length > MAX_SECTIONS_PER_PAGE)
    throw new AppError(`A page can have at most ${MAX_SECTIONS_PER_PAGE} sections`, 400);

  const seenFixedTypes = new Set();
  let customCount = 0;
  let contactFormCount = 0;
  let courseApplicationCount = 0;
  let teamCount = 0;
  let bundlesSectionCount = 0;
  let membershipPlansSectionCount = 0;

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
    } else if (section.type === 'contactForm') {
      contactFormCount += 1;
      if (contactFormCount > 1)
        throw new AppError('Only one "contactForm" section is allowed per page', 400);
      const { recipientEmail } = section.data || {};
      if (recipientEmail && (typeof recipientEmail !== 'string' || recipientEmail.length > 200 || !EMAIL_RE.test(recipientEmail)))
        throw new AppError('Invalid recipient email override', 400);
    } else if (section.type === 'courseApplication') {
      courseApplicationCount += 1;
      if (courseApplicationCount > 1)
        throw new AppError('Only one "courseApplication" section is allowed per page', 400);
    } else if (section.type === 'team') {
      teamCount += 1;
      if (teamCount > 1)
        throw new AppError('Only one "team" section is allowed per page', 400);
      if (Array.isArray(section.data) && section.data.length > MAX_TEAM_MEMBERS)
        throw new AppError(`Maximum ${MAX_TEAM_MEMBERS} team members allowed`, 400);
    } else if (section.type === 'bundlesSection') {
      bundlesSectionCount += 1;
      if (bundlesSectionCount > 1)
        throw new AppError('Only one "bundlesSection" section is allowed per page', 400);
      const { bundleIds } = section.data || {};
      if (bundleIds && (!Array.isArray(bundleIds) || bundleIds.length > MAX_SELECTED_BUNDLES))
        throw new AppError(`A maximum of ${MAX_SELECTED_BUNDLES} selected bundles is allowed`, 400);
    } else if (section.type === 'membershipPlansSection') {
      membershipPlansSectionCount += 1;
      if (membershipPlansSectionCount > 1)
        throw new AppError('Only one "membershipPlansSection" section is allowed per page', 400);
    } else {
      throw new AppError(`Unknown section type "${section.type}"`, 400);
    }
    if (section.type === 'testimonials' && Array.isArray(section.data) && section.data.length > MAX_TESTIMONIALS)
      throw new AppError(`Maximum ${MAX_TESTIMONIALS} testimonials allowed`, 400);
  }

  if (customCount > MAX_CUSTOM_SECTIONS_PER_PAGE)
    throw new AppError(`A page can have at most ${MAX_CUSTOM_SECTIONS_PER_PAGE} Custom Code sections`, 400);
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'page';
}

async function assertSlugAvailable(tenantId, slug, excludePageId) {
  if (RESERVED_SLUGS.has(slug)) throw new AppError(`"${slug}" is a reserved name and can't be used as a page URL`, 400);
  const existing = await tenantPageRepo.findBySlug(tenantId, slug);
  if (existing && String(existing._id) !== String(excludePageId))
    throw new AppError('A page with this URL already exists', 409);
}

// The {tenantId, slug} unique index isn't partial on deletedAt, so a slug
// that belonged to a since-soft-deleted page still collides at the DB level
// even though assertSlugAvailable (which filters deletedAt: null) reports it
// as free — same for a genuine concurrent double-submit race. Both surface
// as a raw MongoServerError here; translate to the same 409 a pre-check
// would have given, instead of letting it escape as an uncaught 500.
function rethrowIfSlugConflict(err) {
  if (err?.code === 11000 && err?.keyPattern?.slug)
    throw new AppError('A page with this URL already exists', 409);
  throw err;
}

// ─── CRUD (tenant_admin, authenticated) ───────────────────────────────────────

function listPages(tenantId) {
  return tenantPageRepo.findAll(tenantId);
}

async function getPage(tenantId, id) {
  const page = await tenantPageRepo.findById(tenantId, id);
  if (!page) throw new AppError('Page not found', 404);
  return page;
}

async function createPage(tenantId, { title, slug }) {
  if (!title?.trim()) throw new AppError('Title is required', 400);
  const finalSlug = slugify(slug || title);
  await assertSlugAvailable(tenantId, finalSlug);

  const existingPages = await tenantPageRepo.findAll(tenantId);
  const navOrder = existingPages.length;

  try {
    return await tenantPageRepo.create({
      tenantId, title: title.trim(), slug: finalSlug, navOrder, sections: [],
    });
  } catch (err) {
    return rethrowIfSlugConflict(err);
  }
}

async function updatePage(tenantId, id, data) {
  const page = await getPage(tenantId, id);
  const update = {};

  if (data.title !== undefined) {
    if (!data.title.trim()) throw new AppError('Title is required', 400);
    update.title = data.title.trim();
  }
  if (data.slug !== undefined && data.slug !== page.slug) {
    if (page.isHomePage) throw new AppError('The home page\'s URL can\'t be changed', 400);
    const finalSlug = slugify(data.slug);
    await assertSlugAvailable(tenantId, finalSlug, page._id);
    update.slug = finalSlug;
  }
  if (data.isPublished !== undefined) update.isPublished = !!data.isPublished;
  if (data.instituteType !== undefined) update.instituteType = data.instituteType;
  if (data.sections !== undefined) {
    validateSections(data.sections);
    // The schema requires sections[].order, but this was passed straight
    // through from the client with no server-side check or default. A
    // save that omits it (or that a client-side bug/omission lets through)
    // writes fine here — findByIdAndUpdate doesn't run full validation —
    // but then explodes with "Path `order` is required" on literally the
    // next .save()-based operation to touch the document, which deletePage
    // hits via the soft-delete plugin. Confirmed live: updated a page's
    // sections without order, then deleting that same page 500'd with
    // exactly that validation error. Normalizing to array index here,
    // the same way reorderPages() already derives navOrder from position
    // rather than trusting client input, makes the field always present
    // and internally consistent regardless of what the client sends.
    update.sections = data.sections.map((section, index) => ({ ...section, order: index }));
  }

  if (!Object.keys(update).length) throw new AppError('No valid fields provided', 400);
  try {
    return await tenantPageRepo.updateById(tenantId, id, update);
  } catch (err) {
    return rethrowIfSlugConflict(err);
  }
}

async function deletePage(tenantId, id, userId) {
  const page = await getPage(tenantId, id);
  if (page.isHomePage) throw new AppError('The home page can\'t be deleted', 400);
  return tenantPageRepo.softDelete(tenantId, id, userId);
}

async function reorderPages(tenantId, orderedIds) {
  await Promise.all(orderedIds.map((id, navOrder) => tenantPageRepo.updateById(tenantId, id, { navOrder })));
  return listPages(tenantId);
}

// ─── Public (unauthenticated) ─────────────────────────────────────────────────

async function getPublicPageBySlug(tenantId, slug) {
  if (!tenantId) return { isPublished: false };
  const page = await tenantPageRepo.findPublishedBySlug(tenantId, slug);
  if (!page) return { isPublished: false };
  return page;
}

function listPublishedPages(tenantId) {
  if (!tenantId) return [];
  return tenantPageRepo.findPublishedList(tenantId);
}

module.exports = {
  listPages,
  getPage,
  createPage,
  updatePage,
  deletePage,
  reorderPages,
  getPublicPageBySlug,
  listPublishedPages,
  validateSections,
  // exported for the one-time migration backfill script only
  sectionsFromWebsiteContent,
  // exported so websiteDesign seed/authoring scripts validate page slugs
  // against the exact same reserved list assertSlugAvailable uses here
  RESERVED_SLUGS,
};
