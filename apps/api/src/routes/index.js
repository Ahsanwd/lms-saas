const router = require('express').Router();
const { resolveTenant, requireActivePlan } = require('../middlewares/tenant.middleware');
const { registerTenant, checkSubdomain } = require('../modules/auth/auth.controller');

// ── No tenant resolution needed ───────────────────────────────────────────────
router.use('/admin/tenants',   require('../modules/tenant/admin.tenant.routes'));
router.use('/admin/billing',   require('../modules/billing/admin.billing.routes'));
router.use('/admin/dashboard', require('../modules/dashboard/admin.dashboard.routes'));

// Secure file serving — token contains tenantId, no resolveTenant needed
router.use('/files', require('../modules/secureFile/secureFile.routes'));

// New org signup — creates tenant + admin user, no existing tenant needed
router.post('/auth/register-tenant', registerTenant);
router.get('/auth/check-subdomain',  checkSubdomain);

// ── Public certificate verification (no tenant, no auth) ──────────────────────
router.get('/verify-certificate/:certificateId', require('../modules/course/course.controller').verifyCertificate);

// ── All routes below require tenant resolution ────────────────────────────────
router.use(resolveTenant);

// Auth, billing, and tenant-settings routes remain accessible when a plan is expired
// so the admin can log in and reactivate their subscription.
router.use('/auth',    require('../modules/auth/auth.routes'));
router.use('/billing', require('../modules/billing/billing.routes'));
router.use('/tenant',  require('../modules/tenant/tenant.routes'));

// All other operational routes require an active (non-expired) plan.
router.use(requireActivePlan);

router.use('/users',            require('../modules/user/user.routes'));
router.use('/enrollment-links', require('../modules/enrollmentLink/enrollmentLink.routes'));
router.use('/courses',   require('../modules/course/course.routes'));
router.use('/quizzes',   require('../modules/quiz/quiz.routes'));
router.use('/dashboard',     require('../modules/dashboard/dashboard.routes'));
router.use('/announcements', require('../modules/announcement/announcement.routes'));
router.use('/assignments',          require('../modules/assignment/assignment.routes'));
router.use('/assignment-templates', require('../modules/assignmentTemplate/assignmentTemplate.routes'));
router.use('/coupons',        require('../modules/coupon/coupon.routes'));
router.use('/payments',       require('../modules/payment/payment.routes'));
router.use('/groups',         require('../modules/group/group.routes'));
router.use('/notifications',          require('../modules/notification/notification.routes'));
router.use('/certificate-templates',  require('../modules/certificateTemplate/certTemplate.routes'));
router.use('/discussions',            require('../modules/discussion/discussion.routes'));
router.use('/chat',                   require('../modules/chat/chat.routes'));
router.use('/forum',                  require('../modules/forum/forum.routes'));
router.use('/push',                   require('../modules/push/push.routes'));
router.use('/live',                   require('../modules/live/live.routes'));
router.use('/zoom',                   require('../modules/zoom/zoom.routes'));
router.use('/membership',             require('../modules/membership/membership.routes'));
router.use('/refund-requests',        require('../modules/refundRequest/refundRequest.routes'));
router.use('/analytics',              require('../modules/analytics/analytics.routes'));
router.use('/search',                 require('../modules/search/search.routes'));
router.use('/bookmarks',              require('../modules/bookmark/bookmark.routes'));
router.use('/cohorts',                require('../modules/cohort/cohort.top.routes'));

module.exports = router;
