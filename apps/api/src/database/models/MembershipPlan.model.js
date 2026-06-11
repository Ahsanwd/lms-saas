const mongoose = require('mongoose');

// Tenant-created plans offered to students (e.g. "Basic $9.99/mo, all courses")
const membershipPlanSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },

    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    monthlyPrice: { type: Number, required: true, min: 0 }, // USD
    yearlyPrice:  { type: Number, required: true, min: 0 }, // USD

    // 'all' = every published course in this tenant
    // 'selected' = only courses listed in the courses array
    courseAccess: { type: String, enum: ['all', 'selected'], default: 'all' },
    courses:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],

    features:  [{ type: String }],   // bullet points shown on the plan card
    trialDays: { type: Number, default: 0 },
    sortOrder: { type: Number, default: 0 },
    isActive:  { type: Boolean, default: true },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

membershipPlanSchema.index({ tenantId: 1, isActive: 1 });
membershipPlanSchema.index({ tenantId: 1, deletedAt: 1 });

module.exports = mongoose.model('MembershipPlan', membershipPlanSchema);
