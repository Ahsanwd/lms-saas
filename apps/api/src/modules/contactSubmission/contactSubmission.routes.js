const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('./contactSubmission.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/permission.middleware');

// Stricter than login's limiter — this endpoint is fully anonymous, no
// account required, so it's the more attractive target for abuse/spam
// (and burning through Brevo's free 300/day send cap).
const contactFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many messages sent. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public — no auth.
router.post('/submit', contactFormLimiter, ctrl.submit);

router.use(authenticate);

router.get('/', requireRole('tenant_admin'), ctrl.list);
router.get('/unread-count', requireRole('tenant_admin'), ctrl.unreadCount);
router.patch('/:id', requireRole('tenant_admin'), ctrl.updateStatus);

module.exports = router;
