const logger       = require('../utils/logger');
const { tenantExpiryQueue } = require('./queue');
const { queueEmail }        = require('./email.job');
const Tenant       = require('../database/models/Tenant.model');
const Subscription = require('../database/models/Subscription.model');
const User         = require('../database/models/User.model');
const CronLog      = require('../database/models/CronLog.model');
const trialWarningTemplate  = require('../services/email/templates/tenantTrialWarning');
const planExpiredTemplate   = require('../services/email/templates/tenantPlanExpired');
const gracePeriodTemplate   = require('../services/email/templates/tenantGracePeriod');
const { emitBillingUpdated } = require('../services/socket/io');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const DAY_MS  = 24 * 60 * 60 * 1000;

// ─── Processor ────────────────────────────────────────────────────────────────

tenantExpiryQueue().process(async (job) => {
  if (job.data.type !== 'daily-cron') return;

  const startedAt = new Date();
  const log = await CronLog.create({
    jobName: 'tenant-expiry-daily',
    startedAt,
    status: 'running',
  });

  const now     = new Date();
  const in1Day  = new Date(now.getTime() + 1 * DAY_MS);
  const in2Days = new Date(now.getTime() + 2 * DAY_MS);
  const in3Days = new Date(now.getTime() + 3 * DAY_MS);
  const in6Days = new Date(now.getTime() + 6 * DAY_MS);
  const in7Days = new Date(now.getTime() + 7 * DAY_MS);

  const results = {
    trialsGracePeriod:        0,
    subscriptionsGracePeriod: 0,
    pastDueExpired:           0,
    trialWarningsSent:        0,
    subscriptionWarningsSent: 0,
    errors:                   [],
  };

  await Promise.all([
    expireTrials(now, results),
    sendTrialWarnings(now, in1Day, in2Days, in3Days, in6Days, in7Days, results),
    expireSubscriptions(now, results),
    sendSubscriptionWarnings(now, in1Day, in2Days, in3Days, in6Days, in7Days, results),
    expirePastDueSubscriptions(now, results),
  ]);

  const finishedAt = new Date();
  const status = results.errors.length === 0 ? 'success'
    : results.errors.length < 3 ? 'partial'
    : 'error';

  await CronLog.findByIdAndUpdate(log._id, {
    finishedAt,
    durationMs: finishedAt - startedAt,
    status,
    results,
  });

  logger.info(`[tenant.expiry] Cron finished — status: ${status}`, results);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAdmin(tenantId) {
  return User.findOne({ tenantId, role: 'tenant_admin', deletedAt: null }).select('firstName email').lean();
}

function tenantBranding(tenant) {
  return {
    logoUrl:      tenant?.settings?.logo         || null,
    primaryColor: tenant?.settings?.primaryColor || null,
  };
}

// Returns true if a warning at `key` ('7d'|'3d'|'1d') was already sent within the last 20 hours.
// If not, stamps the field and returns false so the caller proceeds.
async function shouldSkipWarning(Model, docId, key, now) {
  const doc = await Model.findById(docId).select('warnings').lean();
  const lastSent = doc?.warnings ? doc.warnings[key] || doc.warnings.get?.(key) : null;
  if (lastSent && (now - new Date(lastSent)) < 20 * 60 * 60 * 1000) return true;
  await Model.updateOne({ _id: docId }, { $set: { [`warnings.${key}`]: now } });
  return false;
}

// ─── 1. Expire trials → grace period ─────────────────────────────────────────

async function expireTrials(now, results) {
  try {
    const tenants = await Tenant.find({
      isOnTrial: true,
      status:    'active',
      trialEndsAt: { $lte: now },
    }).lean();

    for (const tenant of tenants) {
      const gracePeriodEndsAt = new Date(now.getTime() + 3 * DAY_MS);

      await Tenant.updateOne({ _id: tenant._id }, { $set: { isOnTrial: false } });
      await Subscription.updateOne(
        { tenantId: tenant._id, status: 'trial' },
        { $set: { status: 'past_due', gracePeriodEndsAt } }
      );

      emitBillingUpdated(tenant._id, { event: 'grace_period_started', reason: 'trial' });

      const admin = await getAdmin(tenant._id);
      if (admin?.email) {
        await queueEmail({
          to: admin.email,
          tenantId: tenant._id.toString(),
          ...gracePeriodTemplate({
            adminName:  admin.firstName || 'Admin',
            tenantName: tenant.name,
            reason:     'trial',
            upgradeUrl: `${APP_URL}/billing`,
            gracePeriodEndsAt,
            branding:   tenantBranding(tenant),
          }),
        });
      }

      results.trialsGracePeriod++;
    }

    logger.info(`[tenant.expiry] Started grace period for ${tenants.length} trial(s)`);
  } catch (err) {
    logger.error(`[tenant.expiry] expireTrials error: ${err.message}`);
    results.errors.push(`expireTrials: ${err.message}`);
  }
}

// ─── 2. Trial warning emails (7d / 3d / 1d) ──────────────────────────────────

async function sendTrialWarnings(now, in1Day, in2Days, in3Days, in6Days, in7Days, results) {
  const windows = [
    { gt: in6Days, lte: in7Days, daysLeft: 7 },
    { gt: in2Days, lte: in3Days, daysLeft: 3 },
    { gt: now,     lte: in1Day,  daysLeft: 1 },
  ];

  for (const { gt, lte, daysLeft } of windows) {
    const key = `${daysLeft}d`;
    try {
      const tenants = await Tenant.find({
        isOnTrial: true,
        status:    'active',
        trialEndsAt: { $gt: gt, $lte: lte },
      }).lean();

      let sent = 0;
      for (const tenant of tenants) {
        if (await shouldSkipWarning(Tenant, tenant._id, key, now)) continue;

        const admin = await getAdmin(tenant._id);
        if (!admin?.email) continue;

        await queueEmail({
          to: admin.email,
          tenantId: tenant._id.toString(),
          ...trialWarningTemplate({
            adminName:  admin.firstName || 'Admin',
            tenantName: tenant.name,
            daysLeft,
            upgradeUrl: `${APP_URL}/billing`,
            branding:   tenantBranding(tenant),
          }),
        });
        sent++;
      }

      results.trialWarningsSent += sent;
      logger.info(`[tenant.expiry] Sent ${sent} ${daysLeft}-day trial warning(s)`);
    } catch (err) {
      logger.error(`[tenant.expiry] sendTrialWarnings (${daysLeft}d) error: ${err.message}`);
      results.errors.push(`sendTrialWarnings(${daysLeft}d): ${err.message}`);
    }
  }
}

// ─── 3. Expire non-renewing subscriptions → grace period ─────────────────────

async function expireSubscriptions(now, results) {
  try {
    const subs = await Subscription.find({
      status:           'active',
      autoRenew:        false,
      currentPeriodEnd: { $lte: now },
    }).lean();

    for (const sub of subs) {
      const gracePeriodEndsAt = new Date(now.getTime() + 3 * DAY_MS);

      await Subscription.updateOne({ _id: sub._id }, { $set: { status: 'past_due', gracePeriodEndsAt } });
      emitBillingUpdated(sub.tenantId, { event: 'grace_period_started', reason: 'subscription' });

      const admin  = await getAdmin(sub.tenantId);
      const tenant = await Tenant.findById(sub.tenantId).select('name settings.logo settings.primaryColor').lean();
      if (!admin?.email) continue;

      await queueEmail({
        to: admin.email,
        tenantId: sub.tenantId.toString(),
        ...gracePeriodTemplate({
          adminName:  admin.firstName || 'Admin',
          tenantName: tenant?.name || 'Your School',
          reason:     'subscription',
          upgradeUrl: `${APP_URL}/billing`,
          gracePeriodEndsAt,
          branding:   tenantBranding(tenant),
        }),
      });

      results.subscriptionsGracePeriod++;
    }

    logger.info(`[tenant.expiry] Started grace period for ${subs.length} subscription(s)`);
  } catch (err) {
    logger.error(`[tenant.expiry] expireSubscriptions error: ${err.message}`);
    results.errors.push(`expireSubscriptions: ${err.message}`);
  }
}

// ─── 4. Subscription warning emails (7d / 3d / 1d) ───────────────────────────

async function sendSubscriptionWarnings(now, in1Day, in2Days, in3Days, in6Days, in7Days, results) {
  const windows = [
    { gt: in6Days, lte: in7Days, daysLeft: 7 },
    { gt: in2Days, lte: in3Days, daysLeft: 3 },
    { gt: now,     lte: in1Day,  daysLeft: 1 },
  ];

  for (const { gt, lte, daysLeft } of windows) {
    const key = `${daysLeft}d`;
    try {
      const subs = await Subscription.find({
        status:           'active',
        autoRenew:        false,
        currentPeriodEnd: { $gt: gt, $lte: lte },
      }).lean();

      let sent = 0;
      for (const sub of subs) {
        if (await shouldSkipWarning(Subscription, sub._id, key, now)) continue;

        const admin  = await getAdmin(sub.tenantId);
        const tenant = await Tenant.findById(sub.tenantId).select('name settings.logo settings.primaryColor').lean();
        if (!admin?.email) continue;

        await queueEmail({
          to: admin.email,
          tenantId: sub.tenantId.toString(),
          ...trialWarningTemplate({
            adminName:  admin.firstName || 'Admin',
            tenantName: tenant?.name || 'Your School',
            daysLeft,
            upgradeUrl: `${APP_URL}/billing`,
            branding:   tenantBranding(tenant),
          }),
        });
        sent++;
      }

      results.subscriptionWarningsSent += sent;
      logger.info(`[tenant.expiry] Sent ${sent} ${daysLeft}-day subscription warning(s)`);
    } catch (err) {
      logger.error(`[tenant.expiry] sendSubscriptionWarnings (${daysLeft}d) error: ${err.message}`);
      results.errors.push(`sendSubscriptionWarnings(${daysLeft}d): ${err.message}`);
    }
  }
}

// ─── 5. Expire past-due subscriptions after grace period ─────────────────────

async function expirePastDueSubscriptions(now, results) {
  try {
    const subs = await Subscription.find({
      status: 'past_due',
      gracePeriodEndsAt: { $lte: now },
    }).lean();

    for (const sub of subs) {
      await Subscription.updateOne({ _id: sub._id }, { $set: { status: 'expired', gracePeriodEndsAt: null } });
      await Tenant.updateOne({ _id: sub.tenantId }, { $set: { status: 'plan_expired' } });
      emitBillingUpdated(sub.tenantId, { event: 'subscription_expired' });

      const admin  = await getAdmin(sub.tenantId);
      const tenant = await Tenant.findById(sub.tenantId).select('name settings.logo settings.primaryColor').lean();
      if (!admin?.email) continue;

      await queueEmail({
        to: admin.email,
        tenantId: sub.tenantId.toString(),
        ...planExpiredTemplate({
          adminName:  admin.firstName || 'Admin',
          tenantName: tenant?.name || 'Your School',
          reason:     'payment_failure',
          upgradeUrl: `${APP_URL}/billing`,
          branding:   tenantBranding(tenant),
        }),
      });

      results.pastDueExpired++;
    }

    logger.info(`[tenant.expiry] Expired ${subs.length} past-due subscription(s) after grace period`);
  } catch (err) {
    logger.error(`[tenant.expiry] expirePastDueSubscriptions error: ${err.message}`);
    results.errors.push(`expirePastDueSubscriptions: ${err.message}`);
  }
}

module.exports = {};
