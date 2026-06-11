const svc = require('./enrollmentRequest.service');
const R   = require('../../utils/response');

async function submit(req, res, next) {
  try {
    const request = await svc.submitRequest(
      req.tenant.tenantId, req.params.courseId, req.user.sub, req.body
    );
    R.created(res, { request }, 'Enrollment request submitted');
  } catch (err) { next(err); }
}

async function myRequest(req, res, next) {
  try {
    const request = await svc.getMyRequest(
      req.tenant.tenantId, req.params.courseId, req.user.sub
    );
    R.success(res, { request });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const result = await svc.listRequests(
      req.tenant.tenantId, req.params.courseId, req.query
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function approve(req, res, next) {
  try {
    const request = await svc.approveRequest(
      req.tenant.tenantId, req.params.requestId, req.user.sub, req.body
    );
    R.success(res, { request }, 'Request approved');
  } catch (err) { next(err); }
}

async function reject(req, res, next) {
  try {
    const request = await svc.rejectRequest(
      req.tenant.tenantId, req.params.requestId, req.user.sub, req.body
    );
    R.success(res, { request }, 'Request rejected');
  } catch (err) { next(err); }
}

module.exports = { submit, myRequest, list, approve, reject };
