const Notification  = require('../../database/models/Notification.model');
const userRepo      = require('../../database/repositories/user.repository');
const prefRepo      = require('../../database/repositories/notificationPreference.repository');
const tenantRepo    = require('../../database/repositories/tenant.repository');
const { queueEmail } = require('../../jobs/email.job');
const config         = require('../../config');

// Templates
const enrollmentTpl         = require('../../services/email/templates/enrollment');
const enrollmentApprovedTpl = require('../../services/email/templates/enrollmentApproved');
const enrollmentRejectedTpl = require('../../services/email/templates/enrollmentRejected');
const assignmentGradedTpl   = require('../../services/email/templates/assignmentGraded');
const certificateIssuedTpl  = require('../../services/email/templates/certificateIssued');
const courseCompletedTpl    = require('../../services/email/templates/courseCompleted');
const announcementTpl       = require('../../services/email/templates/announcement');
const trialExpiringTpl      = require('../../services/email/templates/trialExpiring');
const quizGradedTpl           = require('../../services/email/templates/quizGraded');
const refundApprovedTpl       = require('../../services/email/templates/refundApproved');
const refundRejectedTpl       = require('../../services/email/templates/refundRejected');
const liveSessionReminderTpl  = require('../../services/email/templates/liveSessionReminder');
const forumReplyTpl          = require('../../services/email/templates/forumReply');
const discussionQuestionTpl  = require('../../services/email/templates/discussionQuestion');
const { emitNotificationNew } = require('../../services/socket/io');

// Default "owning module" per notification type — used for the audit `source`
// field when the caller doesn't explicitly pass one.
const TYPE_SOURCE = {
  enrollment: 'course', waitlist_promoted: 'waitlist', enrollment_approved: 'enrollmentRequest',
  enrollment_rejected: 'enrollmentRequest', assignment_graded: 'assignment', assignment_due: 'assignment',
  assignment_published: 'assignment', announcement: 'announcement', course_published: 'course',
  course_completed: 'course', certificate_issued: 'course', trial_expiring: 'membership',
  chat_message: 'chat', forum_reply: 'discussion', quiz_graded: 'quiz', quiz_published: 'quiz',
  refund_approved: 'refund', refund_rejected: 'refund', live_session_reminder: 'liveClass',
  email_delivery_failed: 'email', discussion_comment: 'discussion', discussion_reply: 'discussion',
};

// ── Push (lazy-loaded so server still boots if web-push isn't configured) ─────
function getPushService() {
  try { return require('../../services/push/push.service'); } catch { return null; }
}

