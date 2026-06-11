const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true, unique: true },
    refreshTokenHash: { type: String, required: true, select: false },
    deviceInfo: {
      ua: { type: String, default: null },
      ip: { type: String, default: null },
      os: { type: String, default: null },
      browser: { type: String, default: null },
    },
    revoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// tenantId always first in compound indexes
sessionSchema.index({ tenantId: 1, userId: 1 });
sessionSchema.index({ sessionId: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

module.exports = mongoose.model('Session', sessionSchema);
