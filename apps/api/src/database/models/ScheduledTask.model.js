const mongoose = require('mongoose');

// Replaces Bull/Redis delayed jobs for one-off, future-dated tasks
// (scheduled announcement publish, live-class reminders) — polled by
// apps/api/src/jobs/taskDispatcher.js instead of held in Redis, so
// restarts/deploys don't lose pending work and no always-on Redis
// connection is needed.
const scheduledTaskSchema = new mongoose.Schema(
  {
    type:    { type: String, required: true },
    jobKey:  { type: String, required: true, unique: true }, // dedupe/reschedule key
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    runAt:   { type: Date, required: true },

    status: {
      type: String,
      enum: ['pending', 'done', 'failed'],
      default: 'pending',
    },

    attempts:    { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 1 },
    backoffMs:   { type: Number, default: 0 },
    lastError:   { type: String, default: null },
  },
  { timestamps: true }
);

scheduledTaskSchema.index({ status: 1, runAt: 1 });

module.exports = mongoose.model('ScheduledTask', scheduledTaskSchema);
