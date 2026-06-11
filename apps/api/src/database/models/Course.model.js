const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const courseSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: null },
    shortDescription: { type: String, default: null, maxlength: 300 },
    thumbnail: { type: String, default: null },

    instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },

    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'all'],
      default: 'all',
    },
    language: { type: String, default: 'en' },
    tags: [{ type: String, lowercase: true, trim: true }],

    price: { type: Number, default: 0, min: 0 },
    isFree: { type: Boolean, default: true },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    publishedAt: { type: Date, default: null },

    requirements: [{ type: String }],
    objectives: [{ type: String }],

    // Denormalized counters — updated on section/lesson changes
    totalSections: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    totalDurationSeconds: { type: Number, default: 0 },

    enrollmentCount: { type: Number, default: 0 },
    capacity: { type: Number, default: 0 }, // 0 = unlimited
    waitlistEnabled: { type: Boolean, default: false },

    // Enrollment access control
    enrollmentType: {
      type: String,
      enum: ['open', 'access_code', 'approval'],
      default: 'open',
    },
    accessCode: { type: String, default: null, trim: true },

    // Feature 1 — Enrollment Expiry
    accessDurationDays: { type: Number, default: 0 }, // 0 = lifetime access

    // Feature 11 — Trial / Audit Mode
    trialEnabled:     { type: Boolean, default: false },
    trialDurationDays: { type: Number, default: 7 }, // days of free trial access

    // Feature 2 — Cohorts (cohort docs reference this course; no field needed here)

    // Feature 3 — Prerequisite Courses
    prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],

    // Feature 4 — Enrollment Window
    enrollmentStartsAt: { type: Date, default: null },
    enrollmentEndsAt:   { type: Date, default: null },

    rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },

    allowPreview: { type: Boolean, default: false },
    certificateEnabled: { type: Boolean, default: true },
    passingScore: { type: Number, default: 70 },

    // Catalog display options (set by instructor/admin)
    ctaLabel: { type: String, default: '', trim: true, maxlength: 40 },
    displayLayout: {
      type: String,
      enum: ['classic', 'hero', 'minimal'],
      default: 'classic',
    },
  },
  { timestamps: true }
);

courseSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
courseSchema.index({ tenantId: 1, status: 1 });
courseSchema.index({ tenantId: 1, instructorId: 1 });
courseSchema.index({ tenantId: 1, categoryId: 1 });
courseSchema.index({ tenantId: 1, tags: 1 });

courseSchema.plugin(softDeletePlugin);
courseSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Course', courseSchema);
