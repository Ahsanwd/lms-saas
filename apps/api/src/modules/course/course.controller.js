const courseService = require('./course.service');
const {
  validateCreateCourse, validateUpdateCourse,
  validateCreateSection, validateCreateLesson,
  validateReorder, validateCreateCategory,
} = require('../../validators/course.validator');
const R = require('../../utils/response');

// ── Categories ────────────────────────────────────────────────────────────────
async function listCategories(req, res, next) {
  try {
    const categories = await courseService.listCategories(req.tenant.tenantId);
    R.success(res, { categories });
  } catch (err) { next(err); }
}

async function createCategory(req, res, next) {
  try {
    const { name, description, parentId, icon, order } = req.body;
    validateCreateCategory({ name });
    const category = await courseService.createCategory(
      req.tenant.tenantId, { name, description, parentId, icon, order }, req.user.sub
    );
    R.created(res, { category });
  } catch (err) { next(err); }
}

async function updateCategory(req, res, next) {
  try {
    const category = await courseService.updateCategory(
      req.tenant.tenantId, req.params.id, req.body, req.user.sub
    );
    R.success(res, { category }, 'Category updated');
  } catch (err) { next(err); }
}

async function deleteCategory(req, res, next) {
  try {
    await courseService.deleteCategory(req.tenant.tenantId, req.params.id, req.user.sub);
    R.success(res, {}, 'Category deleted');
  } catch (err) { next(err); }
}

// ── Courses ───────────────────────────────────────────────────────────────────
async function listCourses(req, res, next) {
  try {
    const result = await courseService.listCourses(req.tenant.tenantId, req.user, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getCourse(req, res, next) {
  try {
    const course = await courseService.getCourse(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { course });
  } catch (err) { next(err); }
}

async function createCourse(req, res, next) {
  try {
    validateCreateCourse(req.body);
    const course = await courseService.createCourse(req.tenant.tenantId, req.body, req.user);
    R.created(res, { course }, 'Course created');
  } catch (err) { next(err); }
}

async function updateCourse(req, res, next) {
  try {
    validateUpdateCourse(req.body);
    const course = await courseService.updateCourse(
      req.tenant.tenantId, req.params.id, req.body, req.user
    );
    R.success(res, { course }, 'Course updated');
  } catch (err) { next(err); }
}

async function uploadThumbnail(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'Thumbnail file required', 400);
    const course = await courseService.updateCourseThumbnail(
      req.tenant.tenantId, req.params.id, req.file, req.user
    );
    R.success(res, { thumbnail: course.thumbnail }, 'Thumbnail uploaded');
  } catch (err) { next(err); }
}

async function publishCourse(req, res, next) {
  try {
    const course = await courseService.publishCourse(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { course }, 'Course published');
  } catch (err) { next(err); }
}

async function archiveCourse(req, res, next) {
  try {
    const course = await courseService.archiveCourse(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { course }, 'Course archived');
  } catch (err) { next(err); }
}

async function deleteCourse(req, res, next) {
  try {
    await courseService.deleteCourse(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, {}, 'Course deleted');
  } catch (err) { next(err); }
}

// ── Sections ──────────────────────────────────────────────────────────────────
async function getSections(req, res, next) {
  try {
    const sections = await courseService.getSections(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, { sections });
  } catch (err) { next(err); }
}

async function createSection(req, res, next) {
  try {
    validateCreateSection(req.body);
    const section = await courseService.createSection(
      req.tenant.tenantId, req.params.id, req.body, req.user
    );
    R.created(res, { section });
  } catch (err) { next(err); }
}

async function updateSection(req, res, next) {
  try {
    const section = await courseService.updateSection(
      req.tenant.tenantId, req.params.id, req.params.sectionId, req.body, req.user
    );
    R.success(res, { section }, 'Section updated');
  } catch (err) { next(err); }
}

async function deleteSection(req, res, next) {
  try {
    await courseService.deleteSection(
      req.tenant.tenantId, req.params.id, req.params.sectionId, req.user
    );
    R.success(res, {}, 'Section deleted');
  } catch (err) { next(err); }
}

async function reorderSections(req, res, next) {
  try {
    validateReorder(req.body.items);
    await courseService.reorderSections(req.tenant.tenantId, req.params.id, req.body.items, req.user);
    R.success(res, {}, 'Sections reordered');
  } catch (err) { next(err); }
}

// ── Lessons ───────────────────────────────────────────────────────────────────
async function getLessons(req, res, next) {
  try {
    const lessons = await courseService.getLessons(
      req.tenant.tenantId, req.params.id, req.params.sectionId, req.user
    );
    R.success(res, { lessons });
  } catch (err) { next(err); }
}

async function createLesson(req, res, next) {
  try {
    validateCreateLesson(req.body);
    const lesson = await courseService.createLesson(
      req.tenant.tenantId, req.params.id, req.params.sectionId, req.body, req.user
    );
    R.created(res, { lesson });
  } catch (err) { next(err); }
}

async function updateLesson(req, res, next) {
  try {
    const lesson = await courseService.updateLesson(
      req.tenant.tenantId, req.params.id, req.params.sectionId, req.params.lessonId, req.body, req.user
    );
    R.success(res, { lesson }, 'Lesson updated');
  } catch (err) { next(err); }
}

async function uploadVideo(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'Video file required', 400);
    const lesson = await courseService.uploadLessonVideo(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.file, req.user
    );
    R.success(res, { video: lesson.video }, 'Video uploaded');
  } catch (err) { next(err); }
}

