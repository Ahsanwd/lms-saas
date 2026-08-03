const websiteDesignService = require('./websiteDesign.service');
const AppError = require('../../utils/AppError');
const R = require('../../utils/response');

async function listDesigns(req, res, next) {
  try {
    const designs = await websiteDesignService.listDesigns();
    R.success(res, { designs });
  } catch (err) { next(err); }
}

async function applyDesign(req, res, next) {
  try {
    const design = await websiteDesignService.getDesignById(req.params.id);
    if (!design) throw new AppError('Design not found', 404);
    await websiteDesignService.applyDesignToTenant(req.tenant.tenantId, design);
    R.success(res, {}, 'Website replaced successfully');
  } catch (err) { next(err); }
}

module.exports = {
  listDesigns,
  applyDesign,
};
