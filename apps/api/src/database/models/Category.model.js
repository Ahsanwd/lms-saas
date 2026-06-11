const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const categorySchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: null },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    icon: { type: String, default: null },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    courseCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

categorySchema.index({ tenantId: 1, slug: 1 }, { unique: true });
categorySchema.index({ tenantId: 1, parentId: 1 });
categorySchema.index({ tenantId: 1, isActive: 1 });

categorySchema.plugin(softDeletePlugin);
categorySchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Category', categorySchema);
