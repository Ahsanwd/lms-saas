const CourseBookmark = require('../../database/models/CourseBookmark.model');
const Course         = require('../../database/models/Course.model');
const AppError       = require('../../utils/AppError');

async function addBookmark(tenantId, userId, courseId) {
  // No existence/tenant check here at all before -- courseId went straight
  // into CourseBookmark.create() untouched, so a student could bookmark a
  // completely different tenant's course. Confirmed live: bookmarked
  // another real tenant's course, and listing bookmarks populated and
  // returned that other tenant's title/price/instructorId/enrollmentCount
  // in full -- a real cross-tenant leak, and an oracle for enumerating
  // courseIds platform-wide via repeated bookmark+list calls.
  const course = await Course.findOne({ _id: courseId, tenantId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404);

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
  // match: constrains populate to courses in this same tenant — defense in
  // depth alongside the addBookmark() fix, so a mismatched bookmark from
  // anywhere else (a script, a future bug) can't populate cross-tenant
  // course data. A stale cross-tenant bookmark still shows in the list,
  // just with courseId left unpopulated (null) rather than leaking the
  // other tenant's course.
  return CourseBookmark.find({ tenantId, userId })
    .sort({ createdAt: -1 })
    .populate({
      path: 'courseId',
      select: 'title thumbnail price isFree enrollmentCount status level instructorId',
      match: { tenantId },
    })
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
