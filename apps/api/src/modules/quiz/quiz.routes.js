const router = require('express').Router();
const ctrl = require('./quiz.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const multer = require('multer');

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, f.mimetype === 'text/csv' || f.originalname.endsWith('.csv')),
});

router.use(authenticate);

// ── Question Bank ─────────────────────────────────────────────────────────────
router.get('/questions', requirePermission('quiz:read'), ctrl.listQuestions);
router.post('/questions', requirePermission('quiz:create'), ctrl.createQuestion);
router.post('/questions/bulk-import', requirePermission('quiz:create'), csvUpload.single('file'), ctrl.bulkImportQuestions);
router.patch('/questions/:id', requirePermission('quiz:update'), ctrl.updateQuestion);
router.delete('/questions/:id', requirePermission('quiz:delete'), ctrl.deleteQuestion);

// ── Quizzes ───────────────────────────────────────────────────────────────────
router.get('/', requirePermission('quiz:read'), ctrl.listQuizzes);
router.post('/', requirePermission('quiz:create'), ctrl.createQuiz);
router.get('/:id', requirePermission('quiz:read'), ctrl.getQuiz);
router.patch('/:id', requirePermission('quiz:update'), ctrl.updateQuiz);
router.delete('/:id', requirePermission('quiz:delete'), ctrl.deleteQuiz);

router.put('/:id/questions', requirePermission('quiz:update'), ctrl.setQuestions);
router.post('/:id/duplicate', requirePermission('quiz:create'), ctrl.duplicateQuiz);
router.patch('/:id/publish', requirePermission('quiz:manage'), ctrl.publishQuiz);
router.patch('/:id/archive', requirePermission('quiz:manage'), ctrl.archiveQuiz);

// ── Attempts ──────────────────────────────────────────────────────────────────
router.post('/:id/attempt', requirePermission('quiz:read'), ctrl.startAttempt);
router.post('/:id/attempt/submit', requirePermission('quiz:read'), ctrl.submitAttempt);
router.get('/:id/attempts/my', ctrl.myAttempts);
router.get('/:id/attempts', requirePermission('quiz:manage'), ctrl.allAttempts);
router.get('/:id/attempts/:attemptId', requirePermission('quiz:manage'), ctrl.getAttemptDetail);
router.patch('/:id/attempts/:attemptId/grade', requirePermission('quiz:manage'), ctrl.gradeAttempt);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/:id/analytics', requirePermission('analytics:read'), ctrl.getAnalytics);

module.exports = router;
