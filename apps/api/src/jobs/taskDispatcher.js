const cron   = require('node-cron');
const logger = require('../utils/logger');
const scheduledTaskRepo = require('../database/repositories/scheduledTask.repository');

const { handleScheduledPublish }    = require('./announcement.scheduler.job');
const { handleLiveReminder }        = require('./liveReminder.job');

const HANDLERS = {
  'scheduled-publish':    handleScheduledPublish,
  'live-reminder':        handleLiveReminder,
};

// Polls MongoDB for due one-off tasks every minute — replaces Bull's
// Redis-backed delayed jobs. Handlers are idempotent/self-guarding (each
// checks the underlying record is still in the expected state), so
// at-least-once polling is safe.
async function runDueTasks() {
  const due = await scheduledTaskRepo.findDue(new Date(), 50);

  for (const task of due) {
    const handler = HANDLERS[task.type];
    if (!handler) {
      logger.error(`[taskDispatcher] No handler for task type "${task.type}" (${task._id})`);
      continue;
    }

    try {
      await handler(task.payload);
      await scheduledTaskRepo.markDone(task._id);
    } catch (err) {
      logger.error(`[taskDispatcher] Task ${task._id} (${task.type}) failed: ${err.message}`);
      await scheduledTaskRepo.markFailedOrRetry(task._id, err);
    }
  }
}

cron.schedule('* * * * *', () => {
  runDueTasks().catch((err) => logger.error(`[taskDispatcher] Poll error: ${err.message}`));
});
logger.info('[taskDispatcher] Registered — polling due tasks every minute');

module.exports = { runDueTasks };
