const mongoose = require('mongoose');

// Immutable financial record for course purchases
const coursePaymentSchema = new mongoose.Schema(
  {
    tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', default: null },
    // Set when this purchase was made through an enrollment share link —
    // used to re-verify a link-specific price override server-side and to
    // credit the link's usage count once the payment actually completes.
    enrollmentLinkId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnrollmentLink', default: null },

    amount:         { type: Number, required: true, min: 0 }, // in cents
    currency:       { type: String, default: 'usd' },
    discountAmount: { type: Number, default: 0 },
    couponCode:     { type: String, default: null },

    // awaiting_review/rejected are manual-payment-only states: awaiting_review
    // means a proof screenshot was uploaded and needs admin review; rejected
    // means the admin rejected it — distinct from failed because the student
    // is expected to re-upload a new proof on the same record (see
    // uploadPaymentProof in payment.service.js).
    status: {
      type: String,
      enum: ['pending', 'awaiting_review', 'completed', 'failed', 'rejected', 'refunded'],
      default: 'pending',
    },

    // Payment provider fields
    paymentIntentId:  { type: String, default: null },   // pi_xxx or mock_pi_xxx (Stripe)
    paypalOrderId:    { type: String, default: null },   // PayPal order ID
    paypalCaptureId:  { type: String, default: null },   // PayPal capture ID (needed for refunds)
    safepayTracker:   { type: String, default: null },   // track_xxx — legacy Safepay hosted-checkout session
    provider:         { type: String, enum: ['mock', 'stripe', 'safepay', 'paypal', 'manual', 'wise'], default: 'mock' },

    // Manual payment proof (provider === 'manual' only)
    proofImageUrl:   { type: String, default: null },
    proofUploadedAt: { type: Date,   default: null },
    reviewedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:      { type: Date,   default: null },
    reviewNote:      { type: String, default: null }, // admin's approval note or rejection reason

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
