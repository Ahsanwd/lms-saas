const Enrollment = require('../models/Enrollment.model');

class EnrollmentRepository {
  findByUserAndCourse(tenantId, userId, courseId) {
    return Enrollment.findOne({ tenantId, userId, courseId });
  }

  findByUser(tenantId, userId, filter = {}) {
    return Enrollment.find({ tenantId, userId, ...filter })
      .populate('courseId', 'title thumbnail slug instructorId level certificateEnabled totalLessons');
  }

  findByCourse(tenantId, courseId, filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      Enrollment.find({ tenantId, courseId, ...filter })
        .populate('userId', 'name email avatar')
        .skip(skip)
        .limit(Number(limit)),
      Enrollment.countDocuments({ tenantId, courseId, ...filter }),
    ]);
  }

  create(data) {
    return Enrollment.create(data);
  }

  updateByUserAndCourse(tenantId, userId, courseId, update) {
    return Enrollment.findOneAndUpdate({ tenantId, userId, courseId }, update, { new: true });
  }

  countActive(tenantId, courseId) {
    return Enrollment.countDocuments({ tenantId, courseId, status: 'active' });
  }
}

module.exports = new EnrollmentRepository();
