const svc = require('./group.service');
const R   = require('../../utils/response');

async function list(req, res, next) {
  try {
    const groups = await svc.listGroups(req.tenant.tenantId);
    R.success(res, { groups });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const group = await svc.createGroup(req.tenant.tenantId, req.body, req.user);
    R.created(res, { group }, 'Group created');
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const group = await svc.updateGroup(req.tenant.tenantId, req.params.id, req.body);
    R.success(res, { group }, 'Group updated');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await svc.deleteGroup(req.tenant.tenantId, req.params.id);
    R.success(res, {}, 'Group deleted');
  } catch (err) { next(err); }
}

async function addMembers(req, res, next) {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds)) return R.error(res, 'userIds array required', 400);
    const { group, backfilledCourses } = await svc.addMembers(req.tenant.tenantId, req.params.id, userIds);
    R.success(res, { group, backfilledCourses }, 'Members added');
  } catch (err) { next(err); }
}

async function removeMembers(req, res, next) {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds)) return R.error(res, 'userIds array required', 400);
    const group = await svc.removeMembers(req.tenant.tenantId, req.params.id, userIds);
    R.success(res, { group }, 'Members removed');
  } catch (err) { next(err); }
}

async function enrollInCourse(req, res, next) {
  try {
    const result = await svc.enrollGroupInCourse(
      req.tenant.tenantId, req.params.id, req.body.courseId, req.user
    );
    R.success(res, result, `Enrolled ${result.enrolled.length} members`);
  } catch (err) { next(err); }
}

async function findUser(req, res, next) {
  try {
    const user = await svc.findUserByEmail(req.tenant.tenantId, req.query.email);
    R.success(res, { user });
  } catch (err) { next(err); }
}

// ─── Group Chat ────────────────────────────────────────────────────────────────
async function listMessages(req, res, next) {
  try {
    const messages = await svc.listMessages(
      req.tenant.tenantId, req.params.id, req.query
    );
    R.success(res, { messages });
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    const message = await svc.sendMessage(
      req.tenant.tenantId, req.params.id, req.user.sub, req.body.text
    );
    R.created(res, { message });
  } catch (err) { next(err); }
}

// ─── Group Announcements ───────────────────────────────────────────────────────
async function listAnnouncements(req, res, next) {
  try {
    const announcements = await svc.listAnnouncements(req.tenant.tenantId, req.params.id);
    R.success(res, { announcements });
  } catch (err) { next(err); }
}

async function createAnnouncement(req, res, next) {
  try {
    const announcement = await svc.createAnnouncement(
      req.tenant.tenantId, req.params.id, req.user.sub, req.body
    );
    R.created(res, { announcement }, 'Announcement posted');
  } catch (err) { next(err); }
}

async function deleteAnnouncement(req, res, next) {
  try {
    await svc.deleteAnnouncement(req.tenant.tenantId, req.params.id, req.params.annId);
    R.success(res, {}, 'Announcement deleted');
  } catch (err) { next(err); }
}

module.exports = {
  list, create, update, remove,
  addMembers, removeMembers, enrollInCourse, findUser,
  listMessages, sendMessage,
  listAnnouncements, createAnnouncement, deleteAnnouncement,
};
