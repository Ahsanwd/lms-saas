const mongoose = require('mongoose');

const discussionSchema = new mongoose.Schema(
  {
    tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',     required: true },
    courseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course',     required: true },
    lessonId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson',     required: true },
    parentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Discussion', default: null },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',       required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, enum: ['student', 'instructor', 'tenant_admin'], required: true },
    body:       { type: String, required: true, maxlength: 2000 },
    isResolved: { type: Boolean, default: false },
    isPinned:   { type: Boolean, default: false },
    upvotes:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    editedAt:   { type: Date, default: null },
    deletedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

discussionSchema.index({ tenantId: 1, lessonId: 1, parentId: 1, createdAt: -1 });
discussionSchema.index({ tenantId: 1, lessonId: 1, isPinned: -1, createdAt: -1 });

module.exports = mongoose.model('Discussion', discussionSchema);
