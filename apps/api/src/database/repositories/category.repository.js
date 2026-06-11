const Category = require('../models/Category.model');

class CategoryRepository {
  findAll(tenantId, filter = {}) {
    return Category.find({ tenantId, deletedAt: null, ...filter }).sort({ order: 1, name: 1 });
  }

  findById(tenantId, id) {
    return Category.findOne({ _id: id, tenantId, deletedAt: null });
  }

  findBySlug(tenantId, slug) {
    return Category.findOne({ tenantId, slug, deletedAt: null });
  }

  create(data) {
    return Category.create(data);
  }

  updateById(tenantId, id, update) {
    return Category.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  incrementCourseCount(tenantId, id, delta = 1) {
    return Category.findOneAndUpdate({ _id: id, tenantId }, { $inc: { courseCount: delta } });
  }

  async softDelete(tenantId, id, userId) {
    const cat = await this.findById(tenantId, id);
    if (!cat) return null;
    return cat.softDelete(userId);
  }
}

module.exports = new CategoryRepository();
