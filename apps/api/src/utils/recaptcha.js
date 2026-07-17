const AppError = require('./AppError');

// Verify reCAPTCHA v3 token — soft-skips if RECAPTCHA_SECRET_KEY isn't
// configured, matching this codebase's convention of not hard-failing on
// optional third-party integrations left unconfigured in an environment.
async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return; // reCAPTCHA not configured in this environment — skip
  // Once a secret IS configured, a missing token must fail closed —
  // otherwise anyone can bypass verification simply by omitting
  // recaptchaToken from the request, defeating the point of configuring it.
  if (!token) throw new AppError('Bot protection check failed. Please try again.', 422, 'RECAPTCHA_FAILED');
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${secret}&response=${token}`,
  });
  const json = await res.json();
  if (!json.success || (json.score !== undefined && json.score < 0.5)) {
    throw new AppError('Bot protection check failed. Please try again.', 422, 'RECAPTCHA_FAILED');
  }
}

module.exports = { verifyRecaptcha };
