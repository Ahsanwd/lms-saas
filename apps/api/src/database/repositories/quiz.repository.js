const Quiz = require('../models/Quiz.model');

class QuizRepository {
  findAll(tenantId, filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId, deletedAt: null, ...filter };
    return Promise.all([
      Quiz.find(query)
        .populate('instructorId', 'name avatar')
        .populate('courseId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Quiz.countDocuments(query),
    ]);
  }

  findById(tenantId, id) {
    return Quiz.findOne({ _id: id, tenantId, deletedAt: null })
      .populate('questions.questionId');
  }

  findByLesson(tenantId, lessonId) {
    return Quiz.findOne({ tenantId, lessonId, deletedAt: null });
  }

  create(data) {
    return Quiz.create(data);
  }

  async updateById(tenantId, id, update) {
    const doc = await Quiz.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: update },
      { new: true, runValidators: false }
    );
    if (doc) await doc.populate('courseId', 'title');
    return doc;
  }

  updateCounters(tenantId, id, { totalQuestions, totalPoints }) {
    return Quiz.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: { totalQuestions, totalPoints } },
      { new: true }
    );
  }

  async softDelete(tenantId, id, userId) {
    const quiz = await Quiz.findOne({ _id: id, tenantId, deletedAt: null });
    if (!quiz) return null;
    return quiz.softDelete(userId);
  }
}

module.exports = new QuizRepository();
