const mongoose = require('mongoose');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');
const softDeletePlugin = require('../plugins/softDelete.plugin');

const courseApplicationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantPage', default: null },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },

    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: null },
    gender: { type: String, enum: ['male', 'female', 'other', null], default: null },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },

    resultingUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resultingEnrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', default: null },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null },

    ip: { type: String, default: null },
  },
  { timestamps: true }
);

courseApplicationSchema.index({ tenantId: 1, createdAt: -1 });
courseApplicationSchema.index({ tenantId: 1, status: 1 });
courseApplicationSchema.index({ tenantId: 1, courseId: 1 });

courseApplicationSchema.plugin(auditFieldsPlugin);
courseApplicationSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('CourseApplication', courseApplicationSchema);
