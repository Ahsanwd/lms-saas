const CourseBookmark = require('../../database/models/CourseBookmark.model');
const AppError       = require('../../utils/AppError');

async function addBookmark(tenantId, userId, courseId) {
  try {
    await CourseBookmark.create({ tenantId, userId, courseId });
  } catch (err) {
    if (err.code === 11000) throw new AppError('Already bookmarked', 409, 'ALREADY_BOOKMARKED');
    throw err;
  }
}

async function removeBookmark(tenantId, userId, courseId) {
  const result = await CourseBookmark.deleteOne({ tenantId, userId, courseId });
  if (result.deletedCount === 0) throw new AppError('Bookmark not found', 404);
}

async function getBookmarks(tenantId, userId) {
  return CourseBookmark.find({ tenantId, userId })
    .sort({ createdAt: -1 })
    .populate('courseId', 'title thumbnail price isFree enrollmentCount status level instructorId')
    .lean();
}

async function isBookmarked(tenantId, userId, courseId) {
  const exists = await CourseBookmark.exists({ tenantId, userId, courseId });
  return !!exists;
}

// Returns a set of bookmarked courseIds for a user — used for bulk checks
async function getBookmarkedIds(tenantId, userId) {
  const bookmarks = await CourseBookmark.find({ tenantId, userId }).select('courseId').lean();
  return new Set(bookmarks.map(b => b.courseId.toString()));
}

module.exports = { addBookmark, removeBookmark, getBookmarks, isBookmarked, getBookmarkedIds };
