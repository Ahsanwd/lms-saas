const LiveAttendance = require('../models/LiveAttendance.model');

class LiveAttendanceRepository {
  // Upsert a record (one per user per lesson)
  upsert(tenantId, lessonId, userId, update) {
    return LiveAttendance.findOneAndUpdate(
      { tenantId, lessonId, userId },
      { $set: update },
      { upsert: true, new: true }
    );
  }

  findByUserAndLesson(tenantId, lessonId, userId) {
    return LiveAttendance.findOne({ tenantId, lessonId, userId });
  }

  // All attendance records for a session (instructor report)
  listByLesson(tenantId, lessonId) {
    return LiveAttendance.find({ tenantId, lessonId })
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: 1 });
  }

  // Student's attendance history across a course
  listByCourseAndUser(tenantId, courseId, userId) {
    return LiveAttendance.find({ tenantId, courseId, userId })
      .sort({ createdAt: -1 });
  }

  updateById(id, update) {
    return LiveAttendance.findByIdAndUpdate(id, { $set: update }, { new: true });
  }

  countAttended(tenantId, lessonId) {
    return LiveAttendance.countDocuments({ tenantId, lessonId, status: { $in: ['attended', 'partial'] } });
  }
}

module.exports = new LiveAttendanceRepository();
