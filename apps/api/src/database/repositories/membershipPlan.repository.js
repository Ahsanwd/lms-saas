const MembershipPlan = require('../models/MembershipPlan.model');

class MembershipPlanRepository {
  findAll(tenantId, { includeInactive = false } = {}) {
    const filter = { tenantId, deletedAt: null };
    if (!includeInactive) filter.isActive = true;
    return MembershipPlan.find(filter)
      .populate('courses', 'title thumbnail')
      .sort({ sortOrder: 1, createdAt: 1 });
  }

  findById(tenantId, id) {
    return MembershipPlan.findOne({ _id: id, tenantId, deletedAt: null })
      .populate('courses', 'title thumbnail');
  }

  create(data) {
    return MembershipPlan.create(data);
  }

  updateById(tenantId, id, update) {
    return MembershipPlan.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { $set: update },
      { new: true }
    ).populate('courses', 'title thumbnail');
  }

  softDelete(tenantId, id) {
    return MembershipPlan.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { $set: { deletedAt: new Date(), isActive: false } },
      { new: true }
    );
  }
}

module.exports = new MembershipPlanRepository();
