const AuthAuditLog = require('../models/AuthAuditLog.model');

class AuthAuditLogRepository {
  // Fire-and-forget — never blocks the auth flow on failure
  log({ tenantId = null, userId = null, email = null, event, ip = null, userAgent = null, meta = null }) {
    AuthAuditLog.create({ tenantId, userId, email, event, ip, userAgent, meta }).catch(() => {});
  }

  findByUser(tenantId, userId, { limit = 50, skip = 0 } = {}) {
    return AuthAuditLog.find({ tenantId, userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  findByTenant(tenantId, { event, limit = 100, skip = 0 } = {}) {
    const filter = { tenantId };
    if (event) filter.event = event;
    return AuthAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  countByTenant(tenantId, { event, since } = {}) {
    const filter = { tenantId };
    if (event) filter.event = event;
    if (since) filter.createdAt = { $gte: since };
    return AuthAuditLog.countDocuments(filter);
  }
}

module.exports = new AuthAuditLogRepository();
