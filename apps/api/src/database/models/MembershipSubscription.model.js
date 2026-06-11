const mongoose = require('mongoose');

// One active subscription per student per tenant at a time
const membershipSubscriptionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    planId:   { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', required: true },

    status: {
      type:    String,
      // 'pending' = payment initiated, awaiting confirmation
      enum:    ['pending', 'trial', 'active', 'past_due', 'cancelled', 'expired'],
      default: 'active',
    },

    billingCycle: {
      type:    String,
      enum:    ['monthly', 'yearly'],
      default: 'monthly',
    },

    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd:   { type: Date, required: true },

    trialEndsAt: { type: Date, default: null },
    autoRenew:   { type: Boolean, default: true },

    // Payment tracking (Stripe PaymentIntent ID for the current period charge)
    paymentIntentId: { type: String, default: null },
    provider:        { type: String, enum: ['mock', 'stripe'], default: 'mock' },

    // Stored for off-session renewal charging
    stripeCustomerId:      { type: String, default: null },
    stripePaymentMethodId: { type: String, default: null },

    // Renewal tracking
    renewalAttempts:      { type: Number, default: 0 },
    lastRenewalAttemptAt: { type: Date, default: null },
    renewalFailReason:    { type: String, default: null },

    // 3-day access window after 3rd failed renewal — member keeps access until this date
    gracePeriodEndsAt: { type: Date, default: null },

    cancelledAt:  { type: Date, default: null },
    cancelReason: { type: String, default: null },
  },
  { timestamps: true }
);

membershipSubscriptionSchema.index({ tenantId: 1, userId: 1 });
membershipSubscriptionSchema.index({ tenantId: 1, status: 1 });
membershipSubscriptionSchema.index({ currentPeriodEnd: 1 });
membershipSubscriptionSchema.index({ paymentIntentId: 1 });

module.exports = mongoose.model('MembershipSubscription', membershipSubscriptionSchema);
