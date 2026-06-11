const service = require('./announcement.service');
const R = require('../../utils/response');

async function listAnnouncements(req, res, next) {
  try {
    const result = await service.listAnnouncements(req.tenant.tenantId, req.user, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getAnnouncement(req, res, next) {
  try {
    const result = await service.getAnnouncement(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function createAnnouncement(req, res, next) {
  try {
    if (!req.body.title?.trim()) return R.error(res, 'Title is required', 400);
    if (!req.body.body?.trim()) return R.error(res, 'Body is required', 400);
    const result = await service.createAnnouncement(req.tenant.tenantId, req.body, req.user);
    R.created(res, result);
  } catch (err) { next(err); }
}

async function updateAnnouncement(req, res, next) {
  try {
    const result = await service.updateAnnouncement(req.tenant.tenantId, req.params.id, req.body, req.user);
    R.success(res, result, 'Announcement updated');
  } catch (err) { next(err); }
}

async function publishAnnouncement(req, res, next) {
  try {
    const result = await service.publishAnnouncement(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, result, 'Published');
  } catch (err) { next(err); }
}

async function unpublishAnnouncement(req, res, next) {
  try {
    const result = await service.unpublishAnnouncement(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, result, 'Unpublished');
  } catch (err) { next(err); }
}

async function deleteAnnouncement(req, res, next) {
  try {
    await service.deleteAnnouncement(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, {}, 'Announcement deleted');
  } catch (err) { next(err); }
}

module.exports = {
  listAnnouncements, getAnnouncement, createAnnouncement,
  updateAnnouncement, publishAnnouncement, unpublishAnnouncement, deleteAnnouncement,
};
