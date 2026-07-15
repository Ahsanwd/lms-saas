const QuizAttempt = require('../models/QuizAttempt.model');

class QuizAttemptRepository {
  findById(tenantId, id) {
    return QuizAttempt.findOne({ _id: id, tenantId });
  }

  findByIdWithDetails(tenantId, id) {
    return QuizAttempt.findOne({ _id: id, tenantId })
      .populate('userId', 'firstName lastName email')
      .populate('answers.questionId', 'text type options correctAnswer matchingPairs correctOrder explanation');
  }

  findInProgress(tenantId, quizId, userId) {
    return QuizAttempt.findOne({ tenantId, quizId, userId, status: 'in_progress' });
  }

  findByUserAndQuiz(tenantId, quizId, userId) {
    return QuizAttempt.find({ tenantId, quizId, userId }).sort({ attemptNumber: -1 });
  }

  findAllByQuiz(tenantId, quizId, filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      QuizAttempt.find({ tenantId, quizId, ...filter })
        .populate('userId', 'firstName lastName email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      QuizAttempt.countDocuments({ tenantId, quizId, ...filter }),
    ]);
  }

  countByUserAndQuiz(tenantId, quizId, userId) {
    return QuizAttempt.countDocuments({ tenantId, quizId, userId });
  }

  create(data) {
    return QuizAttempt.create(data);
  }

  updateById(tenantId, id, update) {
    return QuizAttempt.findOneAndUpdate({ _id: id, tenantId }, update, { new: true });
  }

  // Analytics aggregation
  getQuizStats(tenantId, quizId) {
    return QuizAttempt.aggregate([
      { $match: { tenantId, quizId, status: { $ne: 'in_progress' } } },
      {
        $group: {
          _id: null,
          totalAttempts: { $sum: 1 },
          avgScore: { $avg: '$percentage' },
          avgTime: { $avg: '$timeSpentSeconds' },
          passCount: { $sum: { $cond: ['$passed', 1, 0] } },
          highScore: { $max: '$percentage' },
          lowScore: { $min: '$percentage' },
        },
      },
    ]);
  }

  getScoreDistribution(tenantId, quizId) {
    return QuizAttempt.aggregate([
      { $match: { tenantId, quizId, status: { $in: ['auto_graded', 'manually_graded'] } } },
      {
        $bucket: {
          groupBy: '$percentage',
          boundaries: [0, 20, 40, 60, 80, 100],
          default: '100',
          output: { count: { $sum: 1 } },
        },
      },
    ]);
  }
}

module.exports = new QuizAttemptRepository();
