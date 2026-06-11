const Assignment = require('../models/Assignment.model');

class AssignmentRepository {
  findAll(tenantId, filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId, deletedAt: null, ...filter };
    return Promise.all([
      Assignment.find(query)
        .populate('courseId', 'title')
        .populate('instructorId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Assignment.countDocuments(query),
    ]);
  }

  findById(tenantId, id) {
    return Assignment.findOne({ _id: id, tenantId, deletedAt: null })
      .populate('courseId', 'title instructorId')
      .populate('instructorId', 'firstName lastName email')
      .populate('lessonId', 'title');
  }

  findByCourse(tenantId, courseId, filter = {}) {
    return Assignment.find({ tenantId, courseId, deletedAt: null, ...filter })
      .sort({ createdAt: -1 });
  }

  create(data) {
    return Assignment.create(data);
  }

  updateById(tenantId, id, update) {
    return Assignment.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { $set: update },
      { new: true, runValidators: false }
    )
      .populate('courseId', 'title')
      .populate('instructorId', 'firstName lastName email');
  }

  incrementCounter(tenantId, id, field, amount = 1) {
    return Assignment.findOneAndUpdate(
      { _id: id, tenantId },
      { $inc: { [field]: amount } },
      { new: true }
    );
  }

  async softDelete(tenantId, id, userId) {
    const doc = await Assignment.findOne({ _id: id, tenantId, deletedAt: null });
    if (!doc) return null;
    return doc.softDelete(userId);
  }
}

module.exports = new AssignmentRepository();
