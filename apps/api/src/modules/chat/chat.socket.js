const { verifyAccessToken } = require('../../utils/jwt');
const logger = require('../../utils/logger');
const Conversation = require('../../database/models/Conversation.model');
const Group = require('../../database/models/Group.model');

// join_conversation/join_group took the room id on faith with no lookup at
// all, so any authenticated socket — any role, any tenant — could join
// `conv:<id>`/`group:<id>` for a conversation/group it has no part in and
// silently receive other people's live messages. The REST layer already
// enforces this (assertParticipant in chat.service.js); the socket layer
// needs the same check before allowing a join.
async function canJoinConversation(user, conversationId) {
  const conv = await Conversation.findOne({ _id: conversationId, tenantId: user.tenantId, deletedAt: null }).lean();
  if (!conv) return false;
  if (user.role === 'tenant_admin') return true;
  return conv.studentId.toString() === user.sub || conv.instructorId.toString() === user.sub;
}

async function canJoinGroup(user, groupId) {
  const group = await Group.findOne({ _id: groupId, tenantId: user.tenantId, deletedAt: null }).lean();
  if (!group) return false;
  if (user.role === 'tenant_admin') return true;
  return (group.members ?? []).some(id => id.toString() === user.sub);
}

module.exports = function registerChatSocket(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token'));
      socket.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId   = socket.user.sub;
    const tenantId = socket.user.tenantId;
    socket.join(`user:${userId}`);
    if (tenantId) socket.join(`tenant:${tenantId}`);

    socket.on('join_conversation', async (conversationId) => {
      if (!conversationId) return;
      try {
        if (await canJoinConversation(socket.user, conversationId)) socket.join(`conv:${conversationId}`);
      } catch (err) { logger.debug(`join_conversation check failed: ${err.message}`); }
    });

    socket.on('leave_conversation', (conversationId) => {
      if (conversationId) socket.leave(`conv:${conversationId}`);
    });

    socket.on('typing', ({ conversationId, isTyping }) => {
      // Only relay into rooms this socket actually joined (and joining now
      // requires passing canJoinConversation) — cheaper than a DB lookup on
      // every keystroke, and closes the same "broadcast into any conv id"
      // gap without a per-event query.
      if (!conversationId || !socket.rooms.has(`conv:${conversationId}`)) return;
      socket.to(`conv:${conversationId}`).emit('typing', {
        conversationId,
        userId,
        senderName: socket.user.name || '',
        isTyping: !!isTyping,
      });
    });

    socket.on('join_group', async (groupId) => {
      if (!groupId) return;
      try {
        if (await canJoinGroup(socket.user, groupId)) socket.join(`group:${groupId}`);
      } catch (err) { logger.debug(`join_group check failed: ${err.message}`); }
    });

    socket.on('leave_group', (groupId) => {
      if (groupId) socket.leave(`group:${groupId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Chat socket disconnected: ${userId}`);
    });
  });
};
