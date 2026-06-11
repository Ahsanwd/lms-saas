const Plan = require('../models/Plan.model');

class PlanRepository {
  findAll(filter = {}) {
    return Plan.find({ isActive: true, ...filter });
  }

  findById(id) {
    return Plan.findById(id);
  }

  findBySlug(slug) {
    return Plan.findOne({ slug, isActive: true });
  }

  create(data) {
    return Plan.create(data);
  }

  updateById(id, update) {
    return Plan.findByIdAndUpdate(id, update, { new: true });
  }
}

module.exports = new PlanRepository();
