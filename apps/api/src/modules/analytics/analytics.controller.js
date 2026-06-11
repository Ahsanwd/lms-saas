const svc = require('./analytics.service');
const R   = require('../../utils/response');

async function studentReport(req, res, next) {
  try {
    const data = await svc.getStudentReport(req.tenant.tenantId, req.query);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function revenueReport(req, res, next) {
  try {
    const data = await svc.getRevenueReport(req.tenant.tenantId, req.query);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function courseReport(req, res, next) {
  try {
    const instructorId = req.user.role === 'instructor' ? req.user.sub : req.query.instructorId;
    const data = await svc.getCourseReport(req.tenant.tenantId, { ...req.query, instructorId });
    R.success(res, data);
  } catch (err) { next(err); }
}

async function instructorEarnings(req, res, next) {
  try {
    const data = await svc.getInstructorEarnings(req.tenant.tenantId, req.query);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function engagementReport(req, res, next) {
  try {
    const data = await svc.getEngagementReport(req.tenant.tenantId, req.query);
    R.success(res, data);
  } catch (err) { next(err); }
}

module.exports = { studentReport, revenueReport, courseReport, instructorEarnings, engagementReport };
