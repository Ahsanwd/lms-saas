const { verifyRecaptcha } = require('../../utils/recaptcha');
const { queueEmail } = require('../../jobs/email.job');
const buildPlatformContactEmail = require('../../services/email/templates/platformContactSubmission');
const AppError = require('../../utils/AppError');
const R = require('../../utils/response');

const PLATFORM_CONTACT_EMAIL = 'ahsanspo@gmail.com';

// Public — no auth, no tenant. Guarded by contactLimiter + reCAPTCHA + a
// honeypot field at the route/form level (recaptcha silently no-ops if
// RECAPTCHA_SECRET_KEY isn't configured, so the honeypot is the baseline
// bot defense that works with zero external config).
async function submit(req, res, next) {
  try {
    const { name, email, phone, message, recaptchaToken, website } = req.body;

    // Honeypot: a real visitor never sees or fills this field.
    if (website) return R.success(res, {}, 'Message sent');

    if (!name || !email || !message) {
      throw new AppError('Name, email, and message are required.', 422, 'VALIDATION_ERROR');
    }

    await verifyRecaptcha(recaptchaToken);

    await queueEmail({
      to: PLATFORM_CONTACT_EMAIL,
      ...buildPlatformContactEmail({
        name,
        email,
        phone,
        message,
        submittedAt: new Date().toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC',
      }),
    }).catch(() => {});

    R.success(res, {}, 'Message sent');
  } catch (err) { next(err); }
}

module.exports = { submit };
