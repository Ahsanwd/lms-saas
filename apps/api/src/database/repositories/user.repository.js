const User = require('../models/User.model');

class UserRepository {
  findByEmail(tenantId, email) {
    // Super admin has tenantId: null — match null explicitly when no tenant context
    const filter = tenantId
      ? { tenantId, email, deletedAt: null }
      : { tenantId: null, email, deletedAt: null };
    return User.findOne(filter)
      .select('+passwordHash +loginAttempts +lockUntil +emailVerification +passwordReset');
  }

  findById(tenantId, userId) {
    return User.findOne({ tenantId, _id: userId, deletedAt: null });
  }

  findByIdRaw(userId) {
    return User.findOne({ _id: userId, deletedAt: null });
  }

  create(data) {
    return User.create(data);
  }

  updateById(id, update) {
    return User.findByIdAndUpdate(id, update, { new: true });
  }

  incrementLoginAttempts(id) {
    return User.findByIdAndUpdate(id, { $inc: { loginAttempts: 1 } });
  }

  lockAccount(id, until) {
    return User.findByIdAndUpdate(id, { loginAttempts: 5, lockUntil: until });
  }

  resetLoginAttempts(id) {
    return User.findByIdAndUpdate(id, { loginAttempts: 0, lockUntil: null });
  }

  findByGoogleId(tenantId, googleId) {
    return User.findOne({ tenantId, googleId, deletedAt: null }).select('+googleId');
  }

  // Selects sensitive 2FA fields needed for setup/verify flows
  findByIdWith2FA(tenantId, userId) {
    return User.findOne({ tenantId, _id: userId, deletedAt: null })
      .select('+twoFactor.secretEncrypted +twoFactor.backupCodes +twoFactor.pendingSecret');
  }
}

module.exports = new UserRepository();
