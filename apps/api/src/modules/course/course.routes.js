const router = require('express').Router();
const ctrl = require('./course.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const { upload } = require('../../services/storage/storage.service');
const { guardCourseLimit, guardStorageLimit, trackUpload } = require('../../middlewares/limitGuard.middleware');

/**
 * @swagger
 * /courses:
 *   get:
 *     tags: [Courses]
 *     summary: List all courses for this tenant
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, published, archived] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated course list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         courses: { type: array, items: { $ref: '#/components/schemas/Course' } }
 *                         pagination: { $ref: '#/components/schemas/Pagination' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 *   post:
 *     tags: [Courses]
 *     summary: Create a new course (instructor / admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCourseRequest' }
 *     responses:
 *       201:
 *         description: Course created
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /courses/{id}:
 *   get:
 *     tags: [Courses]
 *     summary: Get a single course with full curriculum
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Course detail
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         course: { $ref: '#/components/schemas/Course' }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     tags: [Courses]
 *     summary: Update course metadata
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCourseRequest' }
 *     responses:
 *       200:
 *         description: Course updated
 *
 *   delete:
 *     tags: [Courses]
 *     summary: Soft-delete a course
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Course deleted
 *
 * /courses/{id}/publish:
 *   patch:
 *     tags: [Courses]
 *     summary: Publish a draft course (makes it visible to students)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Course published
 *
 * /courses/{id}/enroll:
 *   post:
 *     tags: [Enrollment]
 *     summary: Enroll the current user in a course
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/EnrollRequest' }
 *     responses:
 *       201:
 *         description: Enrolled successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         enrollment: { $ref: '#/components/schemas/Enrollment' }
 *       400:
 *         description: Already enrolled, or course is full
 *
 *   delete:
 *     tags: [Enrollment]
 *     summary: Drop (unenroll) the current user from a course
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Unenrolled. If waitlist is enabled, next student is auto-promoted.
 *
 * /courses/my-enrollments:
 *   get:
 *     tags: [Enrollment]
 *     summary: List all courses the current user is enrolled in
 *     responses:
 *       200:
 *         description: Enrollment list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         enrollments:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Enrollment' }
 *
 * /courses/{id}/progress:
 *   get:
 *     tags: [Courses]
 *     summary: Get current user's progress in a course
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Progress data
 *
 * /courses/{id}/certificate:
 *   get:
 *     tags: [Courses]
 *     summary: Download completion certificate (PDF) for a completed course
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: PDF certificate
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       403:
 *         description: Course not completed yet
 */

// ── Public routes (no auth required) ─────────────────────────────────────────
router.get('/verify-certificate/:certificateId', ctrl.verifyCertificate);
router.get('/public', ctrl.listPublicCourses);

router.use(authenticate);

// ── Categories ────────────────────────────────────────────────────────────────
router.get('/categories', ctrl.listCategories);
router.post('/categories', requirePermission('category:create'), ctrl.createCategory);
router.patch('/categories/:id', requirePermission('category:update'), ctrl.updateCategory);
router.delete('/categories/:id', requirePermission('category:delete'), ctrl.deleteCategory);

// ── My Enrollments / Certificates ────────────────────────────────────────────
router.get('/my-enrollments',  ctrl.myEnrollments);
router.get('/my-certificates', ctrl.myCertificates);

// ── Courses ───────────────────────────────────────────────────────────────────
router.get('/', requirePermission('course:read'), ctrl.listCourses);
router.post('/', requirePermission('course:create'), guardCourseLimit(), ctrl.createCourse);
router.get('/:id', requirePermission('course:read'), ctrl.getCourse);
router.patch('/:id', requirePermission('course:update'), ctrl.updateCourse);
router.delete('/:id', requirePermission('course:delete'), ctrl.deleteCourse);

router.post('/:id/thumbnail',
  requirePermission('course:update'),
  guardStorageLimit(),
  upload('thumbnail').single('thumbnail'),
  trackUpload(),
  ctrl.uploadThumbnail
);

router.post('/:id/content-images',
  requirePermission('course:update'),
  guardStorageLimit(),
  upload('content-image').single('image'),
  trackUpload(),
  ctrl.uploadContentImage
);
router.patch('/:id/publish', requirePermission('course:manage'), ctrl.publishCourse);
router.patch('/:id/archive', requirePermission('course:manage'), ctrl.archiveCourse);
router.post('/:id/clone',   requirePermission('course:create'),  guardCourseLimit(), ctrl.cloneCourse);

// ── Sections ──────────────────────────────────────────────────────────────────
router.get('/:id/sections', requirePermission('course:read'), ctrl.getSections);
router.post('/:id/sections', requirePermission('course:update'), ctrl.createSection);
router.patch('/:id/sections/reorder', requirePermission('course:update'), ctrl.reorderSections);
router.patch('/:id/sections/:sectionId', requirePermission('course:update'), ctrl.updateSection);
router.delete('/:id/sections/:sectionId', requirePermission('course:update'), ctrl.deleteSection);

// ── Lessons ───────────────────────────────────────────────────────────────────
router.get('/:id/sections/:sectionId/lessons', requirePermission('course:read'), ctrl.getLessons);
router.post('/:id/sections/:sectionId/lessons', requirePermission('course:update'), ctrl.createLesson);
router.patch('/:id/sections/:sectionId/lessons/reorder', requirePermission('course:update'), ctrl.reorderLessons);
router.patch('/:id/sections/:sectionId/lessons/:lessonId', requirePermission('course:update'), ctrl.updateLesson);
router.delete('/:id/sections/:sectionId/lessons/:lessonId', requirePermission('course:update'), ctrl.deleteLesson);

// ── S3/R2 presigned video upload ──────────────────────────────────────────────
router.post('/:id/lessons/:lessonId/video/presign', requirePermission('course:update'), ctrl.presignVideoUpload);

// ── Lesson embedded quiz ──────────────────────────────────────────────────────
router.get('/:id/lessons/:lessonId/quiz',    requirePermission('course:read'),   ctrl.getLessonQuiz);
router.post('/:id/lessons/:lessonId/quiz',   requirePermission('course:update'), ctrl.createLessonQuiz);
router.delete('/:id/lessons/:lessonId/quiz', requirePermission('course:update'), ctrl.detachLessonQuiz);

router.post('/:id/lessons/:lessonId/video',
  requirePermission('course:update'),
  guardStorageLimit(),
  upload('video').single('video'),
  trackUpload(),
  ctrl.uploadVideo
);
router.post('/:id/lessons/:lessonId/audio',
  requirePermission('course:update'),
  guardStorageLimit(),
  upload('audio').single('audio'),
  trackUpload(),
  ctrl.uploadAudio
);
router.get('/:id/lessons/:lessonId/audio-token', requirePermission('course:read'), ctrl.audioToken);
router.post('/:id/lessons/:lessonId/file',
  requirePermission('course:update'),
  guardStorageLimit(),
  upload('attachment').single('file'),
  trackUpload(),
  ctrl.uploadFile
);
router.post('/:id/lessons/:lessonId/attachments',
  requirePermission('course:update'),
  guardStorageLimit(),
  upload('attachment').single('file'),
  trackUpload(),
  ctrl.addAttachment
);
router.delete('/:id/lessons/:lessonId/attachments/:attachmentId',
  requirePermission('course:update'),
  ctrl.removeAttachment
);

// ── Cloudflare Stream BYOK ────────────────────────────────────────────────────
router.post(  '/:id/lessons/:lessonId/cloudflare-stream/upload-url', requirePermission('course:update'), ctrl.cfStreamUploadUrl);
router.post(  '/:id/lessons/:lessonId/cloudflare-stream/confirm',    requirePermission('course:update'), ctrl.cfStreamConfirm);
router.get(   '/:id/lessons/:lessonId/cloudflare-stream/status',     requirePermission('course:update'), ctrl.cfStreamStatus);
router.get(   '/:id/lessons/:lessonId/cloudflare-stream/token',      requirePermission('course:read'),   ctrl.cfStreamToken);

// ── Enrollment ────────────────────────────────────────────────────────────────
router.post('/:id/enroll', requirePermission('enrollment:create'), ctrl.enroll);
router.delete('/:id/enroll', ctrl.dropEnrollment); // auth already required; service scopes to req.user.sub
router.get('/:id/students', requirePermission('enrollment:read'), ctrl.listStudents);

// Admin manual enrollment + access extension + bulk CSV
const multer = require('multer');
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, f.mimetype === 'text/csv' || f.originalname.endsWith('.csv')) });

