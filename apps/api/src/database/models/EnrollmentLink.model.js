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
  },
  { timestamps: true }
);

enrollmentLinkSchema.index({ tenantId: 1, createdBy: 1 });
enrollmentLinkSchema.index({ token: 1 }, { unique: true });

enrollmentLinkSchema.plugin(auditFieldsPlugin);
enrollmentLinkSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('EnrollmentLink', enrollmentLinkSchema);
