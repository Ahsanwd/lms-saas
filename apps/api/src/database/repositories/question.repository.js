const Question = require('../models/Question.model');

class QuestionRepository {
  findAll(tenantId, filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId, deletedAt: null, ...filter };
    return Promise.all([
      Question.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Question.countDocuments(query),
    ]);
  }

  findById(tenantId, id) {
    return Question.findOne({ _id: id, tenantId, deletedAt: null });
  }

  findManyByIds(tenantId, ids) {
    return Question.find({ _id: { $in: ids }, tenantId, deletedAt: null });
  }

  // Used during grading — skips the soft-delete filter so that questions
  // deleted after an attempt was started can still be graded correctly.
  findManyByIdsForGrading(tenantId, ids) {
    return Question.find({ _id: { $in: ids }, tenantId });
  }

  findForRandom(tenantId, filter = {}, count = 10) {
    return Question.aggregate([
      { $match: { tenantId, deletedAt: null, ...filter } },
      { $sample: { size: count } },
    ]);
  }

  create(data) {
    return Question.create(data);
  }

  updateById(tenantId, id, update) {
    return Question.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  async softDelete(tenantId, id, userId) {
    const q = await this.findById(tenantId, id);
    if (!q) return null;
    return q.softDelete(userId);
  }
}

module.exports = new QuestionRepository();
