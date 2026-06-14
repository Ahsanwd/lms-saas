const questionRepo = require('../../database/repositories/question.repository');
const quizRepo = require('../../database/repositories/quiz.repository');
const quizAttemptRepo = require('../../database/repositories/quizAttempt.repository');
const enrollmentRepo = require('../../database/repositories/enrollment.repository');
const { gradeAttempt } = require('./grading.engine');
const AppError = require('../../utils/AppError');

function canManageQuiz(quiz, user) {
  if (['tenant_admin', 'super_admin'].includes(user.role)) return true;
  return quiz.instructorId?._id?.toString() === user.sub ||
    quiz.instructorId?.toString() === user.sub;
}

// ─── Question Bank ────────────────────────────────────────────────────────────
async function listQuestions(tenantId, user, query) {
  const { type, difficulty, courseId, tags, search, page, limit } = query;
  const filter = {};

  if (user.role === 'instructor') filter.instructorId = user.sub;
  if (type) filter.type = type;
  if (difficulty) filter.difficulty = difficulty;
  if (courseId) filter.courseId = courseId;
  if (tags) filter.tags = { $in: tags.split(',') };
  if (search) filter.text = { $regex: search, $options: 'i' };

  const [questions, total] = await questionRepo.findAll(tenantId, filter, { page, limit });
  return { questions, pagination: { total, page: Number(page || 1), limit: Number(limit || 20) } };
}

async function createQuestion(tenantId, data, user) {
  return questionRepo.create({
    tenantId,
    instructorId: user.sub,
    courseId: data.courseId || null,
    type: data.type,
    text: data.text,
    imageUrl: data.imageUrl || null,
    options: data.options || [],
    matchingPairs: data.matchingPairs || [],
    correctAnswer: data.correctAnswer || null,
    correctOrder: data.correctOrder || [],
    explanation: data.explanation || null,
    points: data.points || 1,
    negativePoints: data.negativePoints || 0,
    difficulty: data.difficulty || 'medium',
    tags: data.tags || [],
    isPublic: data.isPublic || false,
    timeLimitSeconds: data.timeLimitSeconds || 0,
    createdBy: user.sub,
  });
}

async function updateQuestion(tenantId, id, data, user) {
  const question = await questionRepo.findById(tenantId, id);
  if (!question) throw new AppError('Question not found', 404);
  if (user.role === 'instructor' && question.instructorId.toString() !== user.sub)
    throw new AppError('Forbidden', 403);

  const fields = ['text', 'imageUrl', 'options', 'matchingPairs', 'correctAnswer',
    'correctOrder', 'explanation', 'points', 'negativePoints', 'difficulty', 'tags', 'isPublic',
    'timeLimitSeconds'];
  const update = { updatedBy: user.sub };
  for (const f of fields) { if (data[f] !== undefined) update[f] = data[f]; }

  return questionRepo.updateById(tenantId, id, update);
}

async function deleteQuestion(tenantId, id, user) {
  const question = await questionRepo.findById(tenantId, id);
  if (!question) throw new AppError('Question not found', 404);
  if (user.role === 'instructor' && question.instructorId.toString() !== user.sub)
    throw new AppError('Forbidden', 403);
  return questionRepo.softDelete(tenantId, id, user.sub);
}

// ─── Quiz CRUD ────────────────────────────────────────────────────────────────
async function listQuizzes(tenantId, user, query) {
  const { courseId, lessonId, status, page, limit } = query;
  const filter = {};
  if (user.role === 'student') filter.status = 'published';
  if (courseId) filter.courseId = courseId;
  if (lessonId) filter.lessonId = lessonId;
  if (status && user.role !== 'student') filter.status = status;
  if (user.role === 'instructor') filter.instructorId = user.sub;

  const [quizzes, total] = await quizRepo.findAll(tenantId, filter, { page, limit });
  return { quizzes, pagination: { total, page: Number(page || 1), limit: Number(limit || 20) } };
}

