const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',       required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true },
    senderName:     { type: String, required: true },
    senderRole:     { type: String, enum: ['student', 'instructor', 'tenant_admin'], required: true },
    text:      { type: String, default: null, maxlength: 4000 },
    file: {
      url:       { type: String, default: null },
      name:      { type: String, default: null },
      mimeType:  { type: String, default: null },
      sizeBytes: { type: Number, default: null },
    },
    editedAt:  { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chatMessageSchema.index({ tenantId: 1, conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
