const AppError = require('../utils/AppError');

function validateCreateAssignment({ title, courseId, totalMarks }) {
  if (!title?.trim())   throw new AppError('Assignment title is required', 400);
  if (!courseId)        throw new AppError('courseId is required', 400);
  if (totalMarks !== undefined && (isNaN(totalMarks) || Number(totalMarks) < 1))
    throw new AppError('totalMarks must be a positive number', 400);
}

function validateGradeSubmission({ marks }, totalMarks) {
  if (marks === undefined || isNaN(marks))
    throw new AppError('marks is required', 400);
  if (Number(marks) < 0)
    throw new AppError('marks cannot be negative', 400);
  if (totalMarks !== undefined && Number(marks) > Number(totalMarks))
    throw new AppError(`marks cannot exceed totalMarks (${totalMarks})`, 400);
}

module.exports = { validateCreateAssignment, validateGradeSubmission };
