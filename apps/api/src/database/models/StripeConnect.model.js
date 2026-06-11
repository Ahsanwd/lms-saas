const mongoose = require('mongoose');

// One Stripe Connect record per tenant — stores the connected account ID.
// Money from course payments flows into the connected account; platform takes
// application_fee_amount automatically via Stripe Connect.
const stripeConnectSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      unique: true,
    },

    // Stripe connected account ID (acct_xxx) — the only field needed to route payments
    stripeAccountId: { type: String, required: true },

    // Cached from stripe.accounts.retrieve() — refreshed on status check
    accountEmail:    { type: String, default: null },
    chargesEnabled:  { type: Boolean, default: false },
    payoutsEnabled:  { type: Boolean, default: false },

    connectedAt: { type: Date, default: Date.now },
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

stripeConnectSchema.index({ stripeAccountId: 1 });

module.exports = mongoose.model('StripeConnect', stripeConnectSchema);
