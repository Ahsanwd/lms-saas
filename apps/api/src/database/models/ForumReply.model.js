const mongoose = require('mongoose');

const forumReplySchema = new mongoose.Schema(
  {
    tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',      required: true },
    courseId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Course',      required: true },
    threadId:      { type: mongoose.Schema.Types.ObjectId, ref: 'ForumThread', required: true },
    parentReplyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumReply',  default: null },

    authorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, enum: ['student', 'instructor', 'tenant_admin'], required: true },

    body:       { type: String, required: true, maxlength: 3000 },
    likes:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isAccepted: { type: Boolean, default: false },
    flags: [{
      userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      reason:    { type: String, enum: ['spam', 'offensive', 'misinformation', 'other'], required: true },
      createdAt: { type: Date, default: Date.now },
    }],

    editedAt:  { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

forumReplySchema.index({ tenantId: 1, threadId: 1, parentReplyId: 1, createdAt: 1 });
forumReplySchema.index({ tenantId: 1, courseId: 1, authorId: 1 });

module.exports = mongoose.model('ForumReply', forumReplySchema);
