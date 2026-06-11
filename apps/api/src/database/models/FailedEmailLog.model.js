const mongoose = require('mongoose');

// Permanent record of emails that exhausted all Bull retries.
// Used by the admin "Failed Emails" panel to surface delivery failures.
const failedEmailLogSchema = new mongoose.Schema(
  {
    tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
    to:           { type: String, required: true },
    subject:      { type: String, default: '' },
    errorMessage: { type: String, default: 'Unknown error' },
    attemptsMade: { type: Number, default: 0 },
    jobId:        { type: String, default: null },
    failedAt:     { type: Date, default: Date.now },
  },
  { timestamps: false }
);

failedEmailLogSchema.index({ failedAt: -1 });
failedEmailLogSchema.index({ tenantId: 1, failedAt: -1 });

module.exports = mongoose.model('FailedEmailLog', failedEmailLogSchema);
