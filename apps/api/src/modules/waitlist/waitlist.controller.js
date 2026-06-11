const waitlistService = require('./waitlist.service');
const R = require('../../utils/response');

async function join(req, res, next) {
  try {
    const entry = await waitlistService.joinWaitlist(
      req.tenant.tenantId, req.params.courseId, req.user.sub
    );
    R.created(res, { entry }, 'Added to waitlist');
  } catch (err) { next(err); }
}

async function leave(req, res, next) {
  try {
    await waitlistService.leaveWaitlist(
      req.tenant.tenantId, req.params.courseId, req.user.sub
    );
    R.success(res, {}, 'Removed from waitlist');
  } catch (err) { next(err); }
}

async function myPosition(req, res, next) {
  try {
    const position = await waitlistService.getMyPosition(
      req.tenant.tenantId, req.params.courseId, req.user.sub
    );
    R.success(res, { position });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const result = await waitlistService.listWaitlist(
      req.tenant.tenantId, req.params.courseId, req.query
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function adminRemove(req, res, next) {
  try {
    await waitlistService.adminRemove(
      req.tenant.tenantId, req.params.courseId, req.params.userId
    );
    R.success(res, {}, 'Removed from waitlist');
  } catch (err) { next(err); }
}

module.exports = { join, leave, myPosition, list, adminRemove };
