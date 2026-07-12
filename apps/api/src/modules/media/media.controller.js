const mediaService = require('./media.service');
const R = require('../../utils/response');

async function listMedia(req, res, next) {
  try {
    const result = await mediaService.listMedia(req.tenant.tenantId, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function deleteMedia(req, res, next) {
  try {
    const result = await mediaService.deleteMedia(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, result, 'Media deleted');
  } catch (err) { next(err); }
}

module.exports = { listMedia, deleteMedia };
