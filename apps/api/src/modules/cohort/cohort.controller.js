const svc = require('./cohort.service');
const R   = require('../../utils/response');

async function listAll(req, res, next) {
  try {
    const cohorts = await svc.listAllCohorts(req.tenant.tenantId, req.query);
    R.success(res, { cohorts });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const cohort = await svc.getOneCohort(req.tenant.tenantId, req.params.cohortId);
    R.success(res, { cohort });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const cohorts = await svc.listCohorts(req.tenant.tenantId, req.params.courseId);
    R.success(res, { cohorts });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const cohort = await svc.createCohort(req.tenant.tenantId, req.params.courseId, req.body, req.user);
    R.created(res, { cohort }, 'Cohort created');
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const cohort = await svc.updateCohort(req.tenant.tenantId, req.params.cohortId, req.body);
    R.success(res, { cohort }, 'Cohort updated');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await svc.deleteCohort(req.tenant.tenantId, req.params.cohortId);
    R.success(res, {}, 'Cohort deleted');
  } catch (err) { next(err); }
}

async function enroll(req, res, next) {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0)
      return R.error(res, 'userIds array is required', 400);
    const result = await svc.bulkEnroll(req.tenant.tenantId, req.params.cohortId, userIds);
    R.success(res, result, `Enrolled ${result.enrolled.length} students`);
  } catch (err) { next(err); }
}

async function students(req, res, next) {
  try {
    const result = await svc.getCohortStudents(req.tenant.tenantId, req.params.cohortId);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function graduate(req, res, next) {
  try {
    const member = await svc.graduateStudent(
      req.tenant.tenantId, req.params.cohortId, req.params.userId, req.user
    );
    R.success(res, { member }, 'Student graduated');
  } catch (err) { next(err); }
}

async function graduateAll(req, res, next) {
  try {
    const result = await svc.graduateAll(req.tenant.tenantId, req.params.cohortId, req.user);
    R.success(res, result, `Graduated ${result.graduated} students`);
  } catch (err) { next(err); }
}

async function report(req, res, next) {
  try {
    const data = await svc.getCohortReport(req.tenant.tenantId, req.params.cohortId);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function myCohort(req, res, next) {
  try {
    const data = await svc.getMyCohort(req.tenant.tenantId, req.params.id, req.user.sub);
    R.success(res, data);
  } catch (err) { next(err); }
}

module.exports = { listAll, getOne, list, create, update, remove, enroll, students, graduate, graduateAll, report, myCohort };
