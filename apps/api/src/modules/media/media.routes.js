const router = require('express').Router();
const ctrl = require('./media.controller');
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const { upload }            = require('../../services/storage/storage.service');
const { trackMediaAsset }   = require('../../middlewares/mediaTracking.middleware');
const { guardStorageLimit, trackUpload } = require('../../middlewares/limitGuard.middleware');
const AppError = require('../../utils/AppError');

router.use(authenticate);

const UPLOADABLE_CATEGORIES = ['thumbnail', 'content-image', 'video', 'audio', 'attachment'];

// Standalone upload directly into the library (not tied to any lesson/course).
// Category comes from ?category= (query string, available before multer parses
// the multipart body) and is whitelisted before upload(category) is built.
function uploadToLibrary(req, res, next) {
  const category = req.query.category;
  if (!UPLOADABLE_CATEGORIES.includes(category)) {
    return next(new AppError(`Invalid category. Use one of: ${UPLOADABLE_CATEGORIES.join(', ')}`, 400));
  }
  upload(category).single('file')(req, res, next);
}

router.get('/',      requirePermission('media:read'),   ctrl.listMedia);
router.post('/upload', requirePermission('media:manage'),
  guardStorageLimit(),
  uploadToLibrary,
  trackUpload(),
  trackMediaAsset(req => req.query.category, () => ({ contextType: 'media-library', contextId: null })),
  ctrl.uploadMedia);
router.delete('/:id', requirePermission('media:delete'), ctrl.deleteMedia);

module.exports = router;
