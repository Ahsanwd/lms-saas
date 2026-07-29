const router = require('express').Router();
const { authenticate }                   = require('../../middlewares/auth.middleware');
const { requirePermission, requireRole } = require('../../middlewares/permission.middleware');
const ctrl = require('./analytics.controller');

router.use(authenticate);

// Tenant admin + instructor
router.get('/courses',              requirePermission('course:read'),    ctrl.courseReport);

// Tenant admin only. `user:read` alone doesn't enforce this — the instructor
// role also holds `user:read` (scoped to student-profile edits elsewhere,
// per the comment in config/permissions.js), so gating these on the
// permission alone let any instructor pull the full tenant-wide student
// roster (names/emails/completion for every student, not just their own)
// and every instructor's earnings. requireRole closes that gap directly.
router.get('/students',             requireRole('tenant_admin'), ctrl.studentReport);
router.get('/revenue',              requirePermission('billing:read'),   ctrl.revenueReport);
router.get('/instructor-earnings',  requireRole('tenant_admin'), ctrl.instructorEarnings);
router.get('/engagement',           requirePermission('course:read'),    ctrl.engagementReport);

module.exports = router;
