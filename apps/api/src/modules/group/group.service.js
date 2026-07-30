const Group              = require('../../database/models/Group.model');
const Course             = require('../../database/models/Course.model');
const Enrollment         = require('../../database/models/Enrollment.model');
const User               = require('../../database/models/User.model');
const GroupMessage       = require('../../database/models/GroupMessage.model');
const GroupAnnouncement  = require('../../database/models/GroupAnnouncement.model');
const AppError           = require('../../utils/AppError');

function calcExpiresAt(days) {
  if (!days || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────
async function listGroups(tenantId) {
  return Group.find({ tenantId, deletedAt: null })
    .sort({ createdAt: -1 })
    .populate('members', 'firstName lastName email avatar')
    .populate('enrolledCourses', 'title thumbnail status');
}

async function createGroup(tenantId, { name, description, memberIds = [] }, actingUser) {
  if (!name?.trim()) throw new AppError('Group name is required', 400);
  return Group.create({
    tenantId, name: name.trim(), description: description?.trim() || '',
    members: memberIds,
    createdBy: actingUser.sub, updatedBy: actingUser.sub,
  });
}

async function updateGroup(tenantId, groupId, data) {
  const group = await Group.findOne({ _id: groupId, tenantId, deletedAt: null });
  if (!group) throw new AppError('Group not found', 404);
  if (data.name)               group.name = data.name.trim();
  if (data.description !== undefined) group.description = data.description;
  return group.save();
}

async function deleteGroup(tenantId, groupId) {
  const group = await Group.findOne({ _id: groupId, tenantId, deletedAt: null });
  if (!group) throw new AppError('Group not found', 404);
  group.deletedAt = new Date();
  await group.save();
}

// ─── Member management ─────────────────────────────────────────────────────────
async function addMembers(tenantId, groupId, userIds) {
  const group = await Group.findOne({ _id: groupId, tenantId, deletedAt: null });
  if (!group) throw new AppError('Group not found', 404);
  const newIds = userIds.filter(id => !group.members.map(m => m.toString()).includes(id.toString()));
  group.members.push(...newIds);
  await group.save();

  // A group's "enrolled in" list is meant to describe every CURRENT member's
  // access, not a one-time snapshot from whenever "Enroll in Course" was
  // last clicked — otherwise someone added later silently has no access to
  // courses the rest of the group already has. Backfill them in now.
  const backfilledCourses = [];
  if (newIds.length > 0 && group.enrolledCourses.length > 0) {
    const courses = await Course.find({ _id: { $in: group.enrolledCourses }, tenantId, deletedAt: null });
    for (const course of courses) {
      await _enrollUsersInCourse(tenantId, course, newIds);
      backfilledCourses.push(course.title);
    }
  }

  return { group, backfilledCourses };
}

async function removeMembers(tenantId, groupId, userIds) {
  const group = await Group.findOne({ _id: groupId, tenantId, deletedAt: null });
  if (!group) throw new AppError('Group not found', 404);
  group.members = group.members.filter(m => !userIds.map(String).includes(m.toString()));
  return group.save();
}

// Shared by enrollGroupInCourse (explicit bulk-enroll action) and addMembers'
// backfill (implicit — keeping a late-joining member's access in sync with
// the rest of the group).
async function _enrollUsersInCourse(tenantId, course, userIds) {
  const expiresAt = calcExpiresAt(course.accessDurationDays);
  const results = { enrolled: [], skipped: [] };

  for (const userId of userIds) {
    const existing = await Enrollment.findOne({ tenantId, courseId: course._id, userId });
    // 'completed' skips the same as 'active' — this only checked 'active',
    // so adding a student who'd already finished the course to a group
    // silently reactivated them (same bug confirmed live via
    // course.service.js's adminEnrollUser).
    if (existing && ['active', 'completed'].includes(existing.status)) { results.skipped.push(userId.toString()); continue; }

    if (existing) {
      await Enrollment.updateOne({ _id: existing._id }, {
        status: 'active', enrolledAt: new Date(), droppedAt: null, expiresAt,
      });
    } else {
      await Enrollment.create({
        tenantId, courseId: course._id, userId,
        pricePaid: 0, discountAmount: 0, couponCode: null, expiresAt,
      });
      await Course.updateOne({ _id: course._id, tenantId }, { $inc: { enrollmentCount: 1 } });
    }
    results.enrolled.push(userId.toString());
  }

  return results;
}

// ─── Bulk-enroll group into a course ──────────────────────────────────────────
async function enrollGroupInCourse(tenantId, groupId, courseId, actingUser) {
  const [group, course] = await Promise.all([
    Group.findOne({ _id: groupId, tenantId, deletedAt: null }),
    Course.findOne({ _id: courseId, tenantId, deletedAt: null }),
  ]);
  if (!group)  throw new AppError('Group not found', 404);
  if (!course) throw new AppError('Course not found', 404);

  const results = await _enrollUsersInCourse(tenantId, course, group.members);

  if (!group.enrolledCourses.map(c => c.toString()).includes(courseId.toString())) {
    group.enrolledCourses.push(courseId);
    await group.save();
  }

  return results;
}

// ─── Lookup user by email ──────────────────────────────────────────────────────
async function findUserByEmail(tenantId, email) {
  const user = await User.findOne({ tenantId, email: email.toLowerCase(), deletedAt: null });
  if (!user) throw new AppError('User not found', 404);
  return { _id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, avatar: user.avatar };
}

// ─── Group Chat ────────────────────────────────────────────────────────────────
async function listMessages(tenantId, groupId, { page = 1, limit = 50 } = {}) {
  const group = await Group.findOne({ _id: groupId, tenantId, deletedAt: null });
  if (!group) throw new AppError('Group not found', 404);

  const skip = (Math.max(1, page) - 1) * limit;
  const messages = await GroupMessage.find({ tenantId, groupId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('senderId', 'firstName lastName avatar')
    .lean();

  return messages.reverse();
}

async function sendMessage(tenantId, groupId, senderId, text) {
  const group = await Group.findOne({ _id: groupId, tenantId, deletedAt: null });
  if (!group) throw new AppError('Group not found', 404);
  if (!text?.trim()) throw new AppError('Message text is required', 400);

  const msg = await GroupMessage.create({ tenantId, groupId, senderId, text: text.trim() });
  const populated = await GroupMessage.findById(msg._id)
    .populate('senderId', 'firstName lastName avatar')
    .lean();

  // Emit real-time event to all group members
  const { emitGroupMessage } = require('../../services/socket/io');
  emitGroupMessage(groupId.toString(), populated);

  return populated;
}

// ─── Group Announcements ───────────────────────────────────────────────────────
async function listAnnouncements(tenantId, groupId) {
  const group = await Group.findOne({ _id: groupId, tenantId, deletedAt: null });
  if (!group) throw new AppError('Group not found', 404);

  return GroupAnnouncement.find({ tenantId, groupId })
    .sort({ createdAt: -1 })
    .populate('authorId', 'firstName lastName')
    .lean();
}

async function createAnnouncement(tenantId, groupId, authorId, { title, body }) {
  const group = await Group.findOne({ _id: groupId, tenantId, deletedAt: null });
  if (!group) throw new AppError('Group not found', 404);
  if (!title?.trim()) throw new AppError('Title is required', 400);
  if (!body?.trim())  throw new AppError('Body is required', 400);

  const ann = await GroupAnnouncement.create({
    tenantId, groupId, authorId,
    title: title.trim(),
    body:  body.trim(),
  });

  // Group announcements have no student-facing page of their own — the only
  // way a member ever sees one is via their Notifications bell, same as
  // every other announcement/event in the app.
  if (group.members.length > 0) {
    const notifySvc = require('../notification/notification.service');
    const preview = body.trim().length > 140 ? `${body.trim().slice(0, 140)}…` : body.trim();
    notifySvc.createBulk(tenantId, group.members, {
      type: 'group_announcement',
      title: title.trim(),
      message: preview,
      link: null,
    }).catch(() => {});
  }

  return GroupAnnouncement.findById(ann._id)
    .populate('authorId', 'firstName lastName')
    .lean();
}

async function deleteAnnouncement(tenantId, groupId, announcementId) {
  const ann = await GroupAnnouncement.findOne({ _id: announcementId, tenantId, groupId });
  if (!ann) throw new AppError('Announcement not found', 404);
  await GroupAnnouncement.deleteOne({ _id: announcementId });
}

module.exports = {
  listGroups, createGroup, updateGroup, deleteGroup,
  addMembers, removeMembers, enrollGroupInCourse, findUserByEmail,
  listMessages, sendMessage,
  listAnnouncements, createAnnouncement, deleteAnnouncement,
};
