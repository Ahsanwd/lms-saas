const logger      = require('../utils/logger');
const { membershipRenewalQueue } = require('./queue');
const membershipSvc = require('../modules/membership/membership.service');
const { queueEmail } = require('./email.job');

// ─── Single processor handles all job types in this queue ────────────────────
membershipRenewalQueue().process(async (job) => {
  // Daily cron tick — queue up individual renewal jobs
  if (job.data.type === 'daily-cron') {
    await expireGracePeriodEnded();
    await scheduleMembershipRenewals();
    await sendExpiryReminders();
    return;
  }

  // Individual subscription renewal
  const { subscriptionId } = job.data;
  if (!subscriptionId) return;

  logger.info(`[membership.renewal] Processing renewal for subscription ${subscriptionId}`);
  const result = await membershipSvc.renewSubscription(subscriptionId);

  if (result.ok) {
    logger.info(`[membership.renewal] Renewed ${subscriptionId} via ${result.mode}`);
  } else {
    logger.warn(`[membership.renewal] Renewal failed for ${subscriptionId}: ${result.reason}`);
  }
});

// ─── Expire grace-period-ended subscriptions ──────────────────────────────────
async function expireGracePeriodEnded() {
  try {
    const count = await membershipSvc.expireGracePeriodEnded();
    if (count > 0) logger.info(`[membership.renewal] Expired ${count} grace-period-ended subscription(s)`);
  } catch (err) {
    logger.error(`[membership.renewal] Grace period expiry error: ${err.message}`);
  }
}

// ─── Scheduler — called daily, queues individual renewal jobs ─────────────────
async function scheduleMembershipRenewals() {
  try {
    const due = await membershipSvc.getSubscriptionsDueForRenewal();
    logger.info(`[membership.renewal] Found ${due.length} subscription(s) due for renewal`);

    for (const sub of due) {
      await membershipRenewalQueue().add(
        { subscriptionId: sub._id.toString() },
        {
          jobId:    `renew_${sub._id}`,  // prevent duplicate jobs
          attempts: 3,
          backoff:  { type: 'exponential', delay: 60_000 },
        }
      );
    }
  } catch (err) {
    logger.error(`[membership.renewal] Scheduler error: ${err.message}`);
  }
}

// ─── Reminder emails — called daily, finds non-renewing subs expiring in 7 days ─
async function sendExpiryReminders() {
  try {
    const expiring = await membershipSvc.getSubscriptionsExpiringSoon();
    logger.info(`[membership.renewal] Sending ${expiring.length} expiry reminder(s)`);

    for (const sub of expiring) {
      const user = sub.userId;
      const plan = sub.planId;
      if (!user?.email) continue;

      await queueEmail({
        to:      user.email,
        subject: `Your ${plan?.name || 'membership'} expires in 7 days`,
        html: `
          <p>Hi ${user.firstName || 'there'},</p>
          <p>Your <strong>${plan?.name || 'membership'}</strong> subscription expires on
             <strong>${new Date(sub.currentPeriodEnd).toLocaleDateString()}</strong>.</p>
          <p>Auto-renew is off. To keep your access, log in and renew before the expiry date.</p>
          <p><a href="${process.env.APP_URL}/membership">Renew Now →</a></p>
        `,
      });
    }
  } catch (err) {
    logger.error(`[membership.renewal] Reminder email error: ${err.message}`);
  }
}

module.exports = { scheduleMembershipRenewals, sendExpiryReminders };
