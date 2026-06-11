const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const announcementSchema = new mongoose.Schema(
  {
    tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    title:       { type: String, required: true, trim: true },
    body:        { type: String, required: true },
    authorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    isPublished:        { type: Boolean, default: false },
    publishedAt:        { type: Date, default: null },
    scheduledPublishAt: { type: Date, default: null },
  },
  { timestamps: true }
);

announcementSchema.index({ tenantId: 1, isPublished: 1, publishedAt: -1 });
announcementSchema.index({ tenantId: 1, authorId: 1 });
announcementSchema.index({ tenantId: 1, courseId: 1 });

announcementSchema.plugin(softDeletePlugin);
announcementSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Announcement', announcementSchema);
