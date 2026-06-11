const crypto = require('crypto');
const Invite = require('../models/Invite.model');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

class InviteRepository {
  findPendingByEmail(tenantId, email) {
    return Invite.findOne({ tenantId, email, status: 'pending' });
  }

  findByTokenHash(tokenHash) {
    return Invite.findOne({ tokenHash, status: 'pending' }).select('+tokenHash');
  }

  findByRawToken(rawToken) {
    return this.findByTokenHash(hashToken(rawToken));
  }

  create({ tenantId, email, role, name, rawToken, invitedBy, expiresInHours = 72 }) {
    return Invite.create({
      tenantId,
      email,
      role,
      name,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
      invitedBy,
    });
  }

  markAccepted(id) {
    return Invite.findByIdAndUpdate(id, { status: 'accepted', acceptedAt: new Date() }, { new: true });
  }

  revoke(id) {
    return Invite.findByIdAndUpdate(id, { status: 'revoked' }, { new: true });
  }

  listByTenant(tenantId, filter = {}) {
    return Invite.find({ tenantId, ...filter }).populate('invitedBy', 'name email');
  }
}

module.exports = new InviteRepository();
