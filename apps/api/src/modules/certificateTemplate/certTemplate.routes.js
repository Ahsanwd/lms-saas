const router = require('express').Router();
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const { upload }            = require('../../services/storage/storage.service');
const { trackMediaAsset }   = require('../../middlewares/mediaTracking.middleware');
const ctrl = require('./certTemplate.controller');

router.use(authenticate);

// Public read — any authenticated user can read template (for certificate rendering)
router.get('/', ctrl.getTemplate);

// Write — only admins/instructors
router.post('/',         requirePermission('course:manage'), ctrl.saveTemplate);
router.delete('/reset',  requirePermission('course:manage'), ctrl.resetTemplate);
router.post('/logo',              requirePermission('course:manage'), upload('thumbnail').single('logo'),
  trackMediaAsset('thumbnail', req => ({ contextType: 'certificate-logo', contextId: req.tenant.tenantId })),
  ctrl.uploadLogo);
router.post('/background',       requirePermission('course:manage'), upload('thumbnail').single('background'),
  trackMediaAsset('thumbnail', req => ({ contextType: 'certificate-background', contextId: req.tenant.tenantId })),
  ctrl.uploadBackground);
router.post('/signature',        requirePermission('course:manage'), upload('thumbnail').single('signature'),
  trackMediaAsset('thumbnail', req => ({ contextType: 'certificate-signature', contextId: req.tenant.tenantId })),
  ctrl.uploadSignature);
router.post('/second-signature', requirePermission('course:manage'), upload('thumbnail').single('secondSignature'),
  trackMediaAsset('thumbnail', req => ({ contextType: 'certificate-second-signature', contextId: req.tenant.tenantId })),
  ctrl.uploadSecondSignature);

module.exports = router;
