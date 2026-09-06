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
      // Bull's defaults (stalledInterval/guardInterval: 5000ms) poll Redis
      // continuously even when the queue is idle — this is what burned
      // through the Upstash free-tier command quota (see queue-level
      // comment below), not real email volume. Emails aren't latency
      // sensitive enough to need sub-minute stalled-job or delayed-job
      // checks, so both are relaxed to cut that polling ~12x.
      settings: {
        stalledInterval: 60000,
        guardInterval: 60000,
      },
    });

    q.on('failed', (job, err) => {
      logger.error(`Job ${job.id} in queue "${name}" failed`, { error: err.message });
    });

    queues.set(name, q);
  }
  return queues.get(name);
}

// Only email still uses Bull — everything else moved to node-cron +
// MongoDB (see jobs/scheduler.js and jobs/taskDispatcher.js) since those
// queues polled Redis continuously even when idle, which is what actually
// burned through the Upstash free-tier request quota, not real job volume.
const emailQueue = () => getQueue('email');

module.exports = { emailQueue };
