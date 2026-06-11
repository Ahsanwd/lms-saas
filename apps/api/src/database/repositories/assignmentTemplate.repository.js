const AssignmentTemplate = require('../models/AssignmentTemplate.model');

class AssignmentTemplateRepository {
  findAll(tenantId, filter = {}) {
    return AssignmentTemplate.find({ tenantId, ...filter, deletedAt: null })
      .sort({ createdAt: -1 });
  }

  findById(tenantId, id) {
    return AssignmentTemplate.findOne({ _id: id, tenantId, deletedAt: null });
  }

  create(data) {
    return AssignmentTemplate.create(data);
  }

  softDelete(tenantId, id, userId) {
    return AssignmentTemplate.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { deletedAt: new Date(), deletedBy: userId },
      { new: true }
    );
  }
}

module.exports = new AssignmentTemplateRepository();
