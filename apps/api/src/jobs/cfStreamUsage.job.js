const logger = require('../utils/logger');

function startOfNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

// Runs every 6h (registered in scheduler.js). For every tenant with any Cloudflare
// Stream video: resets the monthly viewer-minute counter + topup when the cycle has
// rolled over, then syncs the delta of minutes-viewed (since the last sync) from
// Cloudflare's GraphQL Analytics API into cloudflareStreamUsage.viewerMinutesUsed.
async function runCfStreamUsageCron() {
  const config = require('../config');
  const cf = config.cloudflareStream;
  if (!cf.accountId || !cf.apiToken) {
    logger.info('[cf-stream-usage] Cloudflare Stream not configured — skipping');
    return;
  }

  const Tenant = require('../database/models/Tenant.model');
  const Lesson = require('../database/models/Lesson.model');
  const cfSvc  = require('../services/cloudflareStream/cloudflareStream.service');

  const now = new Date();
  const tenantIds = await Lesson.distinct('tenantId', { 'video.provider': 'cloudflare', deletedAt: null });

  let synced = 0;
  for (const tenantId of tenantIds) {
    try {
      const tenant = await Tenant.findById(tenantId).select('cloudflareStreamUsage').lean();
      if (!tenant) continue;

      const usage = tenant.cloudflareStreamUsage || {};
      const needsReset = !usage.viewerCycleResetAt || new Date(usage.viewerCycleResetAt) <= now;

      const uids = (await Lesson.distinct('video.url', {
        tenantId, 'video.provider': 'cloudflare', deletedAt: null,
      })).filter(Boolean);

      const since = (needsReset || !usage.lastAnalyticsSyncAt)
        ? new Date(now.getTime() - 24 * 3600 * 1000)
        : new Date(usage.lastAnalyticsSyncAt);

      const deltaMinutes = uids.length
        ? await cfSvc.getViewerMinutesSince(cf.accountId, cf.apiToken, uids, since)
        : 0;

      const update = needsReset
        ? {
            $set: {
              'cloudflareStreamUsage.viewerMinutesUsed':   deltaMinutes,
              'cloudflareStreamUsage.viewerTopupMinutes':  0,
              'cloudflareStreamUsage.viewerCycleResetAt':  startOfNextMonth(now),
              'cloudflareStreamUsage.lastAnalyticsSyncAt': now,
            },
          }
        : {
            $set: { 'cloudflareStreamUsage.lastAnalyticsSyncAt': now },
            $inc: { 'cloudflareStreamUsage.viewerMinutesUsed': deltaMinutes },
          };

      await Tenant.updateOne({ _id: tenantId }, update);
      synced++;
    } catch (err) {
      logger.error(`[cf-stream-usage] tenant ${tenantId} sync failed: ${err.message}`);
    }
  }

  logger.info(`[cf-stream-usage] Cron finished — synced ${synced}/${tenantIds.length} tenant(s)`);
}

module.exports = { runCfStreamUsageCron };
