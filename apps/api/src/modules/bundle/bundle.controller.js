const bundleService = require('./bundle.service');
const R = require('../../utils/response');

async function listPublic(req, res, next) {
  try {
    const bundles = await bundleService.listPublicBundles(req.tenant.tenantId);
    R.success(res, { bundles });
  } catch (err) { next(err); }
}

async function listAdmin(req, res, next) {
  try {
    const result = await bundleService.listBundles(req.tenant.tenantId, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const bundle = await bundleService.getBundle(req.tenant.tenantId, req.params.bundleId);
    R.success(res, { bundle });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const bundle = await bundleService.createBundle(req.tenant.tenantId, req.body, req.user);
    R.created(res, { bundle }, 'Bundle created');
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const bundle = await bundleService.updateBundle(req.tenant.tenantId, req.params.bundleId, req.body, req.user);
    R.success(res, { bundle }, 'Bundle updated');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await bundleService.deleteBundle(req.tenant.tenantId, req.params.bundleId, req.user);
    R.success(res, {}, 'Bundle deleted');
  } catch (err) { next(err); }
}

module.exports = { listPublic, listAdmin, getOne, create, update, remove };
