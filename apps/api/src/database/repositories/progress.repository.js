const LessonProgress = require('../models/LessonProgress.model');
const CourseProgress = require('../models/CourseProgress.model');

class ProgressRepository {
  // ── Lesson Progress ──────────────────────────────────────────────────────────
  getLessonProgress(tenantId, userId, lessonId) {
    return LessonProgress.findOne({ tenantId, userId, lessonId });
  }

  getCourseProgressDetails(tenantId, userId, courseId) {
    return LessonProgress.find({ tenantId, userId, courseId });
  }

  upsertLessonProgress(tenantId, userId, lessonId, data) {
    return LessonProgress.findOneAndUpdate(
      { tenantId, userId, lessonId },
      { $set: { tenantId, userId, ...data, lastAccessedAt: new Date() } },
      { upsert: true, new: true }
    );
  }

  countCompletedLessons(tenantId, userId, courseId) {
    return LessonProgress.countDocuments({ tenantId, userId, courseId, status: 'completed' });
  }

  saveVideoPosition(tenantId, userId, lessonId, courseId, sectionId, seconds) {
    return LessonProgress.findOneAndUpdate(
      { tenantId, userId, lessonId },
      {
        $set: {
          tenantId, userId, lessonId, courseId, sectionId,
          watchedDurationSeconds: seconds,
          lastAccessedAt: new Date(),
        },
        $setOnInsert: { status: 'in_progress' },
      },
      { upsert: true, new: true }
    );
  }

  // ── Course Progress ──────────────────────────────────────────────────────────
  getCourseProgress(tenantId, userId, courseId) {
    return CourseProgress.findOne({ tenantId, userId, courseId });
  }

  upsertCourseProgress(tenantId, userId, courseId, data) {
    return CourseProgress.findOneAndUpdate(
      { tenantId, userId, courseId },
      { $set: { tenantId, userId, courseId, ...data, lastAccessedAt: new Date() } },
      { upsert: true, new: true }
    );
  }
}

module.exports = new ProgressRepository();
