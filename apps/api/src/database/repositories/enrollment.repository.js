const Enrollment = require('../models/Enrollment.model');

class EnrollmentRepository {
  findByUserAndCourse(tenantId, userId, courseId) {
    return Enrollment.findOne({ tenantId, userId, courseId });
  }

  // Unlike findByUserAndCourse, scoped to the active record — a user can
  // accumulate multiple enrollment docs over time (drop + re-enroll), and an
  // unfiltered findOne has no guaranteed ordering across them.
  findActiveByUserAndCourse(tenantId, userId, courseId) {
    return Enrollment.findOne({ tenantId, userId, courseId, status: 'active' });
  }

  findByUser(tenantId, userId, filter = {}) {
    return Enrollment.find({ tenantId, userId, ...filter })
      .populate('courseId', 'title thumbnail slug instructorId level certificateEnabled totalLessons');
  }

  findByCourse(tenantId, courseId, filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      Enrollment.find({ tenantId, courseId, ...filter })
        .populate('userId', 'firstName lastName email avatar')
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

  updateById(enrollmentId, update) {
    return Enrollment.findByIdAndUpdate(enrollmentId, update, { new: true });
  }

  countActive(tenantId, courseId) {
    return Enrollment.countDocuments({ tenantId, courseId, status: 'active' });
  }
}

module.exports = new EnrollmentRepository();
