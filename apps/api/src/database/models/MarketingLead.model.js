const mongoose = require('mongoose');

// Platform-level lead capture (no tenantId — these are prospective tenants,
// not students of an existing school). One record per email+source pair;
// re-submitting the same opt-in form is a no-op against the drip sequence
// (see marketingLead.service.js) but doesn't error.
const marketingLeadSchema = new mongoose.Schema(
  {
    email:  { type: String, required: true, lowercase: true, trim: true },
    name:   { type: String, default: null },
    source: { type: String, required: true }, // e.g. 'pk-launch-checklist'
    brevoSynced: { type: Boolean, default: false },
  },
  { timestamps: true }
);

marketingLeadSchema.index({ email: 1, source: 1 }, { unique: true });

module.exports = mongoose.model('MarketingLead', marketingLeadSchema);
