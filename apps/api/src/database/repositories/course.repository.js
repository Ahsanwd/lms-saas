const Course = require('../models/Course.model');

class CourseRepository {
  findAll(tenantId, filter = {}, { page = 1, limit = 20, sort = { createdAt: -1 } } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId, deletedAt: null, ...filter };
    return Promise.all([
      Course.find(query)
        .populate('categoryId', 'name slug')
        .populate('instructorId', 'name avatar')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Course.countDocuments(query),
    ]);
  }

  findById(tenantId, id) {
    return Course.findOne({ _id: id, tenantId, deletedAt: null })
      .populate('categoryId', 'name slug')
      .populate('instructorId', 'name avatar email');
  }

  findBySlug(tenantId, slug) {
    return Course.findOne({ tenantId, slug, deletedAt: null });
  }

  create(data) {
    return Course.create(data);
  }

  updateById(tenantId, id, update) {
    return Course.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  incrementCounter(tenantId, id, fields) {
    return Course.findOneAndUpdate({ _id: id, tenantId }, { $inc: fields });
  }

  async softDelete(tenantId, id, userId) {
    const course = await Course.findOne({ _id: id, tenantId, deletedAt: null });
    if (!course) return null;
    return course.softDelete(userId);
  }

  findPublishedPublic(tenantId, { hiddenCategories = [] } = {}) {
    const filter = { tenantId, status: 'published', deletedAt: null, showOnStorefront: { $ne: false } };
    if (hiddenCategories.length > 0) filter.categoryId = { $nin: hiddenCategories };
    return Course.find(filter)
      .select('title slug shortDescription thumbnail price isFree level enrollmentCount rating totalLessons totalDurationSeconds instructorId categoryId showOnStorefront')
      .populate('instructorId', 'firstName lastName avatar')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .lean();
  }
}

module.exports = new CourseRepository();
