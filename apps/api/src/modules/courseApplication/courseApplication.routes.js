const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('./courseApplication.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/permission.middleware');

// Fully anonymous endpoint, no account required — same rationale/limits as
// the Contact Form's courseFormLimiter.
const courseApplicationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many applications submitted. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public — no auth.
router.post('/submit', courseApplicationLimiter, ctrl.submit);

router.use(authenticate);

router.get('/', requireRole('tenant_admin'), ctrl.list);
router.patch('/:id/approve', requireRole('tenant_admin'), ctrl.approve);
router.patch('/:id/reject', requireRole('tenant_admin'), ctrl.reject);

module.exports = router;
