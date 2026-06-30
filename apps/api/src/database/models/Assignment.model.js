const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const assignmentSchema = new mongoose.Schema(
  {
    tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    lessonId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
    instructorId:{ type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },

    title:        { type: String, required: true, trim: true },
    description:  { type: String, default: null },
    instructions: { type: String, default: null },
    attachmentUrl:{ type: String, default: null },

    dueDate:    { type: Date, default: null },
    totalMarks: { type: Number, default: 100, min: 1 },

    allowLateSubmission: { type: Boolean, default: false },

    // Allowed file extensions for student uploads — empty = any type accepted
    allowedFileTypes: [{ type: String, lowercase: true, trim: true }],

    // Per-student deadline extensions granted by instructor/admin
    extensions: [
      {
        studentId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        extendedDueDate: { type: Date, required: true },
        note:            { type: String, default: null },
        grantedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        grantedAt:       { type: Date, default: Date.now },
      },
    ],

    // 0 = unlimited re-submissions; N = student may submit at most N times
    maxSubmissions: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },

    // Optional rubric — if defined, graders score per-criterion and marks auto-sums
    rubric: [
      {
        criterion: { type: String, required: true, trim: true, maxlength: 200 },
        maxPoints: { type: Number, required: true, min: 0 },
      },
    ],

    // Denormalized counters — updated on submission changes
    submissionCount: { type: Number, default: 0 },
    gradedCount:     { type: Number, default: 0 },

    // Dedupe map for due-date reminder job — key '3d'|'1d' -> last-sent timestamp
    dueReminders: { type: Map, of: Date, default: () => new Map() },
  },
  { timestamps: true }
);

assignmentSchema.index({ tenantId: 1, courseId: 1, status: 1 });
assignmentSchema.index({ tenantId: 1, instructorId: 1 });
assignmentSchema.index({ tenantId: 1, dueDate: 1 });

assignmentSchema.plugin(softDeletePlugin);
assignmentSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Assignment', assignmentSchema);
