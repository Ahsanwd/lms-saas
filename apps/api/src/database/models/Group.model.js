const mongoose = require('mongoose');
const softDeletePlugin  = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const groupSchema = new mongoose.Schema(
  {
    tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Tracks which courses this group has been enrolled into
    enrolledCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  },
  { timestamps: true }
);

groupSchema.index({ tenantId: 1, name: 1 });

groupSchema.plugin(softDeletePlugin);
groupSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Group', groupSchema);
