const Lesson = require('../models/Lesson.model');

class LessonRepository {
  findBySection(tenantId, courseId, sectionId) {
    return Lesson.find({ tenantId, courseId, sectionId, deletedAt: null }).sort({ order: 1 }).lean();
  }

  findByCourse(tenantId, courseId) {
    return Lesson.find({ tenantId, courseId, deletedAt: null }).sort({ order: 1 }).lean();
  }

  findById(tenantId, id) {
    return Lesson.findOne({ _id: id, tenantId, deletedAt: null });
  }

  create(data) {
    return Lesson.create(data);
  }

  updateById(tenantId, id, update) {
    return Lesson.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  async reorder(tenantId, sectionId, items) {
    const ops = items.map(({ id, order }) => ({
      updateOne: {
        filter: { _id: id, tenantId, sectionId },
        update: { $set: { order } },
      },
    }));
    return Lesson.bulkWrite(ops);
  }

  countPublished(tenantId, courseId) {
    return Lesson.countDocuments({ tenantId, courseId, isPublished: true, deletedAt: null });
  }

  async softDelete(tenantId, id, userId) {
    const lesson = await this.findById(tenantId, id);
    if (!lesson) return null;
    return lesson.softDelete(userId);
  }
}

module.exports = new LessonRepository();
