const { assignmentDueQueue } = require('./queue');
const logger = require('../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

assignmentDueQueue().process(async (job) => {
  if (job.data.type !== 'daily-cron') return;

  const Assignment    = require('../database/models/Assignment.model');
  const Submission     = require('../database/models/Submission.model');
  const enrollmentRepo = require('../database/repositories/enrollment.repository');
  const notifySvc       = require('../modules/notification/notification.service');

  const now = new Date();
  const windows = [
    { key: '3d', gt: new Date(now.getTime() + 2 * DAY_MS), lte: new Date(now.getTime() + 3 * DAY_MS), label: 'in 3 days' },
    { key: '1d', gt: now,                                  lte: new Date(now.getTime() + 1 * DAY_MS), label: 'tomorrow' },
  ];

  let totalNotified = 0;

  for (const { key, gt, lte, label } of windows) {
    try {
      const assignments = await Assignment.find({
        status:  'published',
        dueDate: { $gt: gt, $lte: lte },
        deletedAt: null,
      });

      for (const assignment of assignments) {
        // Skip if this window's reminder was already sent for this assignment
        const lastSent = assignment.dueReminders?.get?.(key);
        if (lastSent) continue;

        const [enrollments] = await enrollmentRepo.findByCourse(
          assignment.tenantId, assignment.courseId, { status: 'active' }, { limit: 1000 }
        );
        const studentIds = enrollments.map(e => (e.userId?._id ?? e.userId)?.toString()).filter(Boolean);
        if (!studentIds.length) continue;

        // Exclude students who already submitted
        const submitted = await Submission.find({
          tenantId: assignment.tenantId, assignmentId: assignment._id, studentId: { $in: studentIds },
        }).distinct('studentId');
        const submittedSet = new Set(submitted.map(id => id.toString()));
        const pendingIds = studentIds.filter(id => !submittedSet.has(id));
        if (!pendingIds.length) {
          await Assignment.updateOne({ _id: assignment._id }, { $set: { [`dueReminders.${key}`]: now } });
          continue;
        }

        await notifySvc.notifyAssignmentDue(
          assignment.tenantId, pendingIds, assignment.title,
          assignment.courseId.toString(), assignment._id.toString(), assignment.dueDate,
          { dueLabel: label }
        );
        await Assignment.updateOne({ _id: assignment._id }, { $set: { [`dueReminders.${key}`]: now } });
        totalNotified += pendingIds.length;
      }
    } catch (err) {
      logger.error(`[assignment-due] window ${key} error: ${err.message}`);
    }
  }

  logger.info(`[assignment-due] Cron finished — ${totalNotified} reminder(s) sent`);
});
