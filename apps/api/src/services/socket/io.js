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

module.exports = { setIO, getIO, emitBillingUpdated, emitDashboardUpdated, emitGroupMessage };
