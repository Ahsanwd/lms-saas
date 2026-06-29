const EnrollmentLink = require('../models/EnrollmentLink.model');

module.exports = {
  create(data) {
    return EnrollmentLink.create(data);
  },

  findByToken(token) {
    return EnrollmentLink.findOne({ token, deletedAt: null })
      .populate('courseIds', 'title slug thumbnail shortDescription price isFree level totalLessons totalDurationSeconds instructorId')
      .populate({ path: 'courseIds', populate: { path: 'instructorId', select: 'firstName lastName avatar' } })
      .lean();
  },

  findByTenant(tenantId, { createdBy, page = 1, limit = 20 } = {}) {
    const filter = { tenantId, deletedAt: null };
    if (createdBy) filter.createdBy = createdBy;
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      EnrollmentLink.find(filter)
        .populate('courseIds', 'title thumbnail status')
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      EnrollmentLink.countDocuments(filter),
    ]);
  },

  findById(tenantId, id) {
    return EnrollmentLink.findOne({ _id: id, tenantId, deletedAt: null }).lean();
  },

  incrementUses(id) {
    return EnrollmentLink.findByIdAndUpdate(id, { $inc: { uses: 1 } });
  },

  deactivate(id) {
    return EnrollmentLink.findByIdAndUpdate(id, { isActive: false }, { new: true });
  },

  deleteById(id) {
    return EnrollmentLink.findByIdAndUpdate(id, { deletedAt: new Date() });
  },
};
