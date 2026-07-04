const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

// A tenant-defined product bundling several existing courses under one fixed
// one-time price. Students buying a bundle get permanent access to every
// course in it, same access semantics as a single-course purchase.
const courseBundleSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },

    courseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true }],

    price: { type: Number, required: true, min: 0 }, // whole currency units (dollars), same convention as Course.price

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

courseBundleSchema.index({ tenantId: 1, status: 1 });

courseBundleSchema.plugin(softDeletePlugin);
courseBundleSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('CourseBundle', courseBundleSchema);
