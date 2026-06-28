const Bull = require('bull');
const config = require('../config');
const logger = require('../utils/logger');

const queues = new Map();

function getQueue(name) {
  if (!queues.has(name)) {
    const q = new Bull(name, {
      redis: {
        host:     config.redis.host,
        port:     config.redis.port,
        password: config.redis.password,
        tls:      config.redis.tls ? {} : undefined,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });

    q.on('failed', (job, err) => {
      logger.error(`Job ${job.id} in queue "${name}" failed`, { error: err.message });
    });

    queues.set(name, q);
  }
  return queues.get(name);
}

const emailQueue              = () => getQueue('email');
const membershipRenewalQueue  = () => getQueue('membership-renewal');
const tenantExpiryQueue       = () => getQueue('tenant-expiry');
const announcementQueue       = () => getQueue('announcement-scheduler');
const liveReminderQueue       = () => getQueue('live-reminder');
const zoomRecordingQueue      = () => getQueue('zoom-recording');
const analyticsReportQueue    = () => getQueue('analytics-report');

module.exports = { emailQueue, membershipRenewalQueue, tenantExpiryQueue, announcementQueue, liveReminderQueue, zoomRecordingQueue, analyticsReportQueue };
