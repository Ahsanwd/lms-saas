const Announcement = require('../models/Announcement.model');

const POPULATE_AUTHOR = { path: 'authorId', select: 'firstName lastName avatar' };
const POPULATE_COURSE = { path: 'courseId', select: 'title' };
const POPULATE_COHORT = { path: 'cohortId', select: 'name' };

class AnnouncementRepository {
  findAll(tenantId, filter = {}) {
    return Announcement.find({ tenantId, deletedAt: null, ...filter })
      .populate(POPULATE_AUTHOR)
      .populate(POPULATE_COURSE)
      .populate(POPULATE_COHORT)
      .sort({ publishedAt: -1, createdAt: -1 });
  }

  findById(tenantId, id) {
    return Announcement.findOne({ _id: id, tenantId, deletedAt: null })
      .populate(POPULATE_AUTHOR)
      .populate(POPULATE_COURSE)
      .populate(POPULATE_COHORT);
  }

  create(data) {
    return Announcement.create(data);
  }

  updateById(tenantId, id, update) {
    return Announcement.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      update,
      { new: true }
    ).populate(POPULATE_AUTHOR).populate(POPULATE_COURSE).populate(POPULATE_COHORT);
  }

  async softDelete(tenantId, id, userId) {
    const doc = await this.findById(tenantId, id);
    if (!doc) return null;
    return doc.softDelete(userId);
  }
}

module.exports = new AnnouncementRepository();
