const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },

    type: {
      type: String,
      enum: [
        'enrollment',           // student enrolled in course
        'waitlist_promoted',    // promoted from waitlist to enrolled
        'enrollment_approved',  // enrollment request approved
        'enrollment_rejected',  // enrollment request rejected
        'assignment_graded',    // assignment submission graded
        'assignment_due',       // assignment due soon
        'assignment_published', // new assignment posted
        'announcement',         // new announcement
        'course_published',     // new course published and ready
        'course_completed',     // student completed a course
        'certificate_issued',   // certificate issued to student
        'trial_expiring',       // trial access expiring soon
        'chat_message',         // new direct chat message received
        'forum_reply',          // reply posted on a subscribed thread
        'quiz_graded',          // manual quiz grading completed by instructor
        'quiz_published',       // new quiz posted
        'refund_approved',      // refund request approved
        'refund_rejected',      // refund request rejected
        'live_session_reminder', // live class starting in 1 hour
        'email_delivery_failed', // dead-letter alert for tenant admin
        'discussion_comment',   // student posted in lesson discussion
        'discussion_reply',     // someone replied to your discussion post
      ],
      required: true,
    },

    title:   { type: String, required: true },
    message: { type: String, required: true },
    link:    { type: String, default: null }, // frontend route to navigate to on click

    isRead:  { type: Boolean, default: false },
    readAt:  { type: Date,    default: null },

    // ── Audit trail (optional — populated where the trigger context is known) ──
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source:      { type: String, default: null }, // owning module, e.g. 'course', 'assignment'
    metadata:    { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ tenantId: 1, userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, type: 1, createdAt: -1 });
// Retention: auto-delete notifications 90 days after creation
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
