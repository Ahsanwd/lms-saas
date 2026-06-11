const { announcementQueue } = require('./queue');
const announcementRepo      = require('../database/repositories/announcement.repository');
const logger                = require('../utils/logger');

announcementQueue().process(async (job) => {
  if (job.data.type !== 'scheduled-publish') return;

  const { announcementId, tenantId, scheduledAt } = job.data;

  const doc = await announcementRepo.findById(tenantId, announcementId);
  if (!doc) {
    logger.info(`Scheduled publish: announcement ${announcementId} not found — skipping`);
    return;
  }
  if (doc.isPublished) {
    logger.info(`Scheduled publish: ${announcementId} already published — skipping`);
    return;
  }
  if (!doc.scheduledPublishAt) {
    logger.info(`Scheduled publish: ${announcementId} schedule cancelled — skipping`);
    return;
  }
  // Stale job guard: a reschedule enqueues a new job with a different scheduledAt
  if (doc.scheduledPublishAt.toISOString() !== scheduledAt) {
    logger.info(`Scheduled publish: stale job for ${announcementId} — skipping`);
    return;
  }

  const svc = require('../modules/announcement/announcement.service');
  await svc.publishAnnouncementSystem(tenantId, announcementId);
  logger.info(`Scheduled announcement ${announcementId} published successfully`);
});
