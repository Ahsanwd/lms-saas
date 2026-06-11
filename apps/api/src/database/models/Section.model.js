const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const sectionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    order: { type: Number, required: true, default: 0 },
    isPublished: { type: Boolean, default: false },

    // Denormalized — updated when lessons change
    totalLessons: { type: Number, default: 0 },
    totalDurationSeconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

sectionSchema.index({ tenantId: 1, courseId: 1, order: 1 });

sectionSchema.plugin(softDeletePlugin);
sectionSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Section', sectionSchema);