async function getQuiz(tenantId, id, user) {
  const quiz = await quizRepo.findById(tenantId, id);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (quiz.status !== 'published' && !canManageQuiz(quiz, user))
    throw new AppError('Quiz not found', 404);

  // Hide correct answers from students unless showCorrectAnswers is enabled
  if (user.role === 'student' && !quiz.settings.showCorrectAnswers) {
    quiz.questions.forEach(q => {
      if (q.questionId) {
        q.questionId.options?.forEach(o => { o.isCorrect = undefined; });
        q.questionId.correctAnswer = undefined;
        if (q.questionId.type === 'ordering') {
          // Shuffle items so student sees them in random order (not the correct sequence)
          const items = [...(q.questionId.correctOrder || [])];
          for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
          }
          q.questionId.correctOrder = items;
        } else {
          q.questionId.correctOrder = undefined;
        }
      }
    });
  }
  return quiz;
}

async function createQuiz(tenantId, data, user) {
  const hasEssay = false; // determined when questions are added
  const quiz = await quizRepo.create({
    tenantId,
    courseId: data.courseId || null,
    lessonId: data.lessonId || null,
    instructorId: user.sub,
    title: data.title.trim(),
    description: data.description || null,
    instructions: data.instructions || null,
    settings: {
      timer: data.timer || { enabled: false, durationMinutes: 30 },
      maxAttempts: data.maxAttempts ?? 1,
      passingScore: data.passingScore ?? 70,
      negativeMarking: data.negativeMarking ?? false,
      shuffleQuestions: data.shuffleQuestions ?? false,
      shuffleOptions: data.shuffleOptions ?? false,
      showCorrectAnswers: data.showCorrectAnswers ?? false,
      showExplanations: data.showExplanations ?? false,
      allowRetake: data.allowRetake ?? true,
      triggerCertificate: data.triggerCertificate ?? false,
    },
    randomConfig: data.randomConfig || { enabled: false, count: 10 },
    gradingType: 'auto',
    createdBy: user.sub,
  });
  return quiz;
}

async function updateQuiz(tenantId, id, data, user) {
  const quiz = await quizRepo.findById(tenantId, id);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (!canManageQuiz(quiz, user)) throw new AppError('Forbidden', 403);
  if (quiz.status === 'archived') throw new AppError('Cannot edit archived quiz', 400);

  const update = { updatedBy: user.sub };
  const fields = ['title', 'description', 'instructions', 'randomConfig', 'courseId', 'lessonId'];
  for (const f of fields) { if (data[f] !== undefined) update[f] = data[f] || null; }

  const settingFields = ['maxAttempts', 'passingScore', 'negativeMarking',
    'shuffleQuestions', 'shuffleOptions', 'showCorrectAnswers', 'showExplanations', 'allowRetake',
    'triggerCertificate'];
  for (const f of settingFields) {
    if (data[f] !== undefined) update[`settings.${f}`] = data[f];
  }
  if (data.timer) update['settings.timer'] = data.timer;

  return quizRepo.updateById(tenantId, id, update);
}

async function setQuizQuestions(tenantId, quizId, questionItems, user) {
  const quiz = await quizRepo.findById(tenantId, quizId);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (!canManageQuiz(quiz, user)) throw new AppError('Forbidden', 403);

  // Validate all question IDs exist
  const ids = questionItems.map(q => q.questionId);
  const questions = await questionRepo.findManyByIds(tenantId, ids);
  if (questions.length !== ids.length) throw new AppError('One or more questions not found', 404);

  const hasEssay = questions.some(q => q.type === 'essay');
  const hasOther = questions.some(q => q.type !== 'essay');
  const gradingType = hasEssay && hasOther ? 'mixed' : hasEssay ? 'manual' : 'auto';

  const totalPoints = questionItems.reduce((sum, item, i) => {
    const q = questions.find(q => q._id.toString() === item.questionId);
    return sum + (item.points ?? q?.points ?? 1);
  }, 0);

  const quizQuestions = questionItems.map((item, i) => ({
    questionId: item.questionId,
    order: item.order ?? i,
    points: item.points ?? null,
    negativePoints: item.negativePoints ?? null,
  }));

  return quizRepo.updateById(tenantId, quizId, {
    questions: quizQuestions,
    totalQuestions: quizQuestions.length,
    totalPoints,
    gradingType,
    updatedBy: user.sub,
  });
}

