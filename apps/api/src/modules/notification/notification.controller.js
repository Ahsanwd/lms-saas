const svc = require('./notification.service');
const R   = require('../../utils/response');

async function listNotifications(req, res, next) {
  try {
    const { page, limit, unreadOnly, type } = req.query;
    const result = await svc.list(req.tenant.tenantId, req.user.sub, {
      page, limit, unreadOnly: unreadOnly === 'true', type: type || null,
    });
    R.success(res, result);
  } catch (err) { next(err); }
}

async function listGrouped(req, res, next) {
  try {
    const result = await svc.listGrouped(req.tenant.tenantId, req.user.sub);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getUnreadCount(req, res, next) {
  try {
    const result = await svc.unreadCount(req.tenant.tenantId, req.user.sub);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    await svc.markRead(req.tenant.tenantId, req.user.sub, req.params.id);
    R.success(res, {}, 'Marked as read');
  } catch (err) { next(err); }
}

async function markAllRead(req, res, next) {
  try {
    await svc.markAllRead(req.tenant.tenantId, req.user.sub);
    R.success(res, {}, 'All marked as read');
  } catch (err) { next(err); }
}

async function deleteNotification(req, res, next) {
  try {
    await svc.remove(req.tenant.tenantId, req.user.sub, req.params.id);
    R.success(res, {}, 'Deleted');
  } catch (err) { next(err); }
}

async function getPreferences(req, res, next) {
  try {
    const result = await svc.getPreferences(req.tenant.tenantId, req.user.sub);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function updatePreferences(req, res, next) {
  try {
    if (!req.body.preferences || typeof req.body.preferences !== 'object') {
      return R.error(res, 'preferences object is required', 400);
    }
    const result = await svc.updatePreferences(req.tenant.tenantId, req.user.sub, req.body.preferences);
    R.success(res, result, 'Preferences saved');
  } catch (err) { next(err); }
}

async function getFailedEmails(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await svc.getFailedEmails(req.tenant.tenantId, { page, limit });
    R.success(res, result);
  } catch (err) { next(err); }
}

module.exports = {
  listNotifications, listGrouped, getUnreadCount, markRead, markAllRead, deleteNotification,
  getPreferences, updatePreferences, getFailedEmails,
};
