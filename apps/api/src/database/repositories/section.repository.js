const Section = require('../models/Section.model');

class SectionRepository {
  findByCourse(tenantId, courseId) {
    return Section.find({ tenantId, courseId, deletedAt: null }).sort({ order: 1 });
  }

  findById(tenantId, id) {
    return Section.findOne({ _id: id, tenantId, deletedAt: null });
  }

  create(data) {
    return Section.create(data);
  }

  updateById(tenantId, id, update) {
    return Section.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  // Bulk reorder — receives array of { id, order }
  async reorder(tenantId, courseId, items) {
    const ops = items.map(({ id, order }) => ({
      updateOne: {
        filter: { _id: id, tenantId, courseId },
        update: { $set: { order } },
      },
    }));
    return Section.bulkWrite(ops);
  }

  incrementCounter(tenantId, id, fields) {
    return Section.findOneAndUpdate({ _id: id, tenantId }, { $inc: fields });
  }

  async softDelete(tenantId, id, userId) {
    const section = await this.findById(tenantId, id);
    if (!section) return null;
    return section.softDelete(userId);
  }
}

module.exports = new SectionRepository();
