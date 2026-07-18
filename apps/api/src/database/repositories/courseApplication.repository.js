const CourseApplication = require('../models/CourseApplication.model');

class CourseApplicationRepository {
  findAll(tenantId, { courseId, status, page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId, deletedAt: null };
    if (courseId) query.courseId = courseId;
    if (status) query.status = status;
    return Promise.all([
      CourseApplication.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('courseId', 'title'),
      CourseApplication.countDocuments(query),
    ]);
  }

  findById(tenantId, id) {
    return CourseApplication.findOne({ _id: id, tenantId, deletedAt: null });
  }

  create(data) {
    return CourseApplication.create(data);
  }

  updateById(tenantId, id, update) {
    return CourseApplication.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  countPending(tenantId) {
    return CourseApplication.countDocuments({ tenantId, status: 'pending', deletedAt: null });
  }
}

module.exports = new CourseApplicationRepository();
