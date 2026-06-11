const mongoose = require('mongoose');

// Aggregate progress per student per course — updated on each lesson completion.
// No soft delete — progress records are permanent.
const courseProgressSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    completedLessons: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },

    lastAccessedAt: { type: Date, default: Date.now },
    lastLessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

courseProgressSchema.index({ tenantId: 1, courseId: 1, userId: 1 }, { unique: true });
courseProgressSchema.index({ tenantId: 1, userId: 1 });

module.exports = mongoose.model('CourseProgress', courseProgressSchema);
