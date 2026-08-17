const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('./marketingLead.controller');

// Fully anonymous, no tenant, no account — same posture as platformContact's
// limiter (the more attractive target for abuse, and the one that burns
// through Brevo's free send cap fastest).
const optInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/checklist-optin', optInLimiter, ctrl.checklistOptIn);

module.exports = router;
