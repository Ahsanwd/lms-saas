const mongoose = require('mongoose');

// Enrollment is immutable — no soft delete, no audit plugin.
// Financial/access records must be preserved for history.
const enrollmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      enum: ['active', 'completed', 'dropped', 'expired'],
      default: 'active',
    },

    enrolledAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    droppedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    // Snapshot at enrollment time
    pricePaid:      { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    couponCode:     { type: String, default: null },

    // Trial / Audit mode
    isTrial:      { type: Boolean, default: false },
    trialEndsAt:  { type: Date,    default: null },
    upgradedAt:   { type: Date,    default: null }, // when trial converted to full

    certificateIssued:    { type: Boolean, default: false },
    certificateIssuedAt:  { type: Date, default: null },
    certificateExpiresAt: { type: Date, default: null },
    // Human-readable ID for QR verification (e.g. CERT-AB12C-XY34Z) — see
    // the partial unique index below.
    certificateId: { type: String, default: null },

    // Revocation (immutable audit trail once set)
    certificateRevoked:      { type: Boolean, default: false },
    certificateRevokedAt:    { type: Date, default: null },
    certificateRevokedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    certificateRevokeReason: { type: String, default: null },
  },
  { timestamps: true }
);

// tenantId first — compound unique prevents double enrollment
enrollmentSchema.index({ tenantId: 1, courseId: 1, userId: 1 }, { unique: true });
enrollmentSchema.index({ tenantId: 1, userId: 1, status: 1 });
enrollmentSchema.index({ tenantId: 1, courseId: 1, status: 1 });
// Partial unique — only enforced where certificateId is an actual string, so
// the many enrollments with certificateId still null (never completed) don't
// collide with each other under the index. Guards against the (astronomically
// unlikely, but free to prevent) case of generateCertificateId() colliding.
enrollmentSchema.index(
  { certificateId: 1 },
  { unique: true, partialFilterExpression: { certificateId: { $type: 'string' } } }
);

module.exports = mongoose.model('Enrollment', enrollmentSchema);
