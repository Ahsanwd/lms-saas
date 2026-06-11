const svc = require('./bookmark.service');
const R   = require('../../utils/response');

async function add(req, res, next) {
  try {
    await svc.addBookmark(req.tenant.tenantId, req.user.sub, req.params.courseId);
    R.success(res, {}, 'Bookmarked');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await svc.removeBookmark(req.tenant.tenantId, req.user.sub, req.params.courseId);
    R.success(res, {}, 'Bookmark removed');
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const bookmarks = await svc.getBookmarks(req.tenant.tenantId, req.user.sub);
    R.success(res, { bookmarks });
  } catch (err) { next(err); }
}

async function check(req, res, next) {
  try {
    const bookmarked = await svc.isBookmarked(req.tenant.tenantId, req.user.sub, req.params.courseId);
    R.success(res, { bookmarked });
  } catch (err) { next(err); }
}

module.exports = { add, remove, list, check };
