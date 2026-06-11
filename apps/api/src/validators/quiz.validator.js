const AppError = require('../utils/AppError');

const QUESTION_TYPES = [
  'multiple_choice', 'multiple_select', 'true_false',
  'fill_blank', 'short_answer', 'essay',
  'matching', 'ordering', 'image',
];

function validateCreateQuestion({ type, text }) {
  if (!text?.trim()) throw new AppError('Question text is required', 400);
  if (!type || !QUESTION_TYPES.includes(type))
    throw new AppError(`Type must be one of: ${QUESTION_TYPES.join(', ')}`, 400);
}

function validateCreateQuiz({ title }) {
  if (!title?.trim()) throw new AppError('Quiz title is required', 400);
}

function validateSetQuestions(items) {
  if (!Array.isArray(items) || items.length === 0)
    throw new AppError('Questions array is required', 400);
  for (const item of items) {
    if (!item.questionId) throw new AppError('Each question must have a questionId', 400);
  }
}

function validateSubmitAnswers(answers) {
  if (!Array.isArray(answers) || answers.length === 0)
    throw new AppError('Answers array is required', 400);
  for (const a of answers) {
    if (!a.questionId) throw new AppError('Each answer must have a questionId', 400);
  }
}

function validateGradeAnswers(grades) {
  if (!Array.isArray(grades) || grades.length === 0)
    throw new AppError('Grades array is required', 400);
  for (const g of grades) {
    if (!g.questionId) throw new AppError('Each grade must have a questionId', 400);
    if (g.pointsAwarded === undefined || isNaN(g.pointsAwarded))
      throw new AppError('Each grade must have pointsAwarded', 400);
  }
}

module.exports = {
  validateCreateQuestion, validateCreateQuiz,
  validateSetQuestions, validateSubmitAnswers, validateGradeAnswers,
};