async function publishQuiz(tenantId, id, user) {
  const quiz = await quizRepo.findById(tenantId, id);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (!canManageQuiz(quiz, user)) throw new AppError('Forbidden', 403);
  if (quiz.status === 'published') throw new AppError('Already published', 400);
  if (!quiz.randomConfig?.enabled && quiz.questions.length === 0)
    throw new AppError('Cannot publish quiz with no questions', 400);
  return quizRepo.updateById(tenantId, id, { status: 'published', updatedBy: user.sub });
}

async function archiveQuiz(tenantId, id, user) {
  const quiz = await quizRepo.findById(tenantId, id);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (!canManageQuiz(quiz, user)) throw new AppError('Forbidden', 403);
  return quizRepo.updateById(tenantId, id, { status: 'archived', updatedBy: user.sub });
}

async function deleteQuiz(tenantId, id, user) {
  const quiz = await quizRepo.findById(tenantId, id);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (!canManageQuiz(quiz, user)) throw new AppError('Forbidden', 403);
  if (quiz.attemptCount > 0) throw new AppError('Cannot delete quiz with existing attempts', 400);
  return quizRepo.softDelete(tenantId, id, user.sub);
}

// ─── Attempts ─────────────────────────────────────────────────────────────────
async function startAttempt(tenantId, quizId, user) {
  const quiz = await quizRepo.findById(tenantId, quizId);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (quiz.status !== 'published') throw new AppError('Quiz is not available', 400);

  // Check enrollment if quiz belongs to a course
  // Allow both 'active' and 'completed' — completed students still have legitimate access
  if (quiz.courseId) {
    const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, quiz.courseId);
    if (!enrollment || !['active', 'completed'].includes(enrollment.status))
      throw new AppError('You must be enrolled in the course to take this quiz', 403);
  }

  // Check existing in-progress attempt
  const inProgress = await quizAttemptRepo.findInProgress(tenantId, quizId, user.sub);
  if (inProgress) return inProgress;

  // Check max attempts
  if (quiz.settings.maxAttempts > 0) {
    const attemptCount = await quizAttemptRepo.countByUserAndQuiz(tenantId, quizId, user.sub);
    if (attemptCount >= quiz.settings.maxAttempts)
      throw new AppError(`Maximum ${quiz.settings.maxAttempts} attempt(s) allowed`, 400);
  }

  // Resolve questions (random or fixed)
  let servedQuestions = [];
  if (quiz.randomConfig?.enabled) {
    const filter = { tenantId };
    if (quiz.randomConfig.fromCourseId) filter.courseId = quiz.randomConfig.fromCourseId;
    if (quiz.randomConfig.tags?.length) filter.tags = { $in: quiz.randomConfig.tags };
    if (quiz.randomConfig.difficulty !== 'any') filter.difficulty = quiz.randomConfig.difficulty;
    const randomQs = await questionRepo.findForRandom(tenantId, filter, quiz.randomConfig.count);
    servedQuestions = randomQs.map(q => q._id);
  } else {
    servedQuestions = quiz.questions.map(q => q.questionId._id || q.questionId);
  }

  let shuffled = [...servedQuestions];
  if (quiz.settings.shuffleQuestions) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }

  const attemptCount = await quizAttemptRepo.countByUserAndQuiz(tenantId, quizId, user.sub);

  return quizAttemptRepo.create({
    tenantId,
    quizId,
    courseId: quiz.courseId,
    userId: user.sub,
    attemptNumber: attemptCount + 1,
    servedQuestions: shuffled,
    maxScore: quiz.totalPoints,
    startedAt: new Date(),
  });
}

