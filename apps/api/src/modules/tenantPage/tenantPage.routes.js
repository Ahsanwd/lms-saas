const router = require('express').Router();
const ctrl = require('./tenantPage.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/permission.middleware');
const { upload } = require('../../services/storage/storage.service');
const { trackMediaAsset } = require('../../middlewares/mediaTracking.middleware');

// Public — no auth. Tenant subdomain page rendering + nav.
router.get('/public', ctrl.listPublishedPages);
router.get('/public/:slug', ctrl.getPublicPageBySlug);

router.use(authenticate);

router.get('/', requireRole('tenant_admin'), ctrl.listPages);
router.post('/', requireRole('tenant_admin'), ctrl.createPage);
router.post('/reorder', requireRole('tenant_admin'), ctrl.reorderPages);
router.post('/image', requireRole('tenant_admin'), upload('thumbnail').single('image'),
  trackMediaAsset('thumbnail', req => ({ contextType: 'website-page-image', contextId: req.tenant.tenantId })),
  ctrl.uploadPageImage);
router.get('/:id', requireRole('tenant_admin'), ctrl.getPage);
router.patch('/:id', requireRole('tenant_admin'), ctrl.updatePage);
router.delete('/:id', requireRole('tenant_admin'), ctrl.deletePage);

module.exports = router;
