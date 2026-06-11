const crypto = require('crypto');
const Session = require('../models/Session.model');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

class SessionRepository {
  findBySessionId(sessionId) {
    return Session.findOne({ sessionId, revoked: false }).select('+refreshTokenHash');
  }

  findAllByUser(tenantId, userId) {
    return Session.find({ tenantId, userId, revoked: false, expiresAt: { $gt: new Date() } });
  }

  countActiveSessions(tenantId, userId) {
    return Session.countDocuments({
      tenantId,
      userId,
      revoked: false,
      expiresAt: { $gt: new Date() },
    });
  }

  create({ tenantId, userId, sessionId, refreshToken, deviceInfo, expiresAt }) {
    return Session.create({
      tenantId,
      userId,
      sessionId,
      refreshTokenHash: hashToken(refreshToken),
      deviceInfo,
      expiresAt,
    });
  }

  async rotate(sessionId, newRefreshToken, newExpiresAt) {
    const expiresAt = newExpiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return Session.findOneAndUpdate(
      { sessionId },
      {
        refreshTokenHash: hashToken(newRefreshToken),
        lastUsedAt: new Date(),
        expiresAt,
      },
      { new: true }
    );
  }

  revokeBySessionId(sessionId) {
    return Session.findOneAndUpdate(
      { sessionId },
      { revoked: true, revokedAt: new Date() },
      { new: true }
    );
  }

  revokeAllByUser(tenantId, userId) {
    return Session.updateMany(
      { tenantId, userId, revoked: false },
      { revoked: true, revokedAt: new Date() }
    );
  }

  revokeAllByTenant(tenantId) {
    return Session.updateMany(
      { tenantId, revoked: false },
      { revoked: true, revokedAt: new Date() }
    );
  }

  verifyTokenHash(session, rawToken) {
    return session.refreshTokenHash === hashToken(rawToken);
  }
}

module.exports = new SessionRepository();
