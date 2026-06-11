const mongoose = require('mongoose');

const enrollmentRequestSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    message:    { type: String, default: '' },   // student's optional note
    reviewNote: { type: String, default: '' },   // admin's note on decision
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One pending request per user per course
enrollmentRequestSchema.index({ tenantId: 1, courseId: 1, userId: 1 }, { unique: true });
enrollmentRequestSchema.index({ tenantId: 1, courseId: 1, status: 1 });
enrollmentRequestSchema.index({ tenantId: 1, userId: 1, status: 1 });

module.exports = mongoose.model('EnrollmentRequest', enrollmentRequestSchema);
