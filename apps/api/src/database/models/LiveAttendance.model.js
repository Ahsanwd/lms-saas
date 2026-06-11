const mongoose = require('mongoose');

const liveAttendanceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',  required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course',  required: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson',  required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    // How attendance was recorded
    source: {
      type: String,
      enum: ['join_button', 'self_checkin', 'manual'],
      required: true,
    },

    // Attendance status (set by system or overridden by instructor)
    status: {
      type: String,
      enum: ['attended', 'partial', 'absent'],
      default: 'attended',
    },

    // Timeline
    joinedAt:        { type: Date,   default: null },
    leftAt:          { type: Date,   default: null },
    checkedInAt:     { type: Date,   default: null },
    durationMinutes: { type: Number, default: null },

    // Instructor can override and leave a note
    overriddenBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    overrideNote:   { type: String, default: null },
  },
  { timestamps: true }
);

// One attendance record per user per lesson
liveAttendanceSchema.index({ tenantId: 1, lessonId: 1, userId: 1 }, { unique: true });
liveAttendanceSchema.index({ tenantId: 1, lessonId: 1 });
liveAttendanceSchema.index({ tenantId: 1, courseId: 1, userId: 1 });

module.exports = mongoose.model('LiveAttendance', liveAttendanceSchema);
