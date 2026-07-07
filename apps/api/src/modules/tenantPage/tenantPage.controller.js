const tenantPageService = require('./tenantPage.service');
const R = require('../../utils/response');

// ── Authenticated CRUD (tenant_admin) ──────────────────────────────────────────

async function listPages(req, res, next) {
  try {
    const pages = await tenantPageService.listPages(req.tenant.tenantId);
    R.success(res, { pages });
  } catch (err) { next(err); }
}

async function getPage(req, res, next) {
  try {
    const page = await tenantPageService.getPage(req.tenant.tenantId, req.params.id);
    R.success(res, { page });
  } catch (err) { next(err); }
}

async function createPage(req, res, next) {
  try {
    const page = await tenantPageService.createPage(req.tenant.tenantId, req.body);
    R.success(res, { page }, 'Page created');
  } catch (err) { next(err); }
}

async function updatePage(req, res, next) {
  try {
    const page = await tenantPageService.updatePage(req.tenant.tenantId, req.params.id, req.body);
    R.success(res, { page }, 'Page saved');
  } catch (err) { next(err); }
}

async function deletePage(req, res, next) {
  try {
    await tenantPageService.deletePage(req.tenant.tenantId, req.params.id, req.user.sub);
    R.success(res, {}, 'Page deleted');
  } catch (err) { next(err); }
}

async function reorderPages(req, res, next) {
  try {
    const pages = await tenantPageService.reorderPages(req.tenant.tenantId, req.body.orderedIds || []);
    R.success(res, { pages }, 'Order saved');
  } catch (err) { next(err); }
}

async function uploadPageImage(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'No file uploaded', 400);
    const { getPublicUrl } = require('../../services/storage/storage.service');
    const url = getPublicUrl(req.file.path);
    R.success(res, { url }, 'Image uploaded');
  } catch (err) { next(err); }
}

// ── Public (no auth) ───────────────────────────────────────────────────────────

async function getPublicPageBySlug(req, res, next) {
  try {
    if (!req.tenant) return R.success(res, { isPublished: false });
    const page = await tenantPageService.getPublicPageBySlug(req.tenant.tenantId, req.params.slug);
    R.success(res, page);
  } catch (err) { next(err); }
}

async function listPublishedPages(req, res, next) {
  try {
    const pages = await tenantPageService.listPublishedPages(req.tenant?.tenantId);
    R.success(res, { pages });
  } catch (err) { next(err); }
}

module.exports = {
  listPages,
  getPage,
  createPage,
  updatePage,
  deletePage,
  reorderPages,
  uploadPageImage,
  getPublicPageBySlug,
  listPublishedPages,
};
