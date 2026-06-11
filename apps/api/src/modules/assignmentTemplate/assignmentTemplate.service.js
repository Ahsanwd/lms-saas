const templateRepo  = require('../../database/repositories/assignmentTemplate.repository');
const assignmentRepo = require('../../database/repositories/assignment.repository');
const AppError = require('../../utils/AppError');

async function listTemplates(tenantId, user) {
  const filter = {};
  if (user.role === 'instructor') filter.instructorId = user.sub;
  return templateRepo.findAll(tenantId, filter);
}

async function createTemplate(tenantId, data, user) {
  const rubric = Array.isArray(data.rubric)
    ? data.rubric.filter(r => r.criterion?.trim())
    : [];

  return templateRepo.create({
    tenantId,
    instructorId: user.sub,
    title:        data.title?.trim(),
    description:  data.description  || null,
    instructions: data.instructions || null,
    totalMarks:   Number(data.totalMarks) || 100,
    allowLateSubmission: Boolean(data.allowLateSubmission),
    rubric,
    createdBy: user.sub,
    updatedBy: user.sub,
  });
}

// Convenience: create a template directly from an existing assignment
async function createFromAssignment(tenantId, assignmentId, user) {
  const assignment = await assignmentRepo.findById(tenantId, assignmentId);
  if (!assignment) throw new AppError('Assignment not found', 404);

  // Only the instructor who owns it or an admin can save as template
  const isAdmin = ['tenant_admin', 'super_admin'].includes(user.role);
  const instructorId = assignment.instructorId?._id?.toString() ?? assignment.instructorId?.toString();
  if (!isAdmin && instructorId !== user.sub)
    throw new AppError('Forbidden', 403);

  return templateRepo.create({
    tenantId,
    instructorId: user.sub,
    title:        assignment.title,
    description:  assignment.description  || null,
    instructions: assignment.instructions || null,
    totalMarks:   assignment.totalMarks,
    allowLateSubmission: assignment.allowLateSubmission,
    rubric:       assignment.rubric ?? [],
    createdBy:    user.sub,
    updatedBy:    user.sub,
  });
}

async function deleteTemplate(tenantId, id, user) {
  const template = await templateRepo.findById(tenantId, id);
  if (!template) throw new AppError('Template not found', 404);

  const isAdmin = ['tenant_admin', 'super_admin'].includes(user.role);
  if (!isAdmin && template.instructorId?.toString() !== user.sub)
    throw new AppError('Forbidden', 403);

  return templateRepo.softDelete(tenantId, id, user.sub);
}

module.exports = { listTemplates, createTemplate, createFromAssignment, deleteTemplate };
