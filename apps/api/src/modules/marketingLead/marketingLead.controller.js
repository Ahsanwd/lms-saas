const marketingLeadService = require('./marketingLead.service');
const { verifyRecaptcha } = require('../../utils/recaptcha');
const R = require('../../utils/response');

const MAX_NAME_LENGTH = 100;

// Public — no auth, no tenant. Guarded by the route-level rate limiter,
// a honeypot field, and reCAPTCHA (soft-skips if not configured — same
// convention as platformContact.controller.js).
async function checklistOptIn(req, res, next) {
  try {
    const { email, name, recaptchaToken, website } = req.body;

    // Honeypot: a real visitor never sees or fills this field.
    if (website) return R.success(res, {}, 'Subscribed');

    if (name && String(name).length > MAX_NAME_LENGTH) {
      return R.error(res, 'Name is too long', 422);
    }

    await verifyRecaptcha(recaptchaToken);

    await marketingLeadService.captureLead({ email, name, source: 'pk-launch-checklist' });

    R.success(res, {}, 'Subscribed');
  } catch (err) { next(err); }
}

module.exports = { checklistOptIn };
