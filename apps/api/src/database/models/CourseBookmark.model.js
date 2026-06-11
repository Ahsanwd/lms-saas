const mongoose = require('mongoose');
const { Schema } = mongoose;

const bookmarkSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  userId:   { type: Schema.Types.ObjectId, ref: 'User',   required: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
}, { timestamps: true });

bookmarkSchema.index({ tenantId: 1, userId: 1 });
bookmarkSchema.index({ tenantId: 1, userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('CourseBookmark', bookmarkSchema);
