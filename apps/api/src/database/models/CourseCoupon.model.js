const mongoose = require('mongoose');

const courseCouponSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },

    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, default: '' },

    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 0 },

    // Empty array = applies to ALL courses in the tenant
    applicableCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],

    maxUses:   { type: Number, default: 0 },   // 0 = unlimited
    usedCount: { type: Number, default: 0 },

    expiresAt: { type: Date, default: null },   // null = never expires
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// One unique code per tenant
courseCouponSchema.index({ tenantId: 1, code: 1 }, { unique: true });
courseCouponSchema.index({ tenantId: 1, isActive: 1 });

module.exports = mongoose.model('CourseCoupon', courseCouponSchema);