async function submitAttempt(tenantId, quizId, attemptId, answers, user) {
  const attempt = await quizAttemptRepo.findById(tenantId, attemptId);
  if (!attempt) throw new AppError('Attempt not found', 404);
  if (attempt.userId.toString() !== user.sub) throw new AppError('Forbidden', 403);
  if (attempt.status !== 'in_progress') throw new AppError('Attempt already submitted', 400);

  const quiz = await quizRepo.findById(tenantId, quizId);
  const questionIds = attempt.servedQuestions;
  const questions = await questionRepo.findManyByIdsForGrading(tenantId, questionIds);

  // Build answers with maxPoints from quiz question config
  const enrichedAnswers = answers.map(a => {
    const quizQ = quiz.questions.find(q => q.questionId?._id?.toString() === a.questionId || q.questionId?.toString() === a.questionId);
    const question = questions.find(q => q._id.toString() === a.questionId);
    const maxPoints = quizQ?.points ?? question?.points ?? 1;
    const negPoints = quizQ?.negativePoints ?? question?.negativePoints ?? 0;
    return { ...a, maxPoints, negativePoints: negPoints, questionType: question?.type };
  });

  const { gradedAnswers, totalScore, maxScore, hasManual } = gradeAttempt(
    questions, enrichedAnswers, { negativeMarking: quiz.settings.negativeMarking }
  );

  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const passed = percentage >= (quiz.settings.passingScore || 70);
  const timeSpent = Math.round((Date.now() - attempt.startedAt.getTime()) / 1000);

  const status = hasManual ? 'pending_manual' : 'auto_graded';

  const updated = await quizAttemptRepo.updateById(attemptId, {
    answers: gradedAnswers,
    score: totalScore,
    maxScore,
    percentage,
    passed,
    status,
    submittedAt: new Date(),
    timeSpentSeconds: timeSpent,
  });

  // Update quiz analytics counters
  const allAttempts = await quizAttemptRepo.getQuizStats(tenantId, quiz._id);
  if (allAttempts[0]) {
    await quizRepo.updateById(tenantId, quizId, {
      attemptCount: allAttempts[0].totalAttempts,
      averageScore: Math.round(allAttempts[0].avgScore),
    });
  }

  // Issue certificate if quiz is configured to trigger one on pass
  if (passed && !hasManual && quiz.settings.triggerCertificate && quiz.courseId) {
    try {
      const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, quiz.courseId);
      if (enrollment && !enrollment.certificateIssued) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const seg = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const certId = `${seg(4)}-${seg(4)}-${seg(4)}`;
        await enrollmentRepo.updateByUserAndCourse(tenantId, user.sub, quiz.courseId, {
          certificateIssued: true,
          certificateIssuedAt: new Date(),
          certificateId: certId,
        });
        const notifySvc = require('../notification/notification.service');
        const Course = require('../../database/models/Course.model');
        const course = await Course.findById(quiz.courseId).select('title').lean();
        if (course) notifySvc.notifyCertificateIssued(tenantId, user.sub, course.title, quiz.courseId).catch(() => {});
      }
    } catch (_) { /* cert issuance is non-fatal */ }
  }

  return updated;
}