async function uploadAudio(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'Audio file required', 400);
    const lesson = await courseService.uploadLessonAudio(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.file, req.user
    );
    R.success(res, { audio: lesson.audio }, 'Audio uploaded');
  } catch (err) { next(err); }
}

async function uploadFile(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'File required', 400);
    const lesson = await courseService.uploadLessonFile(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.file, req.user
    );
    R.success(res, { file: lesson.file }, 'File uploaded');
  } catch (err) { next(err); }
}

async function addAttachment(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'Attachment file required', 400);
    const lesson = await courseService.addLessonAttachment(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.file, req.user
    );
    R.success(res, { attachments: lesson.attachments }, 'Attachment added');
  } catch (err) { next(err); }
}

async function removeAttachment(req, res, next) {
  try {
    await courseService.removeLessonAttachment(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.params.attachmentId, req.user
    );
    R.success(res, {}, 'Attachment removed');
  } catch (err) { next(err); }
}

async function deleteLesson(req, res, next) {
  try {
    await courseService.deleteLesson(
      req.tenant.tenantId, req.params.id, req.params.sectionId, req.params.lessonId, req.user
    );
    R.success(res, {}, 'Lesson deleted');
  } catch (err) { next(err); }
}

async function reorderLessons(req, res, next) {
  try {
    validateReorder(req.body.items);
    await courseService.reorderLessons(
      req.tenant.tenantId, req.params.id, req.params.sectionId, req.body.items, req.user
    );
    R.success(res, {}, 'Lessons reordered');
  } catch (err) { next(err); }
}

// ── Enrollment ────────────────────────────────────────────────────────────────
async function enroll(req, res, next) {
  try {
    const { couponCode, accessCode } = req.body;
    const enrollment = await courseService.enroll(req.tenant.tenantId, req.params.id, req.user, { couponCode, accessCode });
    R.created(res, { enrollment }, 'Enrolled successfully');
  } catch (err) { next(err); }
}

async function dropEnrollment(req, res, next) {
  try {
    await courseService.dropEnrollment(req.tenant.tenantId, req.params.id, req.user);
    R.success(res, {}, 'Enrollment dropped');
  } catch (err) { next(err); }
}

