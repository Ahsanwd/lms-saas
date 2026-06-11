const AppError = require('../utils/AppError');

const LEVELS = ['beginner', 'intermediate', 'advanced', 'all'];
const LESSON_TYPES = ['video', 'text', 'file', 'quiz', 'audio', 'live'];
const DISPLAY_LAYOUTS = ['classic', 'hero', 'minimal'];

function validateCreateCourse({ title, level }) {
  if (!title?.trim()) throw new AppError('Course title is required', 400);
  if (level && !LEVELS.includes(level))
    throw new AppError(`Level must be one of: ${LEVELS.join(', ')}`, 400);
}

function validateUpdateCourse({ title, level, price, displayLayout }) {
  if (title !== undefined && !title?.trim())
    throw new AppError('Title cannot be empty', 400);
  if (level && !LEVELS.includes(level))
    throw new AppError(`Level must be one of: ${LEVELS.join(', ')}`, 400);
  if (price !== undefined && (isNaN(price) || price < 0))
    throw new AppError('Price must be a non-negative number', 400);
  if (displayLayout && !DISPLAY_LAYOUTS.includes(displayLayout))
    throw new AppError(`displayLayout must be one of: ${DISPLAY_LAYOUTS.join(', ')}`, 400);
}

function validateCreateSection({ title }) {
  if (!title?.trim()) throw new AppError('Section title is required', 400);
}

function validateCreateLesson({ title, type }) {
  if (!title?.trim()) throw new AppError('Lesson title is required', 400);
  if (!type || !LESSON_TYPES.includes(type))
    throw new AppError(`Lesson type must be one of: ${LESSON_TYPES.join(', ')}`, 400);
}

function validateReorder(items) {
  if (!Array.isArray(items) || items.length === 0)
    throw new AppError('items must be a non-empty array', 400);
  for (const item of items) {
    if (!item.id) throw new AppError('Each item must have an id', 400);
    if (typeof item.order !== 'number') throw new AppError('Each item must have a numeric order', 400);
  }
}

function validateCreateCategory({ name }) {
  if (!name?.trim()) throw new AppError('Category name is required', 400);
}

module.exports = {
  validateCreateCourse,
  validateUpdateCourse,
  validateCreateSection,
  validateCreateLesson,
  validateReorder,
  validateCreateCategory,
};