async function gradeEssayAnswers(tenantId, attemptId, grades, user) {
  const attempt = await quizAttemptRepo.findById(tenantId, attemptId);
  if (!attempt) throw new AppError('Attempt not found', 404);
  if (!['pending_manual', 'manually_graded'].includes(attempt.status))
    throw new AppError('Attempt is not pending manual grading', 400);

  // Resolve which submitted grades belong to essay questions only
  const gradedIds = grades.map(g => g.questionId);
  const gradedQuestions = await questionRepo.findManyByIdsForGrading(tenantId, gradedIds);
  const essayIds = new Set(
    gradedQuestions.filter(q => q.type === 'essay').map(q => q._id.toString())
  );

  // grades = [{ questionId, pointsAwarded, feedback }]
  let totalScore = 0;
  const updatedAnswers = attempt.answers.map(answer => {
    const qid = answer.questionId.toString();
    const grade = grades.find(g => g.questionId === qid);
    // Guard: only apply manual grade if question is confirmed essay type
    if (grade && essayIds.has(qid)) {
      return {
        ...answer.toObject(),
        pointsAwarded: grade.pointsAwarded,
        feedback: grade.feedback || null,
        isCorrect: grade.pointsAwarded >= answer.maxPoints,
      };
    }
    return answer.toObject();
  });

  totalScore = updatedAnswers.reduce((s, a) => s + (a.pointsAwarded || 0), 0);
  const maxScore = attempt.maxScore;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const quiz = await quizRepo.findById(tenantId, attempt.quizId);
  const passed = percentage >= (quiz?.settings.passingScore || 70);

  const result = await quizAttemptRepo.updateById(attemptId, {
    answers: updatedAnswers,
    score: totalScore,
    percentage,
    passed,
    status: 'manually_graded',
    gradedAt: new Date(),
    gradedBy: user.sub,
  });

  // Issue certificate on manual grading completion if configured
  if (passed && quiz.settings.triggerCertificate && attempt.courseId) {
    try {
      const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, attempt.userId.toString(), attempt.courseId);
      if (enrollment && !enrollment.certificateIssued) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const seg = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const certId = `${seg(4)}-${seg(4)}-${seg(4)}`;
        await enrollmentRepo.updateByUserAndCourse(tenantId, attempt.userId.toString(), attempt.courseId, {
          certificateIssued: true,
          certificateIssuedAt: new Date(),
          certificateId: certId,
        });
        const notifySvc = require('../notification/notification.service');
        const Course = require('../../database/models/Course.model');
        const course = await Course.findById(attempt.courseId).select('title').lean();
        if (course) notifySvc.notifyCertificateIssued(tenantId, attempt.userId.toString(), course.title, attempt.courseId).catch(() => {});
      }
    } catch (_) { /* cert issuance is non-fatal */ }
  }

  // Notify student their quiz has been manually graded
  setImmediate(() => {
    require('../notification/notification.service')
      .notifyQuizGraded(tenantId, attempt.userId.toString(), quiz.title, totalScore, maxScore, percentage, attempt.quizId.toString(), passed)
      .catch(() => {});
  });

  return result;
}

async function getMyAttempts(tenantId, quizId, userId) {
  return quizAttemptRepo.findByUserAndQuiz(tenantId, quizId, userId);
}

async function getAllAttempts(tenantId, quizId, user, query) {
  const quiz = await quizRepo.findById(tenantId, quizId);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (!canManageQuiz(quiz, user)) throw new AppError('Forbidden', 403);
  const filter = {};
  if (query.status) filter.status = query.status;
  const [attempts, total] = await quizAttemptRepo.findAllByQuiz(tenantId, quizId, filter, query);
  return { attempts, total, quiz: { title: quiz.title } };
}

// ─── Duplicate Quiz ───────────────────────────────────────────────────────────
async function duplicateQuiz(tenantId, id, user) {
  const quiz = await quizRepo.findById(tenantId, id);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (!canManageQuiz(quiz, user)) throw new AppError('Forbidden', 403);

  const settings = quiz.settings.toObject ? quiz.settings.toObject() : { ...quiz.settings };
  const newQuiz = await quizRepo.create({
    tenantId,
    courseId: quiz.courseId || null,
    lessonId: quiz.lessonId || null,
    instructorId: user.sub,
    title: `${quiz.title} (Copy)`,
    description: quiz.description || null,
    instructions: quiz.instructions || null,
    settings,
    randomConfig: quiz.randomConfig?.toObject ? quiz.randomConfig.toObject() : (quiz.randomConfig || { enabled: false, count: 10 }),
    gradingType: quiz.gradingType || 'auto',
    createdBy: user.sub,
  });

  if (quiz.questions?.length > 0) {
    const questionItems = quiz.questions.map(q => ({
      questionId: (q.questionId._id || q.questionId).toString(),
      order: q.order,
    }));
    await setQuizQuestions(tenantId, newQuiz._id.toString(), questionItems, user);
  }

  return newQuiz;
}

