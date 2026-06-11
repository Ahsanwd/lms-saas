const mongoose = require('mongoose');

// No soft delete — progress records are append/update only, never deleted.
const lessonProgressSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },

    watchedDurationSeconds: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    lastAccessedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

lessonProgressSchema.index({ tenantId: 1, courseId: 1, userId: 1 });
lessonProgressSchema.index({ tenantId: 1, lessonId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('LessonProgress', lessonProgressSchema);
