const limitGuardSvc = require('../services/limitGuard/limitGuard.service');
const { deleteFile } = require('../services/storage/storage.service');

// Route middleware — blocks course creation when plan limit reached.
function guardCourseLimit() {
  return async (req, res, next) => {
    try {
      if (!req.tenant?.plan) return next();
      await limitGuardSvc.assertCourseLimit(req.tenant.tenantId, req.tenant.plan);
      next();
    } catch (err) { next(err); }
  };
}

// Pre-upload middleware — uses Content-Length header as a rough early check.
// Prevents uploads that clearly exceed the remaining storage quota.
function guardStorageLimit() {
  return async (req, res, next) => {
    try {
      if (!req.tenant?.plan) return next();
      const estimatedBytes = parseInt(req.headers['content-length'] || '0', 10);
      if (estimatedBytes > 0) {
        await limitGuardSvc.assertStorageLimit(req.tenant.tenantId, req.tenant.plan, estimatedBytes);
      }
      next();
    } catch (err) { next(err); }
  };
}

// Post-upload middleware — runs AFTER multer has saved the file.
// Does a precise check on req.file.size, then increments storageUsedBytes.
// On limit exceeded: deletes the just-saved file and returns 403.
function trackUpload() {
  return async (req, res, next) => {
    if (!req.file) return next();
    if (!req.tenant?.plan) return next();
    try {
      await limitGuardSvc.assertStorageLimit(req.tenant.tenantId, req.tenant.plan, req.file.size);
      await limitGuardSvc.incrementStorageUsed(req.tenant.tenantId, req.file.size);
      next();
    } catch (err) {
      deleteFile(req.file.path);
      req.file = null;
      next(err);
    }
  };
}

// Route middleware — blocks user invite when the plan's student or instructor cap is reached.
// Reads role from req.body.role; skips silently if no role is present (non-user-creation routes).
function guardUserLimit() {
  return async (req, res, next) => {
    try {
      if (!req.tenant?.plan) return next();
      const role = req.body?.role;
      if (!role) return next();
      await limitGuardSvc.assertUserLimit(req.tenant.tenantId, req.tenant.plan, role);
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { guardCourseLimit, guardStorageLimit, trackUpload, guardUserLimit };
