const Media = require('../models/Media.model');

class MediaRepository {
  findAll(tenantId, filter = {}, { page = 1, limit = 20, sort = { createdAt: -1 } } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId, deletedAt: null, ...filter };
    return Promise.all([
      Media.find(query)
        .populate('createdBy', 'firstName lastName avatar')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Media.countDocuments(query),
    ]);
  }

  findById(tenantId, id) {
    return Media.findOne({ _id: id, tenantId, deletedAt: null });
  }

  softDelete(tenantId, id, userId) {
    return Media.findOne({ _id: id, tenantId, deletedAt: null }).then(doc => {
      if (!doc) return null;
      return doc.softDelete(userId);
    });
  }
}

module.exports = new MediaRepository();
