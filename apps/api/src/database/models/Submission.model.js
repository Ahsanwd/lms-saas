const mongoose = require('mongoose');

// Submission is immutable audit record — no soft delete, no audit plugin.
const submissionSchema = new mongoose.Schema(
  {
    tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',     required: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    studentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',       required: true },

    submissionText: { type: String, default: null },
    fileUrl:        { type: String, default: null },
    originalFileName: { type: String, default: null },

    submittedAt: { type: Date, default: Date.now },

    // Grading
    marks:    { type: Number, default: null, min: 0 },
    feedback: { type: String, default: null },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ['submitted', 'late', 'graded'],
      default: 'submitted',
    },

    // How many times this student has submitted (1 on first, increments on each re-submit)
    attemptCount: { type: Number, default: 1, min: 1 },

    // Per-criterion scores when rubric grading is used
    rubricScores: [
      {
        criterion:     { type: String, required: true },
        maxPoints:     { type: Number, required: true },
        awardedPoints: { type: Number, required: true, min: 0 },
      },
    ],

    // Private comments thread between student and instructor
    comments: [
      {
        userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        text:      { type: String, required: true, maxlength: 2000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// One submission per student per assignment (upsert on re-submit)
submissionSchema.index({ tenantId: 1, assignmentId: 1, studentId: 1 }, { unique: true });
submissionSchema.index({ tenantId: 1, assignmentId: 1, status: 1 });
submissionSchema.index({ tenantId: 1, studentId: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
