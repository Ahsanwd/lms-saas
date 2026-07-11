const announcementRepo = require('../database/repositories/announcement.repository');
const logger            = require('../utils/logger');

async function handleScheduledPublish(payload) {
  const { announcementId, tenantId, scheduledAt } = payload;

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
  // Stale task guard: a reschedule upserts a new task with a different scheduledAt
  if (doc.scheduledPublishAt.toISOString() !== scheduledAt) {
    logger.info(`Scheduled publish: stale task for ${announcementId} — skipping`);
    return;
  }

  const svc = require('../modules/announcement/announcement.service');
  await svc.publishAnnouncementSystem(tenantId, announcementId);
  logger.info(`Scheduled announcement ${announcementId} published successfully`);
}

module.exports = { handleScheduledPublish };
