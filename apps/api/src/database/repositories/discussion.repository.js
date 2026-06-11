const Discussion = require('../models/Discussion.model');

class DiscussionRepository {
  findTopLevel(tenantId, lessonId) {
    return Discussion.find({ tenantId, lessonId, parentId: null, deletedAt: null })
      .sort({ isPinned: -1, createdAt: -1 });
  }

  findReplies(tenantId, parentIds) {
    return Discussion.find({ tenantId, parentId: { $in: parentIds }, deletedAt: null })
      .sort({ createdAt: 1 });
  }

  findById(tenantId, id) {
    return Discussion.findOne({ _id: id, tenantId, deletedAt: null });
  }

  create(data) {
    return Discussion.create(data);
  }

  updateById(tenantId, id, update) {
    return Discussion.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  softDelete(tenantId, id) {
    return Discussion.findOneAndUpdate({ _id: id, tenantId }, { deletedAt: new Date() });
  }
}

module.exports = new DiscussionRepository();
