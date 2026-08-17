const MarketingLead = require('../../database/models/MarketingLead.model');
const { addContactToList } = require('../../services/brevo/brevoContacts');
const { queueEmail } = require('../../jobs/email.job');
const AppError = require('../../utils/AppError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const checklistDelivery   = require('../../services/email/templates/checklistDelivery');
const checklistStory      = require('../../services/email/templates/checklistStory');
const checklistObjections = require('../../services/email/templates/checklistObjections');
const checklistOffer      = require('../../services/email/templates/checklistOffer');

// Delay schedule for the 4-email drip (Day 0 / 2 / 4 / 7 from the marketing plan).
const DRIP_STEPS = [
  { template: checklistDelivery,   delay: 0 },
  { template: checklistStory,      delay: 2 * DAY_MS },
  { template: checklistObjections, delay: 4 * DAY_MS },
  { template: checklistOffer,      delay: 7 * DAY_MS },
];

// Public — no auth, no tenant. Captures an opt-in for the "Pakistan Launch
// Checklist" lead magnet, starts the 4-email nurture drip via Bull delayed
// jobs, and (if configured) syncs the contact to a Brevo marketing list.
// Idempotent by design: re-submitting the same email+source doesn't
// re-queue the drip (would otherwise stack duplicate delayed sends), it
// just confirms the existing signup.
async function captureLead({ email, name, source }) {
  if (!email || !EMAIL_RE.test(email)) throw new AppError('A valid email is required', 400);

  const existing = await MarketingLead.findOne({ email: email.toLowerCase(), source }).lean();
  if (existing) return { alreadySubscribed: true };

  await MarketingLead.create({ email: email.toLowerCase(), name: name || null, source });

  addContactToList(email, { name }).then((synced) => {
    if (synced) MarketingLead.updateOne({ email: email.toLowerCase(), source }, { brevoSynced: true }).catch(() => {});
  }).catch(() => {});

  for (const step of DRIP_STEPS) {
    queueEmail({ to: email, ...step.template({ name }) }, { delay: step.delay }).catch(() => {});
  }

  return { alreadySubscribed: false };
}

module.exports = { captureLead };
