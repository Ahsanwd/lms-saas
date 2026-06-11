const svc = require('./stripeConnect.service');
const R   = require('../../utils/response');

async function getAuthUrl(req, res, next) {
  try {
    const url = svc.getAuthUrl(req.tenant.tenantId, req.user.sub);
    R.success(res, { url });
  } catch (err) { next(err); }
}

async function exchangeToken(req, res, next) {
  try {
    const { code, state } = req.body;
    if (!code || !state) return R.error(res, 'code and state are required', 400);
    const result = await svc.exchangeToken(code, state, req.user.sub);
    R.success(res, result, 'Stripe account connected successfully');
  } catch (err) { next(err); }
}

async function getStatus(req, res, next) {
  try {
    const status = await svc.getStatus(req.tenant.tenantId);
    R.success(res, { connect: status });
  } catch (err) { next(err); }
}

async function disconnect(req, res, next) {
  try {
    await svc.disconnect(req.tenant.tenantId);
    R.success(res, {}, 'Stripe account disconnected');
  } catch (err) { next(err); }
}

module.exports = { getAuthUrl, exchangeToken, getStatus, disconnect };
