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
  return group.save();
}

async function removeMembers(tenantId, groupId, userIds) {
  const group = await Group.findOne({ _id: groupId, tenantId, deletedAt: null });
  if (!group) throw new AppError('Group not found', 404);
  group.members = group.members.filter(m => !userIds.map(String).includes(m.toString()));
  return group.save();
}

// ─── Bulk-enroll group into a course ──────────────────────────────────────────
async function enrollGroupInCourse(tenantId, groupId, courseId, actingUser) {
  const [group, course] = await Promise.all([
    Group.findOne({ _id: groupId, tenantId, deletedAt: null }),
    Course.findOne({ _id: courseId, tenantId, deletedAt: null }),
  ]);
  if (!group)  throw new AppError('Group not found', 404);
  if (!course) throw new AppError('Course not found', 404);

  const expiresAt = calcExpiresAt(course.accessDurationDays);
  const results = { enrolled: [], skipped: [] };

  for (const userId of group.members) {
    const existing = await Enrollment.findOne({ tenantId, courseId, userId });
    if (existing?.status === 'active') { results.skipped.push(userId.toString()); continue; }

    if (existing) {
      await Enrollment.updateOne({ _id: existing._id }, {
        status: 'active', enrolledAt: new Date(), droppedAt: null, expiresAt,
      });
    } else {
      await Enrollment.create({
        tenantId, courseId, userId,
        pricePaid: 0, discountAmount: 0, couponCode: null, expiresAt,
      });
      await Course.updateOne({ _id: courseId, tenantId }, { $inc: { enrollmentCount: 1 } });
    }
    results.enrolled.push(userId.toString());
  }

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
