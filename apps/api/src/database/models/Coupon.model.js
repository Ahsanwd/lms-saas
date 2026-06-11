const mongoose = require('mongoose');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');
const softDeletePlugin = require('../plugins/softDelete.plugin');

const couponSchema = new mongoose.Schema(
  {
    // null tenantId = platform-wide coupon (created by Super Admin)
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },

    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, default: null },

    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },

    // Applicable plans — empty = all plans
    applicablePlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }],

    maxUses: { type: Number, default: 0 },  // 0 = unlimited
    usedCount: { type: Number, default: 0 },

    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },

    // Per-tenant usage tracking
    usedByTenants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }],
    onePerTenant: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, expiresAt: 1 });

couponSchema.plugin(softDeletePlugin);
couponSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Coupon', couponSchema);
