const courseApplicationService = require('./courseApplication.service');
const { verifyRecaptcha } = require('../../utils/recaptcha');
const R = require('../../utils/response');

// Public — no auth. Guarded by courseApplicationLimiter + reCAPTCHA at the route level.
async function submit(req, res, next) {
  try {
    if (!req.tenant) return R.error(res, 'Tenant not found', 404);
    await verifyRecaptcha(req.body.recaptchaToken);
    const application = await courseApplicationService.submit(
      req.tenant.tenantId,
      req.body.pageId,
      req.body,
      { ip: req.ip }
    );
    R.success(res, { id: application._id }, 'Application submitted');
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const [applications, total] = await courseApplicationService.listApplications(req.tenant.tenantId, req.query);
    R.success(res, { applications, total, page: Number(req.query.page) || 1 });
  } catch (err) { next(err); }
}

async function approve(req, res, next) {
  try {
    const application = await courseApplicationService.approveApplication(
      req.tenant.tenantId, req.params.id, req.user
    );
    R.success(res, { application }, 'Application approved');
  } catch (err) { next(err); }
}

async function reject(req, res, next) {
  try {
    const application = await courseApplicationService.rejectApplication(
      req.tenant.tenantId, req.params.id, req.user, req.body
    );
    R.success(res, { application }, 'Application rejected');
  } catch (err) { next(err); }
}

module.exports = { submit, list, approve, reject };
