const mongoose = require('mongoose');

// Immutable financial record for course purchases
const coursePaymentSchema = new mongoose.Schema(
  {
    tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', default: null },

    amount:         { type: Number, required: true, min: 0 }, // in cents
    currency:       { type: String, default: 'usd' },
    discountAmount: { type: Number, default: 0 },
    couponCode:     { type: String, default: null },

    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },

    // Payment provider fields
    paymentIntentId:  { type: String, default: null },   // pi_xxx or mock_pi_xxx (Stripe)
    paypalOrderId:    { type: String, default: null },   // PayPal order ID
    paypalCaptureId:  { type: String, default: null },   // PayPal capture ID (needed for refunds)
    safepayTracker:   { type: String, default: null },   // track_xxx — Safepay hosted-checkout session
    provider:         { type: String, enum: ['mock', 'stripe', 'safepay', 'paypal'], default: 'mock' },

    paidAt:     { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    refundReason: { type: String, default: null },

    receiptNumber: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

coursePaymentSchema.index({ tenantId: 1, userId: 1, status: 1 });
coursePaymentSchema.index({ tenantId: 1, courseId: 1 });
coursePaymentSchema.index({ paymentIntentId: 1 });
coursePaymentSchema.index({ paypalOrderId: 1 });

module.exports = mongoose.model('CoursePayment', coursePaymentSchema);
