const mongoose = require('mongoose');

// Per-answer record — embedded in attempt for atomicity
const answerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  questionType: { type: String, required: true },

  // Student's answer — flexible to support all types:
  // MC/TF/image   → selectedOptionId (String)
  // MS            → selectedOptionIds ([String])
  // fill_blank/SA → textAnswer (String)
  // essay         → textAnswer (String)
  // matching      → matchingAnswer ([{ left, right }])
  // ordering      → orderingAnswer ([String]) — option IDs in student's order
  selectedOptionId: { type: String, default: null },
  selectedOptionIds: [{ type: String }],
  textAnswer: { type: String, default: null },
  matchingAnswer: [{ left: String, right: String }],
  orderingAnswer: [{ type: String }],

  isCorrect: { type: Boolean, default: null },     // null = not graded yet
  pointsAwarded: { type: Number, default: 0 },
  maxPoints: { type: Number, default: 0 },
  feedback: { type: String, default: null },       // instructor feedback (manual grading)
}, { _id: true });

// No soft delete — attempts are immutable records
const quizAttemptSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    attemptNumber: { type: Number, required: true, default: 1 },

    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'auto_graded', 'manually_graded', 'pending_manual'],
      default: 'in_progress',
    },

    answers: [answerSchema],

    // Snapshot of questions served (for random quiz reproducibility)
    servedQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],

    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },

    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
    gradedAt: { type: Date, default: null },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    timeSpentSeconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

quizAttemptSchema.index({ tenantId: 1, quizId: 1, userId: 1 });
quizAttemptSchema.index({ tenantId: 1, userId: 1, status: 1 });
quizAttemptSchema.index({ tenantId: 1, quizId: 1, status: 1 });

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
