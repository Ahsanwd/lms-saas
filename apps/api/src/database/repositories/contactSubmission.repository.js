const ContactSubmission = require('../models/ContactSubmission.model');

class ContactSubmissionRepository {
  findAll(tenantId, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId, deletedAt: null };
    return Promise.all([
      ContactSubmission.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      ContactSubmission.countDocuments(query),
    ]);
  }

  findById(tenantId, id) {
    return ContactSubmission.findOne({ _id: id, tenantId, deletedAt: null });
  }

  create(data) {
    return ContactSubmission.create(data);
  }

  updateById(tenantId, id, update) {
    return ContactSubmission.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  markEmailDelivered(id, delivered) {
    return ContactSubmission.findByIdAndUpdate(id, { emailDelivered: delivered });
  }

  countUnread(tenantId) {
    return ContactSubmission.countDocuments({ tenantId, status: 'new', deletedAt: null });
  }
}

module.exports = new ContactSubmissionRepository();