// ── Build email payload from notification context ─────────────────────────────
function buildEmailPayload(type, ctx, userDoc, appUrl, tenantName, branding = {}) {
  const base = { studentName: `${userDoc.firstName} ${userDoc.lastName}`, tenantName, appUrl, branding };

  switch (type) {
    case 'enrollment':
      return enrollmentTpl({ ...base, courseName: ctx.courseName, courseId: ctx.courseId });
    case 'enrollment_approved':
      return enrollmentApprovedTpl({ ...base, courseName: ctx.courseName, courseId: ctx.courseId, note: ctx.note });
    case 'enrollment_rejected':
      return enrollmentRejectedTpl({ ...base, courseName: ctx.courseName, note: ctx.note });
    case 'assignment_graded':
      // Email sent directly by assignment.service.js — skip here to avoid duplicate
      return null;
    case 'certificate_issued':
      return certificateIssuedTpl({ ...base, courseName: ctx.courseName, courseId: ctx.courseId });
    case 'course_completed':
      return courseCompletedTpl({ ...base, courseName: ctx.courseName, courseId: ctx.courseId });
    case 'announcement':
      return announcementTpl({
        ...base, recipientName: base.studentName,
        announcementTitle: ctx.announcementTitle, announcementBody: ctx.announcementBody,
        courseName: ctx.courseName, courseId: ctx.courseId,
      });
    case 'trial_expiring':
      return trialExpiringTpl({
        ...base, courseId: ctx.courseId, daysLeft: ctx.daysLeft ?? 3,
        courseName: ctx.courseName || ctx.planName || 'your plan',
      });
    case 'quiz_graded':
      return quizGradedTpl({
        ...base, recipientName: base.studentName,
        quizTitle: ctx.quizTitle, score: ctx.score, maxScore: ctx.maxScore,
        percentage: ctx.percentage, passed: ctx.passed,
        quizUrl: `${appUrl}/quizzes/${ctx.quizId}`,
      });
    case 'refund_approved':
      return refundApprovedTpl({
        ...base, recipientName: base.studentName,
        courseName: ctx.courseName || null,
        paymentsUrl: `${appUrl}/my-payments`,
      });
    case 'refund_rejected':
      return refundRejectedTpl({
        ...base, recipientName: base.studentName,
        courseName: ctx.courseName || null,
        adminNote: ctx.adminNote || '',
        paymentsUrl: `${appUrl}/my-payments`,
      });
    case 'live_session_reminder':
      return liveSessionReminderTpl({
        ...base, recipientName: base.studentName,
        lessonTitle: ctx.lessonTitle, courseName: ctx.courseName || null,
        scheduledAt: ctx.scheduledAt, platform: ctx.platform || 'zoom',
        joinUrl: null,
        courseId: ctx.courseId,
      });
    case 'discussion_reply':
      return forumReplyTpl({
        ...base, recipientName: base.studentName,
        replyAuthorName: ctx.replyAuthorName, threadTitle: ctx.threadTitle,
        preview: ctx.preview, threadUrl: `${appUrl}${ctx.link || ''}`,
      });
    case 'discussion_comment':
      return discussionQuestionTpl({
        ...base, recipientName: base.studentName,
        studentName: ctx.studentName, lessonTitle: ctx.lessonTitle,
        preview: ctx.preview, threadUrl: `${appUrl}${ctx.link || ''}`,
      });
    // chat_message: in-app + push only, no email — it's a real-time conversation
    default:
      return null;
  }
}

// ── Dispatch email + push after saving notification ───────────────────────────
async function dispatch(userId, type, title, message, link, ctx = {}) {
  try {
    const userDoc = await userRepo.findByIdRaw(userId);
    if (!userDoc?.email) return;

    const tenantId   = userDoc.tenantId?.toString();
    const appUrl     = config.app.url;
    const { tenantName: resolvedName, branding } = await tenantRepo.getBranding(tenantId);
    const tenantName = ctx.tenantName || resolvedName;

    // Respect user notification preferences (missing key = default enabled)
    const prefs      = tenantId ? await prefRepo.findOrCreate(tenantId, userId.toString()) : { preferences: {} };
    const typePref   = prefs.preferences?.[type];
    const emailOk    = typePref?.email !== false;
    const pushOk     = typePref?.push  !== false;

    // Email
    if (emailOk) {
      const emailPayload = buildEmailPayload(type, { ...ctx, link }, userDoc, appUrl, tenantName, branding);
      if (emailPayload) {
        await queueEmail({ to: userDoc.email, tenantId: tenantId || null, ...emailPayload });
      }
    }

    // Browser push
    if (pushOk) {
      const pushSvc = getPushService();
      if (pushSvc && tenantId) {
        pushSvc.sendToUser(tenantId, userId.toString(), {
          title,
          body: message,
          url: link || appUrl,
        }).catch(() => {});
      }
    }
  } catch {
    // Dispatch is non-critical — never crash the main flow
  }
}

// ── Core: Create a notification (+ dispatch email + push) ─────────────────────
async function create(tenantId, userId, { type, title, message, link = null, ctx = {}, triggeredBy = null, source = null, metadata = {} }) {
  try {
    const doc = await Notification.create({
      tenantId, userId, type, title, message, link,
      triggeredBy, source: source || TYPE_SOURCE[type] || null, metadata,
    });
    emitNotificationNew(userId.toString(), doc.toObject());
    dispatch(userId, type, title, message, link, ctx).catch(() => {});
    return doc;
  } catch {
    // non-critical
  }
}

