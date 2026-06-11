const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    groupId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Group',  required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    text:     { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

groupMessageSchema.index({ tenantId: 1, groupId: 1, createdAt: -1 });

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
