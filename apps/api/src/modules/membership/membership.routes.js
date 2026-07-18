const router = require('express').Router();
const ctrl   = require('./membership.controller');
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requireRole, requirePermission } = require('../../middlewares/permission.middleware');

// Public marketing-site listing (no auth) — mirrors course.routes.js's own
// /public pattern. Active plans only, no admin-only subscriber counts.
router.get('/plans/public', ctrl.listPublicPlans);

router.use(authenticate);

// ── Plan management — Tenant Admin only ───────────────────────────────────────
router.get('/plans',             ctrl.listPlans);                                      // all roles (students need to browse)
router.post('/plans',            requireRole('tenant_admin'), ctrl.createPlan);
router.put('/plans/:id',         requireRole('tenant_admin'), ctrl.updatePlan);
router.patch('/plans/:id/toggle',requireRole('tenant_admin'), ctrl.togglePlan);
router.delete('/plans/:id',      requireRole('tenant_admin'), ctrl.deletePlan);

// ── Admin overview ────────────────────────────────────────────────────────────
router.get('/subscriptions',          requireRole('tenant_admin'), ctrl.listSubscriptions);
router.get('/failed-renewals',        requireRole('tenant_admin'), ctrl.failedRenewals);

// ── Student subscription ──────────────────────────────────────────────────────
router.get('/my',                ctrl.getMySubscription);
router.post('/initiate',         requireRole('student'), ctrl.initiate);
router.post('/:subscriptionId/confirm', requireRole('student'), ctrl.confirm);
router.post('/cancel',           requireRole('student'), ctrl.cancel);
router.get('/access/:courseId',  ctrl.checkAccess);

module.exports = router;
