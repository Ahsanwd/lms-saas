const dashboardService = require('./dashboard.service');
const R = require('../../utils/response');

// Role-based dispatcher — single endpoint returns data for the calling user's role
async function getDashboard(req, res, next) {
  try {
    const { role, sub: userId, tenantId } = req.user;
    const tid = req.tenant?.tenantId || tenantId;
    let data;

    switch (role) {
      case 'tenant_admin':
        data = await dashboardService.getTenantAdminDashboard(tid);
        break;
      case 'instructor':
        data = await dashboardService.getInstructorDashboard(tid, userId);
        break;
      case 'student':
        data = await dashboardService.getStudentDashboard(tid, userId);
        break;
      default:
        return R.error(res, 'Dashboard not available for this role', 403);
    }

    R.success(res, { role, dashboard: data });
  } catch (err) { next(err); }
}

// Explicit per-role endpoints for direct access
async function getTenantAdminDashboard(req, res, next) {
  try {
    const data = await dashboardService.getTenantAdminDashboard(req.tenant.tenantId);
    R.success(res, { dashboard: data });
  } catch (err) { next(err); }
}

async function getInstructorDashboard(req, res, next) {
  try {
    const data = await dashboardService.getInstructorDashboard(req.tenant.tenantId, req.user.sub);
    R.success(res, { dashboard: data });
  } catch (err) { next(err); }
}

async function getStudentDashboard(req, res, next) {
  try {
    const data = await dashboardService.getStudentDashboard(req.tenant.tenantId, req.user.sub);
    R.success(res, { dashboard: data });
  } catch (err) { next(err); }
}

// Super Admin dashboard
async function getSuperAdminDashboard(req, res, next) {
  try {
    const data = await dashboardService.getSuperAdminDashboard();
    R.success(res, { dashboard: data });
  } catch (err) { next(err); }
}

async function getOnboardingChecklist(req, res, next) {
  try {
    const data = await dashboardService.getOnboardingChecklist(req.tenant.tenantId);
    R.success(res, { checklist: data });
  } catch (err) { next(err); }
}

async function getMyActivity(req, res, next) {
  try {
    const { page, limit } = req.query;
    const data = await dashboardService.getMyActivity(
      req.tenant.tenantId, req.user.sub, { page, limit }
    );
    R.success(res, data);
  } catch (err) { next(err); }
}

async function getStudentActivity(req, res, next) {
  try {
    const { courseId, studentId } = req.params;
    const { page, limit } = req.query;
    const data = await dashboardService.getStudentActivityForCourse(
      req.tenant.tenantId, courseId, studentId, req.user, { page, limit }
    );
    R.success(res, data);
  } catch (err) { next(err); }
}

async function getCronLogs(req, res, next) {
  try {
    const { page, limit } = req.query;
    const data = await dashboardService.getCronLogs({ page, limit });
    R.success(res, data);
  } catch (err) { next(err); }
}

module.exports = {
  getDashboard,
  getTenantAdminDashboard,
  getInstructorDashboard,
  getStudentDashboard,
  getSuperAdminDashboard,
  getOnboardingChecklist,
  getMyActivity,
  getStudentActivity,
  getCronLogs,
};
