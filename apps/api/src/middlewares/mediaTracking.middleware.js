const Media = require('../database/models/Media.model');
const logger = require('../utils/logger');

// Runs after storage.service.js's upload(category) multer middleware (and after
// guardStorageLimit()/trackUpload() where those already exist). Catalogs the
// uploaded file into the Media collection so it shows up in the tenant's Media
// Library (browse/search/copy-URL/delete), regardless of which upload flow
// created it. `category` is either a literal string or a `(req) => string`
// resolver (used where the category is only known at request time, e.g. the
// standalone library-upload endpoint). `resolveContext(req)` returns
// { contextType, contextId } — purely informational (not a live reference count).
function trackMediaAsset(category, resolveContext) {
  return async (req, res, next) => {
    if (!req.file) return next();
    try {
      const resolvedCategory = typeof category === 'function' ? category(req) : category;

      const { USE_S3, getPublicUrl } = require('../services/storage/storage.service');
      const provider = USE_S3 ? 's3' : 'local';

      let width  = req.file.width  ?? null;
      let height = req.file.height ?? null;
      if (!USE_S3 && width == null && req.file.mimetype?.startsWith('image/')) {
        try {
          const sharp = require('sharp');
          const meta = await sharp(req.file.path).metadata();
          width  = meta.width  ?? null;
          height = meta.height ?? null;
        } catch { /* non-image or unreadable — dimensions stay null */ }
      }

      const url = getPublicUrl(req.file.path);
      const { contextType, contextId } = resolveContext ? (resolveContext(req) || {}) : {};

      req.trackedMedia = await Media.create({
        tenantId:    req.tenant?.tenantId,
        url,
        key:         req.file.key || null,
        filename:    req.file.originalname || req.file.filename || null,
        mimeType:    req.file.mimetype || null,
        category:    resolvedCategory,
        sizeBytes:   req.file.size || 0,
        width,
        height,
        provider,
        contextType: contextType || null,
        contextId:   contextId || null,
        createdBy:   req.user?.sub || null,
      });
    } catch (err) {
      // Cataloging failure must never block the actual upload flow.
      logger.error(`[mediaTracking] failed to record upload: ${err.message}`);
    }
    next();
  };
}

module.exports = { trackMediaAsset };
