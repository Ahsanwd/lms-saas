const Conversation = require('../models/Conversation.model');
const ChatMessage  = require('../models/ChatMessage.model');

class ChatRepository {
  // ── Conversations ──────────────────────────────────────────────────────────

  findConversationById(tenantId, id) {
    return Conversation.findOne({ _id: id, tenantId, deletedAt: null });
  }

  findConversationByParticipants(tenantId, courseId, studentId) {
    return Conversation.findOne({ tenantId, courseId, studentId, deletedAt: null });
  }

  createConversation(data) {
    return Conversation.create(data);
  }

  findConversationsForStudent(tenantId, studentId) {
    return Conversation.find({ tenantId, studentId, deletedAt: null })
      .sort({ lastMessageAt: -1 });
  }

  findConversationsForInstructor(tenantId, instructorId) {
    return Conversation.find({ tenantId, instructorId, deletedAt: null })
      .sort({ lastMessageAt: -1 });
  }

  findAllConversations(tenantId, { page = 1, limit = 20, courseId } = {}) {
    const skip  = (Number(page) - 1) * Number(limit);
    const query = { tenantId, deletedAt: null };
    if (courseId) query.courseId = courseId;
    return Promise.all([
      Conversation.find(query).sort({ lastMessageAt: -1 }).skip(skip).limit(Number(limit)),
      Conversation.countDocuments(query),
    ]);
  }

  updateConversation(tenantId, id, update) {
    return Conversation.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  closeConversation(tenantId, id) {
    return Conversation.findOneAndUpdate({ _id: id, tenantId }, { status: 'closed' }, { new: true });
  }

  deleteConversation(tenantId, id) {
    return Conversation.findOneAndUpdate({ _id: id, tenantId }, { deletedAt: new Date() });
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  findMessages(tenantId, conversationId, { page = 1, limit = 50 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      ChatMessage.find({ tenantId, conversationId, deletedAt: null })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(Number(limit)),
      ChatMessage.countDocuments({ tenantId, conversationId, deletedAt: null }),
    ]);
  }

  findMessageById(tenantId, id) {
    return ChatMessage.findOne({ _id: id, tenantId, deletedAt: null });
  }

  createMessage(data) {
    return ChatMessage.create(data);
  }

  updateMessage(tenantId, id, update) {
    return ChatMessage.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  softDeleteMessage(tenantId, id) {
    return ChatMessage.findOneAndUpdate({ _id: id, tenantId }, { deletedAt: new Date() });
  }

  countUnread(tenantId, conversationId, afterDate) {
    return ChatMessage.countDocuments({
      tenantId, conversationId, deletedAt: null,
      createdAt: { $gt: afterDate },
    });
  }

  searchMessages(tenantId, conversationId, q, { page = 1, limit = 20 } = {}) {
    const skip   = (Number(page) - 1) * Number(limit);
    const safe   = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = { tenantId, conversationId, deletedAt: null, text: { $regex: safe, $options: 'i' } };
    return Promise.all([
      ChatMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      ChatMessage.countDocuments(filter),
    ]);
  }
}

module.exports = new ChatRepository();
