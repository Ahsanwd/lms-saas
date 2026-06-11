const mongoose = require('mongoose');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

// One active subscription per tenant at a time.
// History preserved via status changes — never deleted.
const subscriptionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },

    status: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'cancelled', 'expired'],
      default: 'active',
    },

    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly', 'manual'],
      default: 'monthly',
    },

    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },

    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    isOnTrial: { type: Boolean, default: false },

    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },

    // Plan before last change — for downgrade/upgrade history
    previousPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    planChangedAt: { type: Date, default: null },

    autoRenew: { type: Boolean, default: true },
    gracePeriodEndsAt: { type: Date, default: null },
    stripeCustomerId: { type: String, default: null },
    notes: { type: String, default: null },

    // Idempotency: tracks last date each warning level was sent (keys: '7d', '3d', '1d')
    warnings: { type: Map, of: Date, default: () => new Map() },
  },
  { timestamps: true }
);

subscriptionSchema.index({ tenantId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });

subscriptionSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Subscription', subscriptionSchema);