// ── Core: Create notifications for multiple users at once ─────────────────────
async function createBulk(tenantId, userIds, { type, title, message, link = null, ctx = {}, triggeredBy = null, source = null, metadata = {} }) {
  if (!userIds?.length) return;
  try {
    const resolvedSource = source || TYPE_SOURCE[type] || null;
    const docs = userIds.map(userId => ({ tenantId, userId, type, title, message, link, triggeredBy, source: resolvedSource, metadata }));
    const inserted = await Notification.insertMany(docs, { ordered: false });
    inserted.forEach(doc => emitNotificationNew(doc.userId.toString(), doc.toObject ? doc.toObject() : doc));
    Promise.all(userIds.map(uid => dispatch(uid, type, title, message, link, ctx))).catch(() => {});
  } catch {
    // non-critical
  }
}

// ── Notification preferences ──────────────────────────────────────────────────
async function getPreferences(tenantId, userId) {
  const doc = await prefRepo.findOrCreate(tenantId, userId);
  return { preferences: doc.preferences || {} };
}

async function updatePreferences(tenantId, userId, preferences) {
  const doc = await prefRepo.update(tenantId, userId, preferences);
  return { preferences: doc.preferences || {} };
}

// ── Failed email log ──────────────────────────────────────────────────────────
async function getFailedEmails(tenantId, { page = 1, limit = 20 } = {}) {
  const FailedEmailLog = require('../../database/models/FailedEmailLog.model');
  const filter = tenantId ? { tenantId } : {};
  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    FailedEmailLog.find(filter).sort({ failedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    FailedEmailLog.countDocuments(filter),
  ]);
  return { logs, total, page: Number(page), limit: Number(limit) };
}

// ── List / mark / delete ──────────────────────────────────────────────────────
async function list(tenantId, userId, { page = 1, limit = 20, unreadOnly = false, type = null } = {}) {
  const filter = { tenantId, userId };
  if (unreadOnly) filter.isRead = false;
  if (type) filter.type = type;
  const skip = (Number(page) - 1) * Number(limit);
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Notification.countDocuments(filter),
    Notification.countDocuments({ tenantId, userId, isRead: false }),
  ]);
  return { notifications, total, unreadCount, page: Number(page), limit: Number(limit) };
}

async function listGrouped(tenantId, userId) {
  const mongoose = require('mongoose');
  const groups = await Notification.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        userId:   new mongoose.Types.ObjectId(userId),
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id:             '$type',
        count:           { $sum: 1 },
        unreadCount:     { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
        latestTitle:     { $first: '$title' },
        latestMessage:   { $first: '$message' },
        latestLink:      { $first: '$link' },
        latestCreatedAt: { $first: '$createdAt' },
        latestId:        { $first: '$_id' },
      },
    },
    {
      $project: {
        _id:             0,
        type:            '$_id',
        count:           1,
        unreadCount:     1,
        latestTitle:     1,
        latestMessage:   1,
        latestLink:      1,
        latestCreatedAt: 1,
        latestId:        1,
      },
    },
    { $sort: { latestCreatedAt: -1 } },
  ]);

  const totalUnread = groups.reduce((sum, g) => sum + g.unreadCount, 0);
  return { groups, totalUnread };
}

async function unreadCount(tenantId, userId) {
  const count = await Notification.countDocuments({ tenantId, userId, isRead: false });
  return { count };
}

async function markRead(tenantId, userId, notificationId) {
  await Notification.updateOne(
    { _id: notificationId, tenantId, userId },
    { isRead: true, readAt: new Date() }
  );
}

