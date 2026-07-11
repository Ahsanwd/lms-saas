const ScheduledTask = require('../models/ScheduledTask.model');

class ScheduledTaskRepository {
  // Upsert by jobKey — a reschedule (e.g. class time changed) replaces the
  // existing pending task instead of creating a duplicate, mirroring Bull's
  // jobId-dedupe behavior.
  schedule({ type, jobKey, payload, runAt, maxAttempts = 1, backoffMs = 0 }) {
    return ScheduledTask.findOneAndUpdate(
      { jobKey },
      {
        type, jobKey, payload, runAt, maxAttempts, backoffMs,
        status: 'pending', attempts: 0, lastError: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  findDue(now, limit = 50) {
    return ScheduledTask.find({ status: 'pending', runAt: { $lte: now } })
      .sort({ runAt: 1 })
      .limit(limit);
  }

  markDone(id) {
    return ScheduledTask.findByIdAndUpdate(id, { status: 'done' });
  }

  async markFailedOrRetry(id, err) {
    const task = await ScheduledTask.findById(id);
    if (!task) return;

    const attempts = task.attempts + 1;
    if (attempts >= task.maxAttempts) {
      task.status = 'failed';
    } else {
      task.status = 'pending';
      task.runAt  = new Date(Date.now() + task.backoffMs);
    }
    task.attempts  = attempts;
    task.lastError = err?.message || 'Unknown error';
    await task.save();
  }
}

module.exports = new ScheduledTaskRepository();
