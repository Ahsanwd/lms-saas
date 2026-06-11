const svc = require('./search.service');
const R   = require('../../utils/response');

async function search(req, res, next) {
  try {
    const result = await svc.globalSearch(req.tenant.tenantId, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

module.exports = { search };
