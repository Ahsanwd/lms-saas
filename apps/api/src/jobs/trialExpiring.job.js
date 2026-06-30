const { trialExpiringQueue } = require('./queue');
const logger = require('../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

trialExpiringQueue().process(async (job) => {
  if (job.data.type !== 'daily-cron') return;

  const MembershipSubscription = require('../database/models/MembershipSubscription.model');
  const notifySvc = require('../modules/notification/notification.service');

  const now = new Date();
  const windows = [
    { key: '3d', gt: new Date(now.getTime() + 2 * DAY_MS), lte: new Date(now.getTime() + 3 * DAY_MS), daysLeft: 3 },
    { key: '1d', gt: now,                                  lte: new Date(now.getTime() + 1 * DAY_MS), daysLeft: 1 },
  ];

  let totalNotified = 0;

  for (const { key, gt, lte, daysLeft } of windows) {
    try {
      const subs = await MembershipSubscription.find({
        status: 'trial',
        trialEndsAt: { $gt: gt, $lte: lte },
      }).populate('planId', 'name courseAccess courses');

      for (const sub of subs) {
        const lastSent = sub.trialWarnings?.get?.(key);
        if (lastSent || !sub.planId) continue;

        const courseId = sub.planId.courseAccess === 'selected' ? sub.planId.courses?.[0]?.toString() : null;
        await notifySvc.notifyTrialExpiring(sub.tenantId, sub.userId, sub.planId.name, daysLeft, courseId);
        await MembershipSubscription.updateOne({ _id: sub._id }, { $set: { [`trialWarnings.${key}`]: now } });
        totalNotified++;
      }
    } catch (err) {
      logger.error(`[trial-expiring] window ${key} error: ${err.message}`);
    }
  }

  logger.info(`[trial-expiring] Cron finished — ${totalNotified} reminder(s) sent`);
});
