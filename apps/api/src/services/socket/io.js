let _io = null;

function setIO(io) { _io = io; }
function getIO()    { return _io; }

/**
 * Emit a billing:updated event to all connected sockets in a tenant room.
 * Safe to call from cron jobs and webhook handlers — no-ops if Socket.IO is not
 * yet initialised or if the room has no connected clients.
 */
function emitBillingUpdated(tenantId, payload = {}) {
  if (!_io || !tenantId) return;
  _io.to(`tenant:${tenantId}`).emit('billing:updated', {
    tenantId: tenantId.toString(),
    ...payload,
  });
}

function emitDashboardUpdated(tenantId, payload = {}) {
  if (!_io || !tenantId) return;
  _io.to(`tenant:${tenantId}`).emit('dashboard:updated', {
    tenantId: tenantId.toString(),
    ...payload,
  });
}

function emitGroupMessage(groupId, message) {
  if (!_io || !groupId) return;
  _io.to(`group:${groupId}`).emit('group:message', message);
}

// Push a freshly-created notification straight to the recipient's open tabs.
// No-ops if Socket.IO isn't ready or the user has no connected socket — the
// 60s polling fallback in the frontend still picks it up either way.
function emitNotificationNew(userId, notification) {
  if (!_io || !userId) return;
  _io.to(`user:${userId}`).emit('notification:new', notification);
}

module.exports = {
  setIO, getIO, emitBillingUpdated, emitDashboardUpdated, emitGroupMessage,
  emitNotificationNew,
};
