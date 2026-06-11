const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    studentId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    instructorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    studentName:    { type: String, required: true },
    instructorName: { type: String, required: true },
    courseName:     { type: String, required: true },
    lastMessage:    { type: String, default: null },
    lastMessageAt:  { type: Date,   default: null },
    studentUnread:  { type: Number, default: 0 },
    instructorUnread: { type: Number, default: 0 },
    status:         { type: String, enum: ['active', 'closed'], default: 'active' },
    deletedAt:      { type: Date, default: null },
  },
  { timestamps: true }
);

// One conversation per student-course pair
conversationSchema.index({ tenantId: 1, courseId: 1, studentId: 1 }, { unique: true });
conversationSchema.index({ tenantId: 1, instructorId: 1, lastMessageAt: -1 });
conversationSchema.index({ tenantId: 1, studentId: 1,   lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
