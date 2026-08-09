const mongoose = require('mongoose');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');
const softDeletePlugin   = require('../plugins/softDelete.plugin');

const enrollmentLinkSchema = new mongoose.Schema(
  {
    tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',  required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    title:     { type: String, trim: true, default: null },

    courseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],

    token: { type: String, required: true, unique: true },

    isActive:  { type: Boolean, default: true },
    maxUses:   { type: Number, default: 0 },   // 0 = unlimited
    uses:      { type: Number, default: 0 },
    expiresAt: { type: Date,   default: null }, // null = no expiry

    // Charges this amount instead of the course's own price at checkout —
    // e.g. a custom rate for one specific partner/promo. Only ever set for
    // single-course, non-free links (see enrollmentLink.service.js
    // createLink); the actual amount charged is always re-verified
    // server-side against this field in payment.service.js — never trust
    // a client-supplied price.
    priceOverride: { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

enrollmentLinkSchema.index({ tenantId: 1, createdBy: 1 });
enrollmentLinkSchema.index({ token: 1 }, { unique: true });

enrollmentLinkSchema.plugin(auditFieldsPlugin);
enrollmentLinkSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('EnrollmentLink', enrollmentLinkSchema);
