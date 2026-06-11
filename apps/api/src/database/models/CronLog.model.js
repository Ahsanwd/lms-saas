const mongoose = require('mongoose');

const cronLogSchema = new mongoose.Schema(
  {
    jobName:     { type: String, required: true },
    startedAt:   { type: Date,   required: true },
    finishedAt:  { type: Date,   default: null },
    durationMs:  { type: Number, default: null },

    status: {
      type: String,
      enum: ['running', 'success', 'partial', 'error'],
      default: 'running',
    },

    results: {
      trialsGracePeriod:         { type: Number, default: 0 },
      subscriptionsGracePeriod:  { type: Number, default: 0 },
      pastDueExpired:            { type: Number, default: 0 },
      trialWarningsSent:         { type: Number, default: 0 },
      subscriptionWarningsSent:  { type: Number, default: 0 },
      errors:                    [String],
    },
  },
  { timestamps: true }
);

cronLogSchema.index({ jobName: 1, startedAt: -1 });

module.exports = mongoose.model('CronLog', cronLogSchema);
