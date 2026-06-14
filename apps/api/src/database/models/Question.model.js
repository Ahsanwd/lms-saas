const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

// Option schema shared by MC, MS, TF, ordering, image question types
const optionSchema = new mongoose.Schema({
  text: { type: String, default: null },
  imageUrl: { type: String, default: null },
  isCorrect: { type: Boolean, default: false },
}, { _id: true });

// Used by matching question type
const matchingPairSchema = new mongoose.Schema({
  left: { type: String, required: true },
  right: { type: String, required: true },
}, { _id: true });

const questionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },

    type: {
      type: String,
      required: true,
      enum: [
        'multiple_choice',  // single correct option
        'multiple_select',  // multiple correct options
        'true_false',
        'fill_blank',       // text input, compared as string
        'short_answer',     // text input, manual or keyword match
        'essay',            // always manually graded
        'matching',         // match left column to right column
        'ordering',         // arrange items in correct order
        'image',            // image-based MC question
      ],
    },

    text: { type: String, required: true },      // question body
    imageUrl: { type: String, default: null },    // for image question type

    // MC, MS, TF, ordering, image
    options: [optionSchema],

    // Matching type
    matchingPairs: [matchingPairSchema],

    // Fill blank / short answer — expected correct answer string
    correctAnswer: { type: String, default: null },

    // Ordering — correct sequence of item texts e.g. ['Step 1', 'Step 2']
    correctOrder: [{ type: String }],

    explanation: { type: String, default: null },

    points: { type: Number, default: 1, min: 0 },
    negativePoints: { type: Number, default: 0, min: 0 },

    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },

    tags: [{ type: String, lowercase: true, trim: true }],
    isPublic: { type: Boolean, default: false }, // share across courses in tenant
    timeLimitSeconds: { type: Number, default: 0, min: 0 }, // 0 = no per-question limit
  },
  { timestamps: true }
);

questionSchema.index({ tenantId: 1, courseId: 1, type: 1 });
questionSchema.index({ tenantId: 1, tags: 1 });
questionSchema.index({ tenantId: 1, instructorId: 1 });

questionSchema.plugin(softDeletePlugin);
questionSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Question', questionSchema);
