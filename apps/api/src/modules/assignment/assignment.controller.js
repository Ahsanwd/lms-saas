const assignmentService = require('./assignment.service');
const { validateCreateAssignment } = require('../../validators/assignment.validator');
const { getPublicUrl } = require('../../services/storage/storage.service');
const R = require('../../utils/response');

// ─── Assignments ──────────────────────────────────────────────────────────────

async function listAssignments(req, res, next) {
  try {
    const result = await assignmentService.listAssignments(req.tenant.tenantId, req.user, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getAssignment(req, res, next) {
  try {
    const assignment = await assignmentService.getAssignment(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { assignment });
  } catch (err) { next(err); }
}

function parseRubric(body) {
  if (typeof body.rubric === 'string') {
    try { body.rubric = JSON.parse(body.rubric); } catch (_) { body.rubric = []; }
  }
  if (typeof body.allowedFileTypes === 'string') {
    try { body.allowedFileTypes = JSON.parse(body.allowedFileTypes); } catch (_) { body.allowedFileTypes = []; }
  }
}

async function createAssignment(req, res, next) {
  try {
    parseRubric(req.body);
    validateCreateAssignment(req.body);
    if (req.file) req.body.attachmentUrl = getPublicUrl(req.file.path);
    const assignment = await assignmentService.createAssignment(req.tenant.tenantId, req.body, req.user);
    R.created(res, { assignment }, 'Assignment created');
  } catch (err) { next(err); }
}

async function updateAssignment(req, res, next) {
  try {
    parseRubric(req.body);
    if (req.file) req.body.attachmentUrl = getPublicUrl(req.file.path);
    const assignment = await assignmentService.updateAssignment(req.tenant.tenantId, req.params.id, req.body, req.user);
    R.success(res, { assignment }, 'Assignment updated');
  } catch (err) { next(err); }
}

async function publishAssignment(req, res, next) {
  try {
    const assignment = await assignmentService.publishAssignment(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { assignment }, `Assignment ${assignment.status}`);
  } catch (err) { next(err); }
}

async function archiveAssignment(req, res, next) {
  try {
    const assignment = await assignmentService.archiveAssignment(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { assignment }, 'Assignment archived');
  } catch (err) { next(err); }
}

async function deleteAssignment(req, res, next) {
  try {
    await assignmentService.deleteAssignment(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, {}, 'Assignment deleted');
  } catch (err) { next(err); }
}

// ─── Submissions ──────────────────────────────────────────────────────────────

async function listSubmissions(req, res, next) {
  try {
    const result = await assignmentService.listSubmissions(
      req.tenant.tenantId, req.params.id, req.user, req.query
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function submitAssignment(req, res, next) {
  try {
    let file = null;
    if (req.file) {
      file = { url: getPublicUrl(req.file.path), originalName: req.file.originalname };
    }
    const submission = await assignmentService.submitAssignment(
      req.tenant.tenantId, req.params.id, req.body, req.user, file
    );
    R.success(res, { submission }, 'Assignment submitted');
  } catch (err) { next(err); }
}

async function getMySubmission(req, res, next) {
  try {
    const result = await assignmentService.getMySubmission(
      req.tenant.tenantId, req.params.id, req.user
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function gradeSubmission(req, res, next) {
  try {
    const submission = await assignmentService.gradeSubmission(
      req.tenant.tenantId, req.params.submissionId, req.body, req.user
    );
    R.success(res, { submission }, 'Submission graded');
  } catch (err) { next(err); }
}

async function getNotSubmitted(req, res, next) {
  try {
    const result = await assignmentService.getNotSubmitted(
      req.tenant.tenantId, req.params.id, req.user
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getMySubmissions(req, res, next) {
  try {
    const { assignmentIds } = req.query;
    if (!assignmentIds) return R.success(res, {});
    const map = await assignmentService.getMySubmissions(
      req.tenant.tenantId, req.user.sub, assignmentIds
    );
    R.success(res, map);
  } catch (err) { next(err); }
}

async function grantExtension(req, res, next) {
  try {
    const { studentId, extendedDueDate, note } = req.body;
    if (!studentId) return R.error(res, 'studentId is required', 400);
    const assignment = await assignmentService.grantExtension(
      req.tenant.tenantId, req.params.id, studentId, extendedDueDate, note, req.user
    );
    R.success(res, { assignment }, 'Extension granted');
  } catch (err) { next(err); }
}

async function revokeExtension(req, res, next) {
  try {
    const assignment = await assignmentService.revokeExtension(
      req.tenant.tenantId, req.params.id, req.params.studentId, req.user
    );
    R.success(res, { assignment }, 'Extension revoked');
  } catch (err) { next(err); }
}

async function addComment(req, res, next) {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return R.error(res, 'Comment text is required', 400);
    const submission = await assignmentService.addComment(
      req.tenant.tenantId, req.params.id, req.params.submissionId, text, req.user
    );
    R.success(res, { submission }, 'Comment added');
  } catch (err) { next(err); }
}

module.exports = {
  listAssignments, getAssignment, createAssignment, updateAssignment,
  publishAssignment, archiveAssignment, deleteAssignment,
  listSubmissions, submitAssignment, getMySubmission, gradeSubmission,
  getNotSubmitted, getMySubmissions, addComment,
  grantExtension, revokeExtension,
};
