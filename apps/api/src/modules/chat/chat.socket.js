const { verifyAccessToken } = require('../../utils/jwt');
const logger = require('../../utils/logger');

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

    socket.on('join_conversation', (conversationId) => {
      if (conversationId) socket.join(`conv:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
      if (conversationId) socket.leave(`conv:${conversationId}`);
    });

    socket.on('typing', ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      socket.to(`conv:${conversationId}`).emit('typing', {
        conversationId,
        userId,
        senderName: socket.user.name || '',
        isTyping: !!isTyping,
      });
    });

    socket.on('join_group', (groupId) => {
      if (groupId) socket.join(`group:${groupId}`);
    });

    socket.on('leave_group', (groupId) => {
      if (groupId) socket.leave(`group:${groupId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Chat socket disconnected: ${userId}`);
    });
  });
};
