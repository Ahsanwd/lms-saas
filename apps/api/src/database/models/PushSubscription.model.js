const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema(
  {
    tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    endpoint:  { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
    },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

// One subscription object per endpoint (browser tab / device)
pushSubscriptionSchema.index({ tenantId: 1, userId: 1 });
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
