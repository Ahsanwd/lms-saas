const contactSubmissionService = require('./contactSubmission.service');
const { verifyRecaptcha } = require('../../utils/recaptcha');
const R = require('../../utils/response');

// Public — no auth. Guarded by contactFormLimiter + reCAPTCHA at the route level.
async function submit(req, res, next) {
  try {
    if (!req.tenant) return R.error(res, 'Tenant not found', 404);
    await verifyRecaptcha(req.body.recaptchaToken);
    const submission = await contactSubmissionService.submit(
      req.tenant.tenantId,
      req.body.pageId,
      req.body,
      { ip: req.ip }
    );
    R.success(res, { id: submission._id }, 'Message sent');
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const [submissions, total] = await contactSubmissionService.listSubmissions(req.tenant.tenantId, req.query);
    R.success(res, { submissions, total, page: Number(req.query.page) || 1 });
  } catch (err) { next(err); }
}

async function updateStatus(req, res, next) {
  try {
    const submission = await contactSubmissionService.markStatus(req.tenant.tenantId, req.params.id, req.body.status);
    R.success(res, { submission }, 'Updated');
  } catch (err) { next(err); }
}

module.exports = { submit, list, updateStatus };
