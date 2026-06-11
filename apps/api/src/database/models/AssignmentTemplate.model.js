const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const assignmentTemplateSchema = new mongoose.Schema(
  {
    tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },

    title:        { type: String, required: true, trim: true },
    description:  { type: String, default: null },
    instructions: { type: String, default: null },
    totalMarks:   { type: Number, default: 100, min: 1 },
    allowLateSubmission: { type: Boolean, default: false },

    rubric: [
      {
        criterion: { type: String, required: true, trim: true },
        maxPoints: { type: Number, required: true, min: 0 },
      },
    ],
  },
  { timestamps: true }
);

assignmentTemplateSchema.index({ tenantId: 1, instructorId: 1 });

assignmentTemplateSchema.plugin(softDeletePlugin);
assignmentTemplateSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('AssignmentTemplate', assignmentTemplateSchema);
