const svc = require('./certTemplate.service');
const R   = require('../../utils/response');

async function getTemplate(req, res, next) {
  try {
    const courseId = req.query.courseId || null;
    const template = await svc.getTemplate(req.tenant.tenantId, courseId);
    R.success(res, { template });
  } catch (err) { next(err); }
}

async function saveTemplate(req, res, next) {
  try {
    const courseId = req.query.courseId || null;
    const template = await svc.saveTemplate(req.tenant.tenantId, req.body, req.user, courseId);
    R.success(res, { template }, 'Template saved');
  } catch (err) { next(err); }
}

async function uploadLogo(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'Image file required', 400);
    const courseId = req.query.courseId || null;
    const result = await svc.uploadLogo(req.tenant.tenantId, req.file, req.user, courseId);
    R.success(res, result, 'Logo uploaded');
  } catch (err) { next(err); }
}

async function uploadSignature(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'Image file required', 400);
    const courseId = req.query.courseId || null;
    const result = await svc.uploadSignature(req.tenant.tenantId, req.file, req.user, courseId);
    R.success(res, result, 'Signature uploaded');
  } catch (err) { next(err); }
}

async function resetTemplate(req, res, next) {
  try {
    const courseId = req.query.courseId || null;
    const template = await svc.resetTemplate(req.tenant.tenantId, req.user, courseId);
    R.success(res, { template }, 'Template reset to defaults');
  } catch (err) { next(err); }
}

async function uploadBackground(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'Image file required', 400);
    const courseId = req.query.courseId || null;
    const result = await svc.uploadBackground(req.tenant.tenantId, req.file, req.user, courseId);
    R.success(res, result, 'Background image uploaded');
  } catch (err) { next(err); }
}

async function uploadSecondSignature(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'Image file required', 400);
    const courseId = req.query.courseId || null;
    const result = await svc.uploadSecondSignature(req.tenant.tenantId, req.file, req.user, courseId);
    R.success(res, result, 'Second signature uploaded');
  } catch (err) { next(err); }
}

module.exports = { getTemplate, saveTemplate, uploadLogo, uploadBackground, uploadSignature, uploadSecondSignature, resetTemplate };
