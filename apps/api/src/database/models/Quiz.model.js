const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

// Each question entry in a quiz — can override per-question points
const quizQuestionSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  order: { type: Number, default: 0 },
  points: { type: Number, default: null },        // null = use question default
  negativePoints: { type: Number, default: null }, // null = use question default
}, { _id: false });

const quizSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
    instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    instructions: { type: String, default: null },

    questions: [quizQuestionSchema],

    // Random question pool config (used instead of fixed questions list)
    randomConfig: {
      enabled: { type: Boolean, default: false },
      count: { type: Number, default: 10 },
      fromCourseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
      tags: [{ type: String }],
      difficulty: { type: String, enum: ['easy', 'medium', 'hard', 'any'], default: 'any' },
    },

    settings: {
      timer: {
        enabled: { type: Boolean, default: false },
        durationMinutes: { type: Number, default: 30 },
      },
      maxAttempts: { type: Number, default: 1 },    // 0 = unlimited
      passingScore: { type: Number, default: 70 },  // percentage
      negativeMarking: { type: Boolean, default: false },
      shuffleQuestions: { type: Boolean, default: false },
      shuffleOptions: { type: Boolean, default: false },
      showCorrectAnswers: { type: Boolean, default: false }, // after submission
      showExplanations: { type: Boolean, default: false },
      allowRetake: { type: Boolean, default: true },
      triggerCertificate: { type: Boolean, default: false }, // issue cert when student passes
    },

    gradingType: {
      type: String,
      enum: ['auto', 'manual', 'mixed'], // mixed = has essay + other types
      default: 'auto',
    },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    publishedAt: { type: Date, default: null },

    // Denormalized
    totalQuestions: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    attemptCount: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
  },
  { timestamps: true }
);

quizSchema.index({ tenantId: 1, courseId: 1, status: 1 });
quizSchema.index({ tenantId: 1, lessonId: 1 });

quizSchema.plugin(softDeletePlugin);
quizSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Quiz', quizSchema);
