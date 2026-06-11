const mongoose = require('mongoose');

const cohortSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    name:     { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    startDate: { type: Date, default: null },
    endDate:   { type: Date, default: null },
    maxSize:   { type: Number, default: 0 }, // 0 = unlimited

    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed', 'cancelled'],
      default: 'upcoming',
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

cohortSchema.index({ tenantId: 1, courseId: 1 });
cohortSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('Cohort', cohortSchema);
