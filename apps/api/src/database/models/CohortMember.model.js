const mongoose = require('mongoose');

const cohortMemberSchema = new mongoose.Schema(
  {
    tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    cohortId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort', required: true },
    courseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    enrolledAt:  { type: Date, default: Date.now },
    graduatedAt: { type: Date, default: null },
    graduatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type:    String,
      enum:    ['enrolled', 'graduated', 'dropped'],
      default: 'enrolled',
    },
  },
  { timestamps: true }
);

cohortMemberSchema.index({ tenantId: 1, cohortId: 1 });
cohortMemberSchema.index({ tenantId: 1, cohortId: 1, userId: 1 }, { unique: true });
cohortMemberSchema.index({ tenantId: 1, userId: 1 });

module.exports = mongoose.model('CohortMember', cohortMemberSchema);
