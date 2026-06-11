const quizService = require('./quiz.service');
const {
  validateCreateQuestion, validateCreateQuiz,
  validateSetQuestions, validateSubmitAnswers, validateGradeAnswers,
} = require('../../validators/quiz.validator');
const R = require('../../utils/response');

// ── Question Bank ─────────────────────────────────────────────────────────────
async function listQuestions(req, res, next) {
  try {
    const result = await quizService.listQuestions(req.tenant.tenantId, req.user, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function createQuestion(req, res, next) {
  try {
    validateCreateQuestion(req.body);
    const question = await quizService.createQuestion(req.tenant.tenantId, req.body, req.user);
    R.created(res, { question });
  } catch (err) { next(err); }
}

async function updateQuestion(req, res, next) {
  try {
    const question = await quizService.updateQuestion(
      req.tenant.tenantId, req.params.id, req.body, req.user
    );
    R.success(res, { question }, 'Question updated');
  } catch (err) { next(err); }
}

async function deleteQuestion(req, res, next) {
  try {
    await quizService.deleteQuestion(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, {}, 'Question deleted');
  } catch (err) { next(err); }
}

async function bulkImportQuestions(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'CSV file required', 400);
    const result = await quizService.bulkImportQuestions(req.tenant.tenantId, req.file.buffer, req.user);
    R.created(res, result, `Imported ${result.imported} question(s)`);
  } catch (err) { next(err); }
}

// ── Quizzes ───────────────────────────────────────────────────────────────────
async function listQuizzes(req, res, next) {
  try {
    const result = await quizService.listQuizzes(req.tenant.tenantId, req.user, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getQuiz(req, res, next) {
  try {
    const quiz = await quizService.getQuiz(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { quiz });
  } catch (err) { next(err); }
}

async function createQuiz(req, res, next) {
  try {
    validateCreateQuiz(req.body);
    const quiz = await quizService.createQuiz(req.tenant.tenantId, req.body, req.user);
    R.created(res, { quiz }, 'Quiz created');
  } catch (err) { next(err); }
}

async function updateQuiz(req, res, next) {
  try {
    const quiz = await quizService.updateQuiz(req.tenant.tenantId, req.params.id, req.body, req.user);
    R.success(res, { quiz }, 'Quiz updated');
  } catch (err) { next(err); }
}

async function setQuestions(req, res, next) {
  try {
    validateSetQuestions(req.body.questions);
    const quiz = await quizService.setQuizQuestions(
      req.tenant.tenantId, req.params.id, req.body.questions, req.user
    );
    R.success(res, { quiz }, 'Questions updated');
  } catch (err) { next(err); }
}

async function publishQuiz(req, res, next) {
  try {
    const quiz = await quizService.publishQuiz(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { quiz }, 'Quiz published');
  } catch (err) { next(err); }
}

async function archiveQuiz(req, res, next) {
  try {
    const quiz = await quizService.archiveQuiz(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { quiz }, 'Quiz archived');
  } catch (err) { next(err); }
}

async function deleteQuiz(req, res, next) {
  try {
    await quizService.deleteQuiz(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, {}, 'Quiz deleted');
  } catch (err) { next(err); }
}

// ── Attempts ──────────────────────────────────────────────────────────────────
async function startAttempt(req, res, next) {
  try {
    const attempt = await quizService.startAttempt(req.tenant.tenantId, req.params.id, req.user);
    R.created(res, { attempt }, 'Attempt started');
  } catch (err) { next(err); }
}

async function submitAttempt(req, res, next) {
  try {
    const { attemptId, answers } = req.body;
    if (!attemptId) return R.error(res, 'attemptId is required', 400);
    validateSubmitAnswers(answers);
    const attempt = await quizService.submitAttempt(
      req.tenant.tenantId, req.params.id, attemptId, answers, req.user
    );
    R.success(res, { attempt }, 'Quiz submitted');
  } catch (err) { next(err); }
}

async function gradeAttempt(req, res, next) {
  try {
    validateGradeAnswers(req.body.grades);
    const attempt = await quizService.gradeEssayAnswers(
      req.tenant.tenantId, req.params.attemptId, req.body.grades, req.user
    );
    R.success(res, { attempt }, 'Grading complete');
  } catch (err) { next(err); }
}

async function myAttempts(req, res, next) {
  try {
    const attempts = await quizService.getMyAttempts(
      req.tenant.tenantId, req.params.id, req.user.sub
    );
    R.success(res, { attempts });
  } catch (err) { next(err); }
}

async function allAttempts(req, res, next) {
  try {
    const result = await quizService.getAllAttempts(
      req.tenant.tenantId, req.params.id, req.user, req.query
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getAnalytics(req, res, next) {
  try {
    const data = await quizService.getQuizAnalytics(
      req.tenant.tenantId, req.params.id, req.user
    );
    R.success(res, data);
  } catch (err) { next(err); }
}

async function duplicateQuiz(req, res, next) {
  try {
    const quiz = await quizService.duplicateQuiz(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { quiz }, 'Quiz duplicated', 201);
  } catch (err) { next(err); }
}

async function getAttemptDetail(req, res, next) {
  try {
    const attempt = await quizService.getAttemptDetail(
      req.tenant.tenantId, req.params.id, req.params.attemptId, req.user
    );
    R.success(res, { attempt });
  } catch (err) { next(err); }
}

module.exports = {
  listQuestions, createQuestion, updateQuestion, deleteQuestion,
  bulkImportQuestions,
  listQuizzes, getQuiz, createQuiz, updateQuiz, setQuestions,
  publishQuiz, archiveQuiz, deleteQuiz,
  duplicateQuiz,
  startAttempt, submitAttempt, gradeAttempt,
  myAttempts, allAttempts, getAttemptDetail, getAnalytics,
};
