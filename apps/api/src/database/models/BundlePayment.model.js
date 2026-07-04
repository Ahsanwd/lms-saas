const mongoose = require('mongoose');

// Immutable financial record for bundle purchases. Mirrors CoursePayment.model.js
// but references multiple courses/enrollments — a bundle payment activates N
// courses in one transaction, so it can't reuse CoursePayment's singular refs.
const bundlePaymentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    bundleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseBundle', required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    courseIds:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],     // snapshot at purchase time
    enrollmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' }], // filled in on confirm

    amount:         { type: Number, required: true, min: 0 }, // in cents
    currency:       { type: String, default: 'usd' },
    discountAmount: { type: Number, default: 0 },
    couponCode:     { type: String, default: null },

    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },

    paymentIntentId: { type: String, default: null }, // pi_xxx or mock_pi_xxx (Stripe)
    safepayTracker:  { type: String, default: null }, // track_xxx — Safepay hosted-checkout session
    provider:        { type: String, enum: ['mock', 'stripe', 'safepay'], default: 'mock' },

    paidAt:       { type: Date, default: null },
    refundedAt:   { type: Date, default: null },
    refundedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    refundReason: { type: String, default: null },

    receiptNumber: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

bundlePaymentSchema.index({ tenantId: 1, userId: 1, status: 1 });
bundlePaymentSchema.index({ tenantId: 1, bundleId: 1 });
bundlePaymentSchema.index({ paymentIntentId: 1 });

module.exports = mongoose.model('BundlePayment', bundlePaymentSchema);
