const chatRepo       = require('../../database/repositories/chat.repository');
const courseRepo     = require('../../database/repositories/course.repository');
const enrollmentRepo = require('../../database/repositories/enrollment.repository');
const userRepo       = require('../../database/repositories/user.repository');
const AppError       = require('../../utils/AppError');

// ── Helpers ────────────────────────────────────────────────────────────────────

function fullName(user) {
  return user.firstName && user.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.name || user.email;
}

async function getConversationOrThrow(tenantId, id) {
  const conv = await chatRepo.findConversationById(tenantId, id);
  if (!conv) throw new AppError('Conversation not found', 404);
  return conv;
}

function assertParticipant(conv, user) {
  const isStudent    = conv.studentId.toString()    === user.sub;
  const isInstructor = conv.instructorId.toString() === user.sub;
  const isAdmin      = user.role === 'tenant_admin';
  if (!isStudent && !isInstructor && !isAdmin) throw new AppError('Access denied', 403);
  return { isStudent, isInstructor, isAdmin };
}

// ── Conversations ──────────────────────────────────────────────────────────────

async function listConversations(tenantId, user, query) {
  if (user.role === 'student') {
    const list = await chatRepo.findConversationsForStudent(tenantId, user.sub);
    return { conversations: list };
  }

  if (user.role === 'instructor') {
    const list = await chatRepo.findConversationsForInstructor(tenantId, user.sub);
    return { conversations: list };
  }

  // tenant_admin: paginated list of all conversations, optional courseId filter
  const [conversations, total] = await chatRepo.findAllConversations(tenantId, query);
  const page  = Number(query.page  || 1);
  const limit = Number(query.limit || 20);
  return { conversations, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
}

async function startConversation(tenantId, user, body) {
  if (user.role !== 'student') throw new AppError('Only students can start conversations', 403);

  const { courseId } = body;
  if (!courseId) throw new AppError('courseId is required', 400);

  // Verify course exists and student is enrolled
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);

  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, courseId);
  if (!enrollment || !['active', 'completed'].includes(enrollment.status))
    throw new AppError('You must be enrolled in this course to chat with the instructor', 403);

  // Return existing conversation if already started
  const existing = await chatRepo.findConversationByParticipants(tenantId, courseId, user.sub);
  if (existing) return { conversation: existing, created: false };

  // Fetch names
  const [studentDoc, instructorDoc] = await Promise.all([
    userRepo.findByIdRaw(user.sub),
    userRepo.findByIdRaw(course.instructorId),
  ]);

  const conv = await chatRepo.createConversation({
    tenantId,
    courseId,
    studentId:      user.sub,
    instructorId:   course.instructorId,
    studentName:    fullName(studentDoc),
    instructorName: fullName(instructorDoc),
    courseName:     course.title,
  });

  return { conversation: conv, created: true };
}

async function getConversation(tenantId, id, user) {
  const conv = await getConversationOrThrow(tenantId, id);
  assertParticipant(conv, user);
  return { conversation: conv };
}

async function closeConversation(tenantId, id, user) {
  if (user.role !== 'tenant_admin') throw new AppError('Only admins can close conversations', 403);
  const conv = await getConversationOrThrow(tenantId, id);
  return chatRepo.closeConversation(tenantId, conv._id);
}

async function deleteConversation(tenantId, id, user) {
  if (user.role !== 'tenant_admin') throw new AppError('Only admins can delete conversations', 403);
  await getConversationOrThrow(tenantId, id);
  await chatRepo.deleteConversation(tenantId, id);
}

// ── Messages ───────────────────────────────────────────────────────────────────

