const mongoose = require('mongoose');

const authAuditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null },
    email:    { type: String, default: null },
    event: {
      type: String,
      enum: [
        'register', 'register_tenant',
        'login', 'login_google',
        'failed_login', 'account_locked',
        'logout', 'logout_all',
        'email_verified',
        'password_reset_request', 'password_reset',
        '2fa_enabled', '2fa_disabled', '2fa_verify_failed',
      ],
      required: true,
    },
    ip:        { type: String, default: null },
    userAgent: { type: String, default: null },
    meta:      { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// Auto-delete logs older than 90 days
authAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
authAuditLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
authAuditLogSchema.index({ tenantId: 1, event: 1 });

module.exports = mongoose.model('AuthAuditLog', authAuditLogSchema);
