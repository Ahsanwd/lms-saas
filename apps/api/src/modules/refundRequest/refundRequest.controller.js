const svc = require('./refundRequest.service');
const R   = require('../../utils/response');

async function request(req, res, next) {
  try {
    const result = await svc.requestRefund(
      req.tenant.tenantId, req.body.paymentId, req.user.sub,
      req.body.reason, req.body.requestedAmount ?? null
    );
    R.success(res, { request: result });
  } catch (err) { next(err); }
}

async function myRequests(req, res, next) {
  try {
    const requests = await svc.getMyRequests(req.tenant.tenantId, req.user.sub);
    R.success(res, { requests });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const result = await svc.listRequests(req.tenant.tenantId, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function approve(req, res, next) {
  try {
    const result = await svc.approveRequest(
      req.tenant.tenantId, req.params.requestId, req.user.sub,
      req.body.refundAmount ?? null
    );
    R.success(res, { request: result });
  } catch (err) { next(err); }
}

async function reject(req, res, next) {
  try {
    const result = await svc.rejectRequest(
      req.tenant.tenantId, req.params.requestId, req.user.sub, req.body.adminNote
    );
    R.success(res, { request: result });
  } catch (err) { next(err); }
}

module.exports = { request, myRequests, list, approve, reject };
