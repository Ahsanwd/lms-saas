const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/permission.middleware');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, message: 'Too many requests. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new student account
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RegisterRequest' }
 *     responses:
 *       201:
 *         description: Account created — verification email sent
 *       409:
 *         description: Email already in use
 *
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email + password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginRequest' }
 *     responses:
 *       200:
 *         description: Tokens returned
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         tokens: { $ref: '#/components/schemas/AuthTokens' }
 *                         user:   { $ref: '#/components/schemas/UserProfile' }
 *       401:
 *         description: Invalid credentials
 *
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate access token using refresh token
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access token issued
 *
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Invalidate current session
 *     responses:
 *       200:
 *         description: Logged out
 *
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user: { $ref: '#/components/schemas/UserProfile' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Send password reset email
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Reset email sent (always 200 to prevent enumeration)
 *
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with token from email
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:    { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password updated
 *
 * /auth/verify-email:
 *   get:
 *     tags: [Auth]
 *     summary: Verify email address via token from email link
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Email verified
 *
 * /auth/2fa/setup:
 *   post:
 *     tags: [Auth]
 *     summary: Generate TOTP secret and QR code for 2FA setup
 *     responses:
 *       200:
 *         description: QR code URI and backup codes returned
 *
 * /auth/2fa/enable:
 *   post:
 *     tags: [Auth]
 *     summary: Confirm TOTP code to activate 2FA
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, example: '123456' }
 *     responses:
 *       200:
 *         description: 2FA enabled
 *
 * /auth/2fa/disable:
 *   post:
 *     tags: [Auth]
 *     summary: Disable 2FA (requires TOTP confirmation)
 *     responses:
 *       200:
 *         description: 2FA disabled
 */

// ─── Standard auth ────────────────────────────────────────────────────────────
router.post('/register',             ctrl.register);
router.post('/login',                loginLimiter, ctrl.login);
router.get('/verify-email',          ctrl.verifyEmail);
router.post('/verify-email',         ctrl.verifyEmail);
router.post('/resend-verification',  ctrl.resendVerification);
router.post('/forgot-password',      forgotLimiter, ctrl.forgotPassword);
router.post('/reset-password',       ctrl.resetPassword);
router.post('/refresh',              ctrl.refresh);
router.post('/logout',               authenticate, ctrl.logout);
router.post('/logout-all',           authenticate, ctrl.logoutAll);
router.get('/me',                    authenticate, ctrl.me);

// ─── Password policy (public — frontend reads this to show requirements) ──────
router.get('/password-policy',       ctrl.getPasswordPolicy);

// ─── Google OAuth ─────────────────────────────────────────────────────────────
router.get('/google/url',            googleLimiter, ctrl.googleAuthUrl);
router.post('/google/callback',      googleLimiter, ctrl.googleCallback);

// ─── 2FA / TOTP (requires active session) ────────────────────────────────────
router.post('/2fa/setup',    authenticate, ctrl.setup2FA);
router.post('/2fa/enable',   authenticate, ctrl.enable2FA);
router.post('/2fa/disable',  authenticate, ctrl.disable2FA);
router.post('/2fa/verify',   ctrl.verify2FA);   // no session yet — uses tempToken

// ─── Auth audit logs (tenant_admin only) ─────────────────────────────────────
router.get('/audit-logs', authenticate, requireRole('tenant_admin', 'super_admin'), ctrl.getAuthLogs);

module.exports = router;
