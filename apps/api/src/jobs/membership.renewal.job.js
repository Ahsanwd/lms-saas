const logger      = require('../utils/logger');
const membershipSvc = require('../modules/membership/membership.service');
const { queueEmail } = require('./email.job');

// ─── Cron entry point — runs daily ────────────────────────────────────────────
async function runMembershipRenewalCron() {
  await expireGracePeriodEnded();
  await processMembershipRenewals();
  await sendExpiryReminders();
}

// ─── Expire grace-period-ended subscriptions ──────────────────────────────────
async function expireGracePeriodEnded() {
  try {
    const count = await membershipSvc.expireGracePeriodEnded();
    if (count > 0) logger.info(`[membership.renewal] Expired ${count} grace-period-ended subscription(s)`);
  } catch (err) {
    logger.error(`[membership.renewal] Grace period expiry error: ${err.message}`);
  }
}

// ─── Renewals — runs daily, renews each due subscription directly ────────────
// Previously fanned out to individual Bull jobs (3 attempts, exponential
// backoff) so a transient failure retried within minutes. Now renews inline
// and just logs failures — a subscription that fails today is still "due for
// renewal" tomorrow, so the next daily run naturally retries it (same
// approach used by dunning-retry in most SaaS billing systems).
async function processMembershipRenewals() {
  try {
    const due = await membershipSvc.getSubscriptionsDueForRenewal();
    logger.info(`[membership.renewal] Found ${due.length} subscription(s) due for renewal`);

    for (const sub of due) {
      try {
        const result = await membershipSvc.renewSubscription(sub._id);
        if (result.ok) {
          logger.info(`[membership.renewal] Renewed ${sub._id} via ${result.mode}`);
        } else {
          logger.warn(`[membership.renewal] Renewal failed for ${sub._id}: ${result.reason}`);
        }
      } catch (err) {
        logger.error(`[membership.renewal] Renewal error for ${sub._id}: ${err.message}`);
      }
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

module.exports = { runMembershipRenewalCron };
