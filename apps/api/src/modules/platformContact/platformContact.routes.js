const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('./platformContact.controller');

// Fully anonymous, no tenant, no account — the most attractive target for
// spam/abuse on the whole app, so it gets the strictest limiter.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many messages sent. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', contactLimiter, ctrl.submit);

module.exports = router;
