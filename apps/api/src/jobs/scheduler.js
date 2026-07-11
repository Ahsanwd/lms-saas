const cron   = require('node-cron');
const logger = require('../utils/logger');

const { runMembershipRenewalCron } = require('./membership.renewal.job');
const { runTenantExpiryCron }      = require('./tenantExpiry.job');
const { runAnalyticsWeeklyReport } = require('./analyticsReport.job');
const { runAssignmentDueCron }     = require('./assignmentDue.job');
const { runTrialExpiringCron }     = require('./trialExpiring.job');

// Plain in-process cron scheduling — no Redis/Bull. These are all
// fixed-schedule daily/weekly jobs with no delay or cross-restart
// persistence requirement, so a queue was unnecessary overhead.
function register(name, cronExpr, fn) {
  cron.schedule(cronExpr, () => {
    logger.info(`[scheduler] Running ${name}`);
    fn().catch((err) => logger.error(`[scheduler] ${name} failed: ${err.message}`));
  });
  logger.info(`[scheduler] Registered ${name} (${cronExpr})`);
}

register('membership-renewal-cron', '0 0 * * *',  runMembershipRenewalCron);
register('tenant-expiry-cron',      '5 0 * * *',  runTenantExpiryCron);
register('analytics-weekly-report', '0 8 * * 1',  runAnalyticsWeeklyReport);
register('assignment-due-cron',     '0 9 * * *',  runAssignmentDueCron);
register('trial-expiring-cron',     '10 9 * * *', runTrialExpiringCron);
