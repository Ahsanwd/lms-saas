const service = require('./assignmentTemplate.service');
const R = require('../../utils/response');

async function listTemplates(req, res, next) {
  try {
    const templates = await service.listTemplates(req.tenant.tenantId, req.user);
    R.success(res, { templates });
  } catch (err) { next(err); }
}

async function createTemplate(req, res, next) {
  try {
    if (!req.body.title?.trim()) return R.error(res, 'Template title is required', 400);
    const template = await service.createTemplate(req.tenant.tenantId, req.body, req.user);
    R.created(res, { template }, 'Template saved');
  } catch (err) { next(err); }
}

async function createFromAssignment(req, res, next) {
  try {
    const template = await service.createFromAssignment(
      req.tenant.tenantId, req.params.assignmentId, req.user
    );
    R.created(res, { template }, 'Template saved from assignment');
  } catch (err) { next(err); }
}

async function deleteTemplate(req, res, next) {
  try {
    await service.deleteTemplate(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, {}, 'Template deleted');
  } catch (err) { next(err); }
}

module.exports = { listTemplates, createTemplate, createFromAssignment, deleteTemplate };
