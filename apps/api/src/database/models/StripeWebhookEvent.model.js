const mongoose = require('mongoose');

// Permanent audit log of all Stripe webhook events — never soft-deleted
const stripeWebhookEventSchema = new mongoose.Schema(
  {
    stripeEventId: { type: String, required: true, unique: true },
    type:          { type: String, required: true },
    status:        { type: String, enum: ['received', 'processed', 'failed'], default: 'received' },
    payload:       { type: mongoose.Schema.Types.Mixed, default: null, select: false },
    processedAt:   { type: Date,   default: null },
    error:         { type: String, default: null },
  },
  { timestamps: true }
);

stripeWebhookEventSchema.index({ stripeEventId: 1 }, { unique: true });
stripeWebhookEventSchema.index({ type: 1, status: 1 });
stripeWebhookEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StripeWebhookEvent', stripeWebhookEventSchema);
