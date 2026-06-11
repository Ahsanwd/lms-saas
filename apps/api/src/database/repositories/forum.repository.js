const ForumThread = require('../models/ForumThread.model');
const ForumReply  = require('../models/ForumReply.model');

class ForumRepository {
  // ── Threads ────────────────────────────────────────────────────────────────

  listThreads(tenantId, courseId, { sort = 'latest', page = 1, limit = 20, tag } = {}) {
    const filter = { tenantId, courseId, deletedAt: null };
    if (tag) filter.tags = tag;

    let sortBy;
    if (sort === 'top')    sortBy = { isPinned: -1, likes: -1, replyCount: -1 };
    else if (sort === 'unanswered') { filter.replyCount = 0; sortBy = { isPinned: -1, createdAt: -1 }; }
    else                  sortBy = { isPinned: -1, lastActivityAt: -1 };

    const skip = (page - 1) * limit;
    const query = ForumThread.find(filter).sort(sortBy).skip(skip).limit(limit)
      .select('-likes');
    const count = ForumThread.countDocuments(filter);
    return Promise.all([query, count]);
  }

  findThreadById(tenantId, threadId) {
    return ForumThread.findOne({ _id: threadId, tenantId, deletedAt: null });
  }

  createThread(data) {
    return ForumThread.create(data);
  }

  updateThread(tenantId, threadId, update) {
    return ForumThread.findOneAndUpdate(
      { _id: threadId, tenantId },
      update,
      { new: true }
    );
  }

  softDeleteThread(tenantId, threadId) {
    return ForumThread.findOneAndUpdate(
      { _id: threadId, tenantId },
      { deletedAt: new Date() }
    );
  }

  incrementViews(tenantId, threadId) {
    return ForumThread.findOneAndUpdate(
      { _id: threadId, tenantId },
      { $inc: { views: 1 } }
    );
  }

  countThreads(tenantId, courseId) {
    return ForumThread.countDocuments({ tenantId, courseId, deletedAt: null });
  }

  // Admin: all threads across tenant (for moderation)
  adminListThreads(tenantId, { page = 1, limit = 20, courseId } = {}) {
    const filter = { tenantId, deletedAt: null };
    if (courseId) filter.courseId = courseId;
    const skip = (page - 1) * limit;
    const query = ForumThread.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('courseId', 'title').select('-likes');
    const count = ForumThread.countDocuments(filter);
    return Promise.all([query, count]);
  }

  // ── Replies ────────────────────────────────────────────────────────────────

  listReplies(tenantId, threadId) {
    return ForumReply.find({ tenantId, threadId, deletedAt: null })
      .sort({ createdAt: 1 });
  }

  findReplyById(tenantId, replyId) {
    return ForumReply.findOne({ _id: replyId, tenantId, deletedAt: null });
  }

  createReply(data) {
    return ForumReply.create(data);
  }

  updateReply(tenantId, replyId, update) {
    return ForumReply.findOneAndUpdate(
      { _id: replyId, tenantId },
      update,
      { new: true }
    );
  }

  softDeleteReply(tenantId, replyId) {
    return ForumReply.findOneAndUpdate(
      { _id: replyId, tenantId },
      { deletedAt: new Date() }
    );
  }

  // Clear accepted flag on all replies in a thread (before setting a new accepted)
  clearAccepted(tenantId, threadId) {
    return ForumReply.updateMany(
      { tenantId, threadId },
      { isAccepted: false }
    );
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  subscribeThread(tenantId, threadId, userId) {
    return ForumThread.findOneAndUpdate(
      { _id: threadId, tenantId },
      { $addToSet: { subscribers: userId } },
      { new: true }
    );
  }

  unsubscribeThread(tenantId, threadId, userId) {
    return ForumThread.findOneAndUpdate(
      { _id: threadId, tenantId },
      { $pull: { subscribers: userId } },
      { new: true }
    );
  }

  // ── Flags ──────────────────────────────────────────────────────────────────

  flagThread(tenantId, threadId, userId, reason) {
    // Only add flag if this user hasn't already flagged
    return ForumThread.findOneAndUpdate(
      { _id: threadId, tenantId, 'flags.userId': { $ne: userId } },
      { $push: { flags: { userId, reason } } },
      { new: true }
    );
  }

  clearThreadFlags(tenantId, threadId) {
    return ForumThread.findOneAndUpdate(
      { _id: threadId, tenantId },
      { $set: { flags: [] } },
      { new: true }
    );
  }

  flagReply(tenantId, replyId, userId, reason) {
    return ForumReply.findOneAndUpdate(
      { _id: replyId, tenantId, 'flags.userId': { $ne: userId } },
      { $push: { flags: { userId, reason } } },
      { new: true }
    );
  }

  clearReplyFlags(tenantId, replyId) {
    return ForumReply.findOneAndUpdate(
      { _id: replyId, tenantId },
      { $set: { flags: [] } },
      { new: true }
    );
  }

  listFlaggedContent(tenantId, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const threadQ = ForumThread.find({ tenantId, deletedAt: null, 'flags.0': { $exists: true } })
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('courseId', 'title').select('-likes -subscribers');
    const replyQ = ForumReply.find({ tenantId, deletedAt: null, 'flags.0': { $exists: true } })
      .sort({ createdAt: -1 }).skip(skip).limit(limit);
    return Promise.all([threadQ, replyQ]);
  }
}

module.exports = new ForumRepository();