// ─── CSV Bulk Import ──────────────────────────────────────────────────────────
// Expected CSV columns (header row required):
//   type,text,option_a,option_b,option_c,option_d,correct,points,difficulty,explanation
// correct: "A"/"B"/"C"/"D" for MCQ, "A,C" for multi-select, "true"/"false" for TF,
//          text for fill_blank, empty for short_answer/essay
async function bulkImportQuestions(tenantId, csvBuffer, user) {
  const lines = csvBuffer.toString('utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new AppError('CSV must have a header row and at least one data row', 400);

  const parseCsvLine = (line) => {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    result.push(cur.trim());
    return result;
  };

  const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const idx = (name) => header.indexOf(name);

  const created = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const get = (name) => (cols[idx(name)] ?? '').trim();

    const type = get('type');
    const text = get('text');
    if (!text) { errors.push(`Row ${i + 1}: empty text, skipped`); continue; }

    const validTypes = ['multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'short_answer', 'essay'];
    if (!validTypes.includes(type)) { errors.push(`Row ${i + 1}: unknown type "${type}", skipped`); continue; }

    const points = parseInt(get('points')) || 1;
    const difficulty = ['easy', 'medium', 'hard'].includes(get('difficulty')) ? get('difficulty') : 'medium';
    const explanation = get('explanation') || null;
    const correctVal = get('correct');

    let options = [];
    let correctAnswer = null;

    if (type === 'multiple_choice' || type === 'multiple_select') {
      const optCols = ['option_a', 'option_b', 'option_c', 'option_d'];
      const optLetters = ['A', 'B', 'C', 'D'];
      const correctLetters = new Set(correctVal.toUpperCase().split(',').map(l => l.trim()));
      options = optCols
        .map((col, ci) => ({ text: get(col), isCorrect: correctLetters.has(optLetters[ci]) }))
        .filter(o => o.text);
      if (options.length < 2) { errors.push(`Row ${i + 1}: MCQ needs at least 2 options, skipped`); continue; }

    } else if (type === 'true_false') {
      const isTrue = correctVal.toLowerCase() === 'true';
      options = [{ text: 'True', isCorrect: isTrue }, { text: 'False', isCorrect: !isTrue }];

    } else if (type === 'fill_blank') {
      correctAnswer = correctVal || null;
    }

    try {
      const q = await questionRepo.create({
        tenantId,
        instructorId: user.sub,
        type, text, options, correctAnswer, explanation, points, difficulty,
        matchingPairs: [], correctOrder: [], tags: [], isPublic: false,
        timeLimitSeconds: 0, createdBy: user.sub,
      });
      created.push(q._id);
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e.message}`);
    }
  }

  return { imported: created.length, skipped: errors.length, errors };
}

// ─── Attempt Detail ───────────────────────────────────────────────────────────
async function getAttemptDetail(tenantId, quizId, attemptId, user) {
  const quiz = await quizRepo.findById(tenantId, quizId);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (!canManageQuiz(quiz, user)) throw new AppError('Forbidden', 403);

  const attempt = await quizAttemptRepo.findByIdWithDetails(tenantId, attemptId);
  if (!attempt || attempt.quizId.toString() !== quizId) throw new AppError('Attempt not found', 404);
  return attempt;
}

// ─── Analytics ────────────────────────────────────────────────────────────────
async function getQuizAnalytics(tenantId, quizId, user) {
  const quiz = await quizRepo.findById(tenantId, quizId);
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (!canManageQuiz(quiz, user)) throw new AppError('Forbidden', 403);

  const [stats, distribution] = await Promise.all([
    quizAttemptRepo.getQuizStats(tenantId, quiz._id),
    quizAttemptRepo.getScoreDistribution(tenantId, quiz._id),
  ]);

  return {
    quiz: { title: quiz.title, totalQuestions: quiz.totalQuestions, totalPoints: quiz.totalPoints },
    stats: stats[0] || { totalAttempts: 0, avgScore: 0, passCount: 0 },
    scoreDistribution: distribution,
    passRate: stats[0]
      ? Math.round((stats[0].passCount / stats[0].totalAttempts) * 100)
      : 0,
  };
}

module.exports = {
  listQuestions, createQuestion, updateQuestion, deleteQuestion,
  bulkImportQuestions,
  listQuizzes, getQuiz, createQuiz, updateQuiz, setQuizQuestions,
  publishQuiz, archiveQuiz, deleteQuiz,
  duplicateQuiz,
  startAttempt, submitAttempt, gradeEssayAnswers,
  getMyAttempts, getAllAttempts, getAttemptDetail,
  getQuizAnalytics,
};
