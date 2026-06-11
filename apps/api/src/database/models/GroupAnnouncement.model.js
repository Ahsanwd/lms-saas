const mongoose = require('mongoose');

const groupAnnouncementSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    groupId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Group',  required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    title:    { type: String, required: true, trim: true, maxlength: 200 },
    body:     { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

groupAnnouncementSchema.index({ tenantId: 1, groupId: 1, createdAt: -1 });

module.exports = mongoose.model('GroupAnnouncement', groupAnnouncementSchema);
