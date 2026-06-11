const router = require('express').Router();
const ctrl = require('./assignment.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const { upload } = require('../../services/storage/storage.service');

router.use(authenticate);

const uploadAttachment = upload('attachment').single('attachment');

// ── Static routes BEFORE /:id ─────────────────────────────────────────────────
// Bulk submission status for current student across multiple assignments
router.get('/my-submissions', requirePermission('assignment:read'), ctrl.getMySubmissions);

// ── Assignments ───────────────────────────────────────────────────────────────
router.get('/',     requirePermission('assignment:read'),   ctrl.listAssignments);
router.post('/',    requirePermission('assignment:create'), uploadAttachment, ctrl.createAssignment);
router.get('/:id',  requirePermission('assignment:read'),   ctrl.getAssignment);
router.patch('/:id',requirePermission('assignment:update'), uploadAttachment, ctrl.updateAssignment);
router.delete('/:id',requirePermission('assignment:delete'),ctrl.deleteAssignment);

router.patch('/:id/publish', requirePermission('assignment:manage'), ctrl.publishAssignment);
router.patch('/:id/archive', requirePermission('assignment:manage'), ctrl.archiveAssignment);

// ── Submissions ───────────────────────────────────────────────────────────────
router.get('/:id/submissions',     requirePermission('assignment:manage'), ctrl.listSubmissions);
router.get('/:id/not-submitted',   requirePermission('assignment:manage'), ctrl.getNotSubmitted);
router.post('/:id/submit',         requirePermission('assignment:read'),   upload('attachment').single('file'), ctrl.submitAssignment);
router.get('/:id/my-submission',   requirePermission('assignment:read'),   ctrl.getMySubmission);
router.patch('/:id/submissions/:submissionId/grade', requirePermission('assignment:manage'), ctrl.gradeSubmission);
router.post('/:id/submissions/:submissionId/comments', requirePermission('assignment:read'), ctrl.addComment);

// ── Deadline Extensions ───────────────────────────────────────────────────────
router.post('/:id/extensions',              requirePermission('assignment:manage'), ctrl.grantExtension);
router.delete('/:id/extensions/:studentId', requirePermission('assignment:manage'), ctrl.revokeExtension);

module.exports = router;
