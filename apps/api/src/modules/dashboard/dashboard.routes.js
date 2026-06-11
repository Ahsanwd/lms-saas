const router = require('express').Router();
const ctrl = require('./dashboard.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/permission.middleware');

router.use(authenticate);

// Auto-dispatch based on role
router.get('/', ctrl.getDashboard);

// Explicit role-scoped endpoints
router.get('/tenant-admin', requireRole('tenant_admin', 'super_admin'), ctrl.getTenantAdminDashboard);
router.get('/instructor', requireRole('instructor', 'tenant_admin', 'super_admin'), ctrl.getInstructorDashboard);
router.get('/student', requireRole('student'), ctrl.getStudentDashboard);

// Onboarding checklist (tenant admin only)
router.get('/onboarding-checklist', requireRole('tenant_admin'), ctrl.getOnboardingChecklist);

// Cron health logs (super admin only)
router.get('/cron-logs', requireRole('super_admin'), ctrl.getCronLogs);

// Activity logs
router.get('/my-activity', ctrl.getMyActivity);
router.get('/courses/:courseId/students/:studentId/activity',
  requireRole('tenant_admin', 'instructor', 'super_admin'),
  ctrl.getStudentActivity
);

module.exports = router;
