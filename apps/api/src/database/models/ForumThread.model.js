const mongoose = require('mongoose');

const forumThreadSchema = new mongoose.Schema(
  {
    tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',  required: true },
    courseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course',  required: true },
    authorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, enum: ['student', 'instructor', 'tenant_admin'], required: true },

    title:      { type: String, required: true, trim: true, maxlength: 200 },
    body:       { type: String, required: true, maxlength: 5000 },
    tags:       [{ type: String, trim: true, maxlength: 30 }],

    isPinned:   { type: Boolean, default: false },
    isResolved: { type: Boolean, default: false },
    isClosed:   { type: Boolean, default: false },

    replyCount:     { type: Number, default: 0 },
    views:          { type: Number, default: 0 },
    likes:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    subscribers:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    flags: [{
      userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      reason:    { type: String, enum: ['spam', 'offensive', 'misinformation', 'other'], required: true },
      createdAt: { type: Date, default: Date.now },
    }],

    lastActivityAt: { type: Date, default: Date.now },
    editedAt:       { type: Date, default: null },
    deletedAt:      { type: Date, default: null },
  },
  { timestamps: true }
);

forumThreadSchema.index({ tenantId: 1, courseId: 1, isPinned: -1, lastActivityAt: -1 });
forumThreadSchema.index({ tenantId: 1, courseId: 1, createdAt: -1 });
forumThreadSchema.index({ tenantId: 1, courseId: 1, isResolved: 1 });

module.exports = mongoose.model('ForumThread', forumThreadSchema);
