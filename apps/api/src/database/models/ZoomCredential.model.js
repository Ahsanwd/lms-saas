const mongoose = require('mongoose');

const zoomCredentialSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    // connectedBy: the tenant_admin who authorized the Zoom connection
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

// One Zoom account per tenant
zoomCredentialSchema.index({ tenantId: 1 }, { unique: true });

module.exports = mongoose.model('ZoomCredential', zoomCredentialSchema);