async function listStudents(req, res, next) {
  try {
    const result = await courseService.listEnrolledStudents(
      req.tenant.tenantId, req.params.id, req.user, req.query
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function myEnrollments(req, res, next) {
  try {
    const enrollments = await courseService.getMyEnrollments(req.tenant.tenantId, req.user.sub);
    R.success(res, { enrollments });
  } catch (err) { next(err); }
}

async function myCertificates(req, res, next) {
  try {
    const certificates = await courseService.getMyCertificates(req.tenant.tenantId, req.user.sub);
    R.success(res, { certificates });
  } catch (err) { next(err); }
}

async function bulkEnrollCsv(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'CSV file required', 400);
    const csvText = req.file.buffer.toString('utf-8');
    const result = await courseService.bulkEnrollCsv(req.tenant.tenantId, req.params.id, csvText, req.user);
    R.success(res, result, `Enrolled ${result.enrolled.length} students`);
  } catch (err) { next(err); }
}

async function adminEnroll(req, res, next) {
  try {
    const enrollment = await courseService.adminEnrollUser(
      req.tenant.tenantId, req.params.id, req.body.userId, req.user
    );
    R.created(res, { enrollment }, 'User enrolled');
  } catch (err) { next(err); }
}

async function adminUnenroll(req, res, next) {
  try {
    await courseService.adminUnenrollUser(
      req.tenant.tenantId, req.params.id, req.params.userId, req.user
    );
    R.success(res, {}, 'User unenrolled');
  } catch (err) { next(err); }
}

async function extendAccess(req, res, next) {
  try {
    const { extraDays } = req.body;
    if (!extraDays || extraDays < 1) return R.error(res, 'extraDays must be a positive number', 400);
    const enrollment = await courseService.extendAccess(
      req.tenant.tenantId, req.params.id, req.params.userId, Number(extraDays), req.user
    );
    R.success(res, { enrollment }, `Access extended by ${extraDays} days`);
  } catch (err) { next(err); }
}

// ── Progress ──────────────────────────────────────────────────────────────────
async function getCertificate(req, res, next) {
  try {
    const result = await courseService.getCertificate(
      req.tenant.tenantId, req.params.id, req.user.sub
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function verifyCertificate(req, res, next) {
  try {
    const result = await courseService.verifyCertificate(req.params.certificateId);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function revokeCertificate(req, res, next) {
  try {
    const { reason } = req.body;
    const result = await courseService.revokeCertificate(
      req.tenant.tenantId, req.params.id, req.params.userId, req.user.sub, reason
    );
    R.success(res, result, 'Certificate revoked');
  } catch (err) { next(err); }
}

async function saveVideoPosition(req, res, next) {
  try {
    const { positionSeconds } = req.body;
    if (positionSeconds === undefined || positionSeconds < 0) return R.error(res, 'positionSeconds is required', 400);
    const result = await courseService.saveVideoPosition(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.user.sub, Number(positionSeconds)
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function getLessonProgress(req, res, next) {
  try {
    const result = await courseService.getLessonProgressForUser(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.user.sub
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function markLessonComplete(req, res, next) {
  try {
    const { watchedDuration } = req.body;
    const result = await courseService.markLessonComplete(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.user.sub, watchedDuration
    );
    R.success(res, result, 'Progress updated');
  } catch (err) { next(err); }
}

async function getCourseProgress(req, res, next) {
  try {
    const data = await courseService.getMyCourseProgress(
      req.tenant.tenantId, req.params.id, req.user.sub
    );
    R.success(res, data);
  } catch (err) { next(err); }
}

// ── Course Clone ──────────────────────────────────────────────────────────────
async function cloneCourse(req, res, next) {
  try {
    const course = await courseService.cloneCourse(req.tenant.tenantId, req.params.id, req.user);
    R.created(res, { course }, 'Course cloned successfully');
  } catch (err) { next(err); }
}

// ── S3/R2 Presigned Video Upload ──────────────────────────────────────────────
async function presignVideoUpload(req, res, next) {
  try {
    const { filename, mimetype } = req.body;
    const result = await courseService.presignVideoUpload(
      req.tenant.tenantId, req.params.id, req.params.lessonId, filename, mimetype, req.user
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

// ── Lesson Embedded Quiz ──────────────────────────────────────────────────────
async function getLessonQuiz(req, res, next) {
  try {
    const result = await courseService.getLessonQuiz(
      req.tenant.tenantId, req.params.id, req.params.lessonId
    );
    R.success(res, result);
  } catch (err) { next(err); }
}

async function createLessonQuiz(req, res, next) {
  try {
    const quiz = await courseService.createLessonQuiz(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.body, req.user
    );
    R.created(res, { quiz }, 'Quiz created and linked to lesson');
  } catch (err) { next(err); }
}

async function detachLessonQuiz(req, res, next) {
  try {
    await courseService.detachLessonQuiz(
      req.tenant.tenantId, req.params.id, req.params.lessonId, req.user
    );
    R.success(res, {}, 'Quiz unlinked from lesson');
  } catch (err) { next(err); }
}

// ── SCORM Import ──────────────────────────────────────────────────────────────
async function importScorm(req, res, next) {
  try {
    if (!req.file) return R.error(res, 'SCORM .zip file required', 400);
    const result = await courseService.importScorm(
      req.tenant.tenantId, req.params.id, req.file.buffer, req.user
    );
    R.success(res, result, `Imported ${result.sectionsCreated} sections and ${result.lessonsCreated} lessons from SCORM`);
  } catch (err) { next(err); }
}

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listCourses, getCourse, createCourse, updateCourse, uploadThumbnail,
  publishCourse, archiveCourse, deleteCourse, cloneCourse,
  getSections, createSection, updateSection, deleteSection, reorderSections,
  getLessons, createLesson, updateLesson, uploadVideo, uploadAudio, uploadFile, addAttachment,
  removeAttachment, deleteLesson, reorderLessons,
  getLessonQuiz, createLessonQuiz, detachLessonQuiz,
  presignVideoUpload,
  importScorm,
  enroll, dropEnrollment, listStudents, myEnrollments, myCertificates,
  adminEnroll, adminUnenroll, extendAccess, bulkEnrollCsv,
  saveVideoPosition, getLessonProgress,
  markLessonComplete, getCourseProgress, getCertificate, verifyCertificate, revokeCertificate,
};
