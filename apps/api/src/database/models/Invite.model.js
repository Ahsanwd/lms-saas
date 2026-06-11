const mongoose = require('mongoose');

// Invite tokens for role-based user onboarding (instructor, tenant_admin).
// Token is single-use and expires in 72 hours.
const inviteSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ['student', 'instructor', 'tenant_admin'],
      required: true,
    },
    name: { type: String, default: null },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired', 'revoked'],
      default: 'pending',
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

inviteSchema.index({ tenantId: 1, email: 1, status: 1 });
inviteSchema.index({ tokenHash: 1 }, { select: false });
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Invite', inviteSchema);