router.post('/:id/students',                               requirePermission('course:manage'), ctrl.adminEnroll);
router.delete('/:id/students/:userId',                     requirePermission('course:manage'), ctrl.adminUnenroll);
router.patch('/:id/students/:userId/extend-access',        requirePermission('course:manage'), ctrl.extendAccess);
router.delete('/:id/students/:userId/certificate/revoke',  requirePermission('course:manage'), ctrl.revokeCertificate);
router.post('/:id/students/bulk-csv',                      requirePermission('course:manage'), csvUpload.single('file'), ctrl.bulkEnrollCsv);

// ── SCORM import (memory storage, max 200 MB) ─────────────────────────────────
const scormUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, f.mimetype === 'application/zip' || f.originalname.endsWith('.zip')),
});
router.post('/:id/scorm-import', requirePermission('course:update'), scormUpload.single('file'), ctrl.importScorm);

// ── Cohorts ───────────────────────────────────────────────────────────────────
router.use('/:courseId/cohorts', require('../cohort/cohort.routes'));

// ── Waitlist ───────────────────────────────────────────────────────────────────
router.use('/:courseId/waitlist', require('../waitlist/waitlist.routes'));

// ── Enrollment Requests (approval flow) ───────────────────────────────────────
router.use('/:courseId/enrollment-requests', require('../enrollmentRequest/enrollmentRequest.routes'));

// ── Progress ──────────────────────────────────────────────────────────────────
router.get('/:id/progress', ctrl.getCourseProgress);
router.get('/:id/certificate', requirePermission('certificate:read'), ctrl.getCertificate);
router.post('/:id/progress/lessons/:lessonId', ctrl.markLessonComplete);
router.patch('/:id/progress/lessons/:lessonId/position', ctrl.saveVideoPosition);
router.get('/:id/progress/lessons/:lessonId', ctrl.getLessonProgress);

module.exports = router;