async function markAllRead(tenantId, userId) {
  await Notification.updateMany(
    { tenantId, userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
}

async function remove(tenantId, userId, notificationId) {
  await Notification.deleteOne({ _id: notificationId, tenantId, userId });
}

// ── Convenience creators ──────────────────────────────────────────────────────

async function notifyEnrollment(tenantId, userId, courseName, courseId, ctx = {}) {
  return create(tenantId, userId, {
    type: 'enrollment', title: 'Enrolled in course',
    message: `You have been enrolled in "${courseName}".`,
    link: `/courses/${courseId}`,
    ctx: { courseName, courseId, ...ctx },
  });
}

async function notifyWaitlistPromoted(tenantId, userId, courseName, courseId, ctx = {}) {
  return create(tenantId, userId, {
    type: 'waitlist_promoted', title: 'Waitlist seat available!',
    message: `A seat opened up — you are now enrolled in "${courseName}".`,
    link: `/courses/${courseId}`,
    ctx: { courseName, courseId, ...ctx },
  });
}

async function notifyEnrollmentApproved(tenantId, userId, courseName, courseId, note = '', ctx = {}) {
  return create(tenantId, userId, {
    type: 'enrollment_approved', title: 'Enrollment request approved',
    message: `Your request to join "${courseName}" was approved.${note ? ` Note: ${note}` : ''}`,
    link: `/courses/${courseId}`,
    ctx: { courseName, courseId, note, ...ctx },
  });
}

async function notifyEnrollmentRejected(tenantId, userId, courseName, note = '', ctx = {}) {
  return create(tenantId, userId, {
    type: 'enrollment_rejected', title: 'Enrollment request not approved',
    message: `Your request to join "${courseName}" was not approved.${note ? ` Reason: ${note}` : ''}`,
    link: null,
    ctx: { courseName, note, ...ctx },
  });
}

async function notifyAssignmentGraded(tenantId, userId, assignmentTitle, grade, courseId, ctx = {}) {
  return create(tenantId, userId, {
    type: 'assignment_graded', title: 'Assignment graded',
    message: `Your submission for "${assignmentTitle}" received a grade of ${grade}.`,
    link: courseId ? `/courses/${courseId}` : '/assignments',
    ctx: { assignmentTitle, courseId, ...ctx },
  });
}

async function notifyAnnouncement(tenantId, userIds, title, courseId = null, ctx = {}) {
  return createBulk(tenantId, userIds, {
    type: 'announcement', title: 'New announcement',
    message: title,
    link: courseId ? `/courses/${courseId}` : '/announcements',
    ctx: { announcementTitle: title, courseId, ...ctx },
  });
}

async function notifyCoursePublished(tenantId, userIds, courseTitle, courseId, ctx = {}) {
  return createBulk(tenantId, userIds, {
    type: 'course_published', title: 'Course is now available',
    message: `"${courseTitle}" has been published and is ready for you.`,
    link: `/courses/${courseId}`,
    ctx: { courseName: courseTitle, courseId, ...ctx },
  });
}

async function notifyCourseCompleted(tenantId, userId, courseTitle, courseId, ctx = {}) {
  return create(tenantId, userId, {
    type: 'course_completed', title: 'Course completed!',
    message: `Congratulations! You have completed "${courseTitle}".`,
    link: `/courses/${courseId}/learn`,
    ctx: { courseName: courseTitle, courseId, ...ctx },
  });
}

async function notifyCertificateIssued(tenantId, userId, courseTitle, courseId, ctx = {}) {
  return create(tenantId, userId, {
    type: 'certificate_issued', title: 'Certificate ready',
    message: `Your certificate for "${courseTitle}" is ready to download.`,
    link: `/certificates/${courseId}`,
    ctx: { courseName: courseTitle, courseId, ...ctx },
  });
}

async function notifyChatMessage(tenantId, userId, senderName, preview, conversationId, ctx = {}) {
  return create(tenantId, userId, {
    type: 'chat_message', title: `New message from ${senderName}`,
    message: preview || 'You have a new message.',
    link: `/chat?conversation=${conversationId}`,
    ctx: { senderName, preview, conversationId, ...ctx },
  });
}

async function notifyForumReply(tenantId, userId, threadTitle, replyAuthorName, threadId, ctx = {}) {
  return create(tenantId, userId, {
    type: 'forum_reply', title: 'New reply on your thread',
    message: `${replyAuthorName} replied to "${threadTitle}".`,
    link: `/discussions/${threadId}`,
    ctx: { threadTitle, replyAuthorName, threadId, ...ctx },
  });
}

async function notifyQuizGraded(tenantId, userId, quizTitle, score, maxScore, percentage, quizId, passed, ctx = {}) {
  return create(tenantId, userId, {
    type: 'quiz_graded', title: 'Quiz graded',
    message: `Your quiz "${quizTitle}" was graded: ${percentage}% (${passed ? 'Passed' : 'Not passed'}).`,
    link: `/quizzes/${quizId}`,
    ctx: { quizTitle, score, maxScore, percentage, quizId, passed, ...ctx },
  });
}

async function notifyRefundApproved(tenantId, userId, courseName, courseId, ctx = {}) {
  return create(tenantId, userId, {
    type: 'refund_approved', title: 'Refund approved',
    message: 'Your refund request has been approved. Funds will appear in 5–10 business days.',
    link: '/my-payments',
    ctx: { courseName, courseId, ...ctx },
  });
}

async function notifyLiveSessionReminder(tenantId, userIds, lessonTitle, courseName, courseId, lessonId, scheduledAt, platform, ctx = {}) {
  return createBulk(tenantId, userIds, {
    type: 'live_session_reminder', title: 'Live class starting in 1 hour',
    message: `"${lessonTitle}" starts in 1 hour. Get ready to join!`,
    link: `/courses/${courseId}/learn?lessonId=${lessonId}`,
    ctx: { lessonTitle, courseName, courseId, lessonId, scheduledAt, platform, ...ctx },
  });
}

async function notifyAssignmentPublished(tenantId, userIds, assignmentTitle, courseId, assignmentId, ctx = {}) {
  return createBulk(tenantId, userIds, {
    type: 'assignment_published', title: 'New assignment posted',
    message: `New assignment: "${assignmentTitle}" — submit before the deadline.`,
    link: `/assignments/${assignmentId}`,
    ctx: { assignmentTitle, courseId, assignmentId, ...ctx },
  });
}

async function notifyQuizPublished(tenantId, userIds, quizTitle, courseId, quizId, ctx = {}) {
  return createBulk(tenantId, userIds, {
    type: 'quiz_published', title: 'New quiz available',
    message: `New quiz: "${quizTitle}" is now available. Test your knowledge!`,
    link: `/quizzes/${quizId}`,
    ctx: { quizTitle, courseId, quizId, ...ctx },
  });
}

async function notifyAssignmentDue(tenantId, userIds, assignmentTitle, courseId, assignmentId, dueDate, ctx = {}) {
  return createBulk(tenantId, userIds, {
    type: 'assignment_due', title: 'Assignment due soon',
    message: `"${assignmentTitle}" is due ${ctx.dueLabel || 'soon'} — submit before the deadline.`,
    link: `/assignments/${assignmentId}`,
    ctx: { assignmentTitle, courseId, assignmentId, dueDate, ...ctx },
  });
}

async function notifyTrialExpiring(tenantId, userId, planName, daysLeft, courseId = null, ctx = {}) {
  return create(tenantId, userId, {
    type: 'trial_expiring', title: 'Your trial is ending soon',
    message: `Your free trial of "${planName}" ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    link: '/membership',
    ctx: { planName, daysLeft, courseId, ...ctx },
  });
}

async function notifyRefundRejected(tenantId, userId, adminNote, courseName, courseId, ctx = {}) {
  return create(tenantId, userId, {
    type: 'refund_rejected', title: 'Refund request not approved',
    message: `Your refund request was not approved.${adminNote ? ` Reason: ${adminNote}` : ''}`,
    link: '/my-payments',
    ctx: { adminNote, courseName, courseId, ...ctx },
  });
}

module.exports = {
  create, createBulk,
  list, listGrouped, unreadCount, markRead, markAllRead, remove,
  getPreferences, updatePreferences, getFailedEmails,
  notifyEnrollment, notifyWaitlistPromoted,
  notifyEnrollmentApproved, notifyEnrollmentRejected,
  notifyAssignmentGraded, notifyAnnouncement,
  notifyCoursePublished, notifyCourseCompleted, notifyCertificateIssued,
  notifyChatMessage, notifyForumReply,
  notifyQuizGraded, notifyRefundApproved, notifyRefundRejected,
  notifyLiveSessionReminder, notifyAssignmentPublished,
  notifyQuizPublished, notifyAssignmentDue, notifyTrialExpiring,
};