async function getMessages(tenantId, conversationId, user, query) {
  const conv = await getConversationOrThrow(tenantId, conversationId);
  assertParticipant(conv, user);

  const [messages, total] = await chatRepo.findMessages(tenantId, conversationId, query);
  const page  = Number(query.page  || 1);
  const limit = Number(query.limit || 50);

  // Mark conversation as read for this user
  const isStudent = conv.studentId.toString() === user.sub;
  const unreadUpdate = isStudent ? { studentUnread: 0 } : {};
  if (!isStudent && conv.instructorId.toString() === user.sub) unreadUpdate.instructorUnread = 0;
  if (Object.keys(unreadUpdate).length) {
    await chatRepo.updateConversation(tenantId, conversationId, unreadUpdate);
  }

  return { messages, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
}

async function sendMessage(tenantId, conversationId, user, body, io, file) {
  const conv = await getConversationOrThrow(tenantId, conversationId);
  const { isStudent } = assertParticipant(conv, user);

  if (conv.status === 'closed') throw new AppError('This conversation is closed', 400);

  const text = body?.text?.trim() || null;
  if (!text && !file) throw new AppError('A text or file is required', 400);

  const senderDoc = await userRepo.findByIdRaw(user.sub);
  const message = await chatRepo.createMessage({
    tenantId,
    conversationId,
    senderId:   user.sub,
    senderName: fullName(senderDoc),
    senderRole: user.role,
    text,
    ...(file && { file }),
  });

  const lastMessage = text || file.name;
  const unreadInc = isStudent
    ? { $inc: { instructorUnread: 1 }, lastMessage, lastMessageAt: new Date() }
    : { $inc: { studentUnread:    1 }, lastMessage, lastMessageAt: new Date() };
  await chatRepo.updateConversation(tenantId, conversationId, unreadInc);

  if (io) {
    // Deliver to conversation room (all participants currently viewing it)
    io.to(`conv:${conversationId}`).emit('new_message', { conversationId, message });

    // Notify the recipient's personal room so they get an alert even on other pages
    const recipientId = isStudent
      ? conv.instructorId.toString()
      : conv.studentId.toString();
    io.to(`user:${recipientId}`).emit('chat_notification', {
      conversationId,
      senderName: fullName(senderDoc),
      preview: text ? text.slice(0, 80) : `📎 ${file.name}`,
    });
  }

  return { message };
}

async function editMessage(tenantId, conversationId, messageId, user, body) {
  const conv = await getConversationOrThrow(tenantId, conversationId);
  assertParticipant(conv, user);

  if (!body?.text?.trim()) throw new AppError('text is required', 400);

  const msg = await chatRepo.findMessageById(tenantId, messageId);
  if (!msg) throw new AppError('Message not found', 404);
  if (msg.conversationId.toString() !== conversationId)
    throw new AppError('Message not found', 404);

  const isOwner = msg.senderId.toString() === user.sub;
  if (!isOwner && user.role !== 'tenant_admin') throw new AppError('Forbidden', 403);

  const updated = await chatRepo.updateMessage(tenantId, messageId, {
    text: body.text.trim(), editedAt: new Date(),
  });

  return { message: updated };
}

async function deleteMessage(tenantId, conversationId, messageId, user, io) {
  const conv = await getConversationOrThrow(tenantId, conversationId);
  assertParticipant(conv, user);

  const msg = await chatRepo.findMessageById(tenantId, messageId);
  if (!msg) throw new AppError('Message not found', 404);
  if (msg.conversationId.toString() !== conversationId)
    throw new AppError('Message not found', 404);

  const isOwner = msg.senderId.toString() === user.sub;
  if (!isOwner && user.role !== 'tenant_admin') throw new AppError('Forbidden', 403);

  await chatRepo.softDeleteMessage(tenantId, messageId);

  if (io) {
    io.to(`conv:${conversationId}`).emit('message_deleted', { conversationId, messageId });
  }
}

async function searchMessages(tenantId, conversationId, user, query) {
  const conv = await getConversationOrThrow(tenantId, conversationId);
  assertParticipant(conv, user);

  const q = (query.q || '').trim();
  if (!q) throw new AppError('q is required', 400);

  const [messages, total] = await chatRepo.searchMessages(
    tenantId, conversationId, q, { page: query.page, limit: query.limit || 20 }
  );
  return { messages, total };
}

// Unread count is based on which side of each conversation this user is on
// (studentId / instructorId), not their account role — a tenant_admin who is
// also assigned as the instructor on a course still needs their unread count.
async function getTotalUnread(tenantId, user) {
  const [asStudent, asInstructor] = await Promise.all([
    chatRepo.findConversationsForStudent(tenantId, user.sub),
    chatRepo.findConversationsForInstructor(tenantId, user.sub),
  ]);
  const count =
    asStudent.reduce((acc, c) => acc + (c.studentUnread || 0), 0) +
    asInstructor.reduce((acc, c) => acc + (c.instructorUnread || 0), 0);
  return { count };
}

module.exports = {
  listConversations,
  startConversation,
  getConversation,
  closeConversation,
  deleteConversation,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  searchMessages,
  getTotalUnread,
};
