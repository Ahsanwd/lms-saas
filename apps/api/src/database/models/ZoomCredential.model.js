const mongoose = require('mongoose');

const zoomCredentialSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    // null = the tenant's shared/fallback account (connected by an admin);
    // a real User id = that instructor's own personal Zoom account.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // connectedBy: which user actually authorized this specific connection
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // AES-256-GCM encrypted via utils/crypto.js
    accessToken:  { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt:    { type: Date,   required: true },
    zoomUserId:   { type: String, default: null },
    zoomEmail:    { type: String, default: null },
  },
  { timestamps: true }
);

// One Zoom account per tenant-wide fallback (userId:null) PLUS one per
// instructor (userId:<their id>) — Mongo enforces uniqueness on null too,
// so this allows exactly one null-userId doc per tenant alongside many
// distinct non-null ones.
zoomCredentialSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ZoomCredential', zoomCredentialSchema);
