const mongoose = require('mongoose');

// Invoices are immutable financial records — no soft delete, no update after paid.
const invoiceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },

    invoiceNumber: { type: String, required: true, unique: true },

    billingCycle: { type: String, enum: ['monthly', 'yearly', 'manual'], default: 'monthly' },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    currency: { type: String, default: 'usd', trim: true, lowercase: true },

    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },   // percentage e.g. 20 = 20%
    taxLabel: { type: String, default: 'Tax' },      // e.g. "VAT", "GST"
    taxAmount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    couponCode: { type: String, default: null },

    status: {
      type: String,
      enum: ['unpaid', 'paid', 'cancelled', 'refunded'],
      default: 'unpaid',
    },

    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // super admin

    notes: { type: String, default: null },
    description: { type: String, default: null },

    // Stripe payment intent ID (set when Stripe is used for payment)
    stripePaymentIntentId: { type: String, default: null },
  },
  { timestamps: true }
);

invoiceSchema.index({ tenantId: 1, status: 1 });
invoiceSchema.index({ tenantId: 1, createdAt: -1 });
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
