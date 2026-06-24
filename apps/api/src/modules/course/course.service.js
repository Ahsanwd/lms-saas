const slugify = require('../../utils/slugify');
const courseRepo = require('../../database/repositories/course.repository');
const sectionRepo = require('../../database/repositories/section.repository');
const lessonRepo = require('../../database/repositories/lesson.repository');
const categoryRepo = require('../../database/repositories/category.repository');
const enrollmentRepo = require('../../database/repositories/enrollment.repository');
const progressRepo = require('../../database/repositories/progress.repository');
const userRepo = require('../../database/repositories/user.repository');
const { getPublicUrl, deleteFile, getFileSizeBytes } = require('../../services/storage/storage.service');
const AppError = require('../../utils/AppError');
const logger   = require('../../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCertificateId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `CERT-${seg(5)}-${seg(5)}`;
}

function canEditCourse(course, user) {
  if (['tenant_admin', 'super_admin'].includes(user.role)) return true;
  return course.instructorId._id?.toString() === user.sub ||
    course.instructorId?.toString() === user.sub;
}

async function recalcCourseCounters(tenantId, courseId) {
  const lessons = await lessonRepo.findByCourse(tenantId, courseId);
  const published = lessons.filter(l => l.isPublished && !l.deletedAt);
  const totalDuration = published.reduce((s, l) => s + (l.durationSeconds || 0), 0);

  const sections = await sectionRepo.findByCourse(tenantId, courseId);
  const activeSections = sections.filter(s => !s.deletedAt);

  await courseRepo.updateById(tenantId, courseId, {
    totalLessons: published.length,
    totalSections: activeSections.length,
    totalDurationSeconds: totalDuration,
  });
}

// ─── Categories ───────────────────────────────────────────────────────────────
async function listCategories(tenantId) {
  return categoryRepo.findAll(tenantId, { isActive: true });
}

async function createCategory(tenantId, { name, description, parentId, icon, order }, userId) {
  const slug = slugify(name);
  const existing = await categoryRepo.findBySlug(tenantId, slug);
  if (existing) throw new AppError('Category with this name already exists', 409);

  return categoryRepo.create({ tenantId, name: name.trim(), slug, description, parentId, icon, order, createdBy: userId });
}

async function updateCategory(tenantId, id, updates, userId) {
  const cat = await categoryRepo.findById(tenantId, id);
  if (!cat) throw new AppError('Category not found', 404);
  return categoryRepo.updateById(tenantId, id, { ...updates, updatedBy: userId });
}

async function deleteCategory(tenantId, id, userId) {
  const cat = await categoryRepo.findById(tenantId, id);
  if (!cat) throw new AppError('Category not found', 404);
  if (cat.courseCount > 0) throw new AppError('Cannot delete category with active courses', 400);
  return categoryRepo.softDelete(tenantId, id, userId);
}

// ─── Courses ──────────────────────────────────────────────────────────────────
async function listCourses(tenantId, user, query) {
  const { status, categoryId, level, search, page, limit } = query;
  const filter = {};

  if (['instructor'].includes(user.role)) {
    filter.instructorId = user.sub;
  } else if (user.role === 'student') {
    filter.status = 'published';
  }

  if (status && user.role !== 'student') filter.status = status;
  if (categoryId) filter.categoryId = categoryId;
  if (level) filter.level = level;
  if (search) filter.$or = [
    { title: { $regex: search, $options: 'i' } },
    { tags: { $regex: search, $options: 'i' } },
  ];

  const [courses, total] = await courseRepo.findAll(tenantId, filter, { page, limit });
  return { courses, pagination: { total, page: Number(page || 1), limit: Number(limit || 20), pages: Math.ceil(total / Number(limit || 20)) } };
}

async function getCourse(tenantId, courseId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (course.status !== 'published' && !canEditCourse(course, user))
    throw new AppError('Course not found', 404);
  return course;
}

async function createCourse(tenantId, data, user) {
  const slug = slugify(data.title);
  const existing = await courseRepo.findBySlug(tenantId, slug);
  if (existing) throw new AppError('A course with this title already exists', 409);

  const course = await courseRepo.create({
    tenantId,
    title: data.title.trim(),
    slug,
    description: data.description,
    shortDescription: data.shortDescription,
    categoryId: data.categoryId || null,
    level: data.level || 'all',
    language: data.language || 'en',
    tags: data.tags || [],
    price: data.price || 0,
    isFree: !data.price || data.price === 0,
    requirements: data.requirements || [],
    objectives: data.objectives || [],
    capacity: data.capacity || 0,
    certificateEnabled: data.certificateEnabled || false,
    allowPreview: data.allowPreview || false,
    instructorId: data.instructorId || user.sub,
    status: 'draft',
    createdBy: user.sub,
  });

  if (data.categoryId) {
    await categoryRepo.incrementCourseCount(tenantId, data.categoryId, 1);
  }

  return course;
}

async function updateCourse(tenantId, courseId, data, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);
  if (course.status === 'archived') throw new AppError('Cannot edit archived course', 400);

  const update = { updatedBy: user.sub };
  const fields = ['title', 'description', 'shortDescription', 'level', 'language', 'tags',
    'price', 'requirements', 'objectives', 'capacity', 'certificateEnabled', 'allowPreview', 'passingScore',
    'ctaLabel', 'displayLayout'];

  for (const f of fields) {
    if (data[f] !== undefined) update[f] = data[f];
  }
  if (data.price !== undefined) update.isFree = data.price === 0;

  // Category change — update counters
  if (data.categoryId !== undefined && data.categoryId !== course.categoryId?.toString()) {
    if (course.categoryId) await categoryRepo.incrementCourseCount(tenantId, course.categoryId, -1);
    if (data.categoryId) await categoryRepo.incrementCourseCount(tenantId, data.categoryId, 1);
    update.categoryId = data.categoryId || null;
  }

  return courseRepo.updateById(tenantId, courseId, update);
}

async function updateCourseThumbnail(tenantId, courseId, file, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  if (course.thumbnail) {
    const oldSize = getFileSizeBytes(course.thumbnail);
    deleteFile(course.thumbnail);
    if (oldSize > 0) setImmediate(() => {
      const lgSvc = require('../../services/limitGuard/limitGuard.service');
      lgSvc.decrementStorageUsed(tenantId, oldSize).catch(() => {});
    });
  }
  const url = getPublicUrl(file.path);
  return courseRepo.updateById(tenantId, courseId, { thumbnail: url, updatedBy: user.sub });
}

async function publishCourse(tenantId, courseId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);
  if (course.status === 'published') throw new AppError('Course is already published', 400);

  const lessonCount = await lessonRepo.countPublished(tenantId, courseId);
  if (lessonCount === 0) throw new AppError('Cannot publish a course with no published lessons', 400);

  const updated = await courseRepo.updateById(tenantId, courseId, {
    status: 'published',
    publishedAt: new Date(),
    updatedBy: user.sub,
  });

  // Notify already-enrolled students that content is now accessible (fire-and-forget)
  const Enrollment = require('../../database/models/Enrollment.model');
  const notifySvc = require('../notification/notification.service');
  Enrollment.find({ tenantId, courseId, status: 'active' }, 'userId')
    .then(enrollments => {
      const userIds = enrollments.map(e => e.userId);
      if (userIds.length > 0)
        notifySvc.notifyCoursePublished(tenantId, userIds, course.title, courseId);
    })
    .catch(() => {});

  return updated;
}

async function archiveCourse(tenantId, courseId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);
  return courseRepo.updateById(tenantId, courseId, { status: 'archived', updatedBy: user.sub });
}

async function deleteCourse(tenantId, courseId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);
  if (course.enrollmentCount > 0) throw new AppError('Cannot delete a course with enrollments', 400);
  if (course.categoryId) await categoryRepo.incrementCourseCount(tenantId, course.categoryId, -1);
  return courseRepo.softDelete(tenantId, courseId, user.sub);
}

// ─── Sections ─────────────────────────────────────────────────────────────────
async function getSections(tenantId, courseId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);

  const isEditor = canEditCourse(course, user);
  const isCoursePublished = course.status === 'published';

  const [rawSections, allLessons] = await Promise.all([
    sectionRepo.findByCourse(tenantId, courseId),
    lessonRepo.findByCourse(tenantId, courseId),
  ]);

  // Editors see everything. Students see all content of published courses;
  // for non-published courses only isPublished sections/lessons are shown.
  const visibleSections = (isEditor || isCoursePublished)
    ? rawSections
    : rawSections.filter(s => s.isPublished);

  // For drip content: find student's enrollment date if applicable
  let enrolledAt = null;
  if (!isEditor && user.role === 'student') {
    const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, courseId);
    enrolledAt = enrollment?.enrolledAt ?? null;
  }

  return visibleSections.map(section => {
    const sectionObj = section.toObject ? section.toObject() : { ...section };
    sectionObj.lessons = allLessons
      .filter(l => {
        if (l.sectionId.toString() !== section._id.toString()) return false;
        return isEditor || isCoursePublished || l.isPublished;
      })
      .map(l => {
        const lessonObj = l.toObject ? l.toObject() : { ...l };
        // Attach drip lock info for students (dripDate absolute takes precedence over dripDays relative)
        if (!isEditor) {
          const now = new Date();
          let lockedUntil = null;
          if (lessonObj.dripDate && new Date(lessonObj.dripDate) > now) {
            lockedUntil = new Date(lessonObj.dripDate);
          } else if (enrolledAt && lessonObj.dripDays > 0) {
            const unlockDate = new Date(enrolledAt);
            unlockDate.setDate(unlockDate.getDate() + lessonObj.dripDays);
            if (unlockDate > now) lockedUntil = unlockDate;
          }
          lessonObj.dripLockedUntil = lockedUntil;
        } else {
          lessonObj.dripLockedUntil = null;
        }
        return lessonObj;
      });
    return sectionObj;
  });
}

async function createSection(tenantId, courseId, { title, description }, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const existing = await sectionRepo.findByCourse(tenantId, courseId);
  const order = existing.length;

  const section = await sectionRepo.create({ tenantId, courseId, title: title.trim(), description, order, isPublished: true, createdBy: user.sub });
  await courseRepo.incrementCounter(tenantId, courseId, { totalSections: 1 });
  return section;
}

async function updateSection(tenantId, courseId, sectionId, data, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const section = await sectionRepo.findById(tenantId, sectionId);
  if (!section || section.courseId.toString() !== courseId) throw new AppError('Section not found', 404);

  const update = { updatedBy: user.sub };
  if (data.title) update.title = data.title.trim();
  if (data.description !== undefined) update.description = data.description;
  if (data.isPublished !== undefined) update.isPublished = data.isPublished;

  return sectionRepo.updateById(tenantId, sectionId, update);
}

async function deleteSection(tenantId, courseId, sectionId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const section = await sectionRepo.findById(tenantId, sectionId);
  if (!section) throw new AppError('Section not found', 404);

  await sectionRepo.softDelete(tenantId, sectionId, user.sub);
  await courseRepo.incrementCounter(tenantId, courseId, { totalSections: -1 });
  await recalcCourseCounters(tenantId, courseId);
}

async function reorderSections(tenantId, courseId, items, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);
  return sectionRepo.reorder(tenantId, courseId, items);
}

// ─── Lessons ──────────────────────────────────────────────────────────────────
async function getLessons(tenantId, courseId, sectionId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  const lessons = await lessonRepo.findBySection(tenantId, courseId, sectionId);
  const isEditor = canEditCourse(course, user);
  return isEditor ? lessons : lessons.filter(l => l.isPublished);
}

async function createLesson(tenantId, courseId, sectionId, data, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const section = await sectionRepo.findById(tenantId, sectionId);
  if (!section || section.courseId.toString() !== courseId) throw new AppError('Section not found', 404);

  const existing = await lessonRepo.findBySection(tenantId, courseId, sectionId);
  const order = existing.length;

  const lesson = await lessonRepo.create({
    tenantId, courseId, sectionId,
    title: data.title.trim(),
    type: data.type,
    content: data.content || null,
    order,
    isPublished: data.isPublished !== undefined ? data.isPublished : true,
    isPreview: data.isPreview || false,
    discussionEnabled: data.discussionEnabled || false,
    dripDays: data.dripDays || 0,
    dripDate: data.dripDate || null,
    notes: data.notes || null,
    durationSeconds: data.durationSeconds || 0,
    ...(data.liveClass ? { liveClass: data.liveClass } : {}),
    ...(data.video ? { video: data.video } : {}),
    ...(data.audio ? { audio: data.audio } : {}),
    ...(data.file  ? { file:  data.file  } : {}),
    createdBy: user.sub,
  });

  await sectionRepo.incrementCounter(tenantId, sectionId, { totalLessons: 1 });
  await recalcCourseCounters(tenantId, courseId);
  return lesson;
}

async function updateLesson(tenantId, courseId, sectionId, lessonId, data, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);

  const update = { updatedBy: user.sub };
  const fields = ['title', 'type', 'content', 'isPublished', 'isPreview', 'discussionEnabled', 'notes', 'durationSeconds', 'dripDays', 'dripDate'];
  for (const f of fields) {
    if (data[f] !== undefined) update[f] = data[f];
  }
  let newScheduledAt = null;
  if (data.liveClass !== undefined) {
    for (const k of ['meetingUrl', 'platform', 'scheduledAt', 'durationMinutes', 'instructions']) {
      if (data.liveClass[k] !== undefined) update[`liveClass.${k}`] = data.liveClass[k];
    }
    if (data.liveClass.scheduledAt) newScheduledAt = new Date(data.liveClass.scheduledAt);
  }
  // Video source + settings update (non-upload path — URL/embed/settings changes)
  if (data.video !== undefined) {
    for (const k of ['url', 'provider', 'embedCode', 'durationSeconds']) {
      if (data.video[k] !== undefined) update[`video.${k}`] = data.video[k];
    }
    if (data.video.settings !== undefined) {
      for (const k of ['watermarkText', 'watermarkEnabled', 'disableDownload', 'allowSpeedControl']) {
        if (data.video.settings[k] !== undefined) update[`video.settings.${k}`] = data.video.settings[k];
      }
    }
  }
  // Audio source update (non-upload path — URL/embed changes)
  if (data.audio !== undefined) {
    for (const k of ['url', 'provider', 'embedCode', 'durationSeconds']) {
      if (data.audio[k] !== undefined) update[`audio.${k}`] = data.audio[k];
    }
  }
  // File source update (non-upload path — URL/embed/cloud link changes)
  if (data.file !== undefined) {
    for (const k of ['url', 'name', 'provider', 'embedCode']) {
      if (data.file[k] !== undefined) update[`file.${k}`] = data.file[k];
    }
  }

  const updated = await lessonRepo.updateById(tenantId, lessonId, update);
  await recalcCourseCounters(tenantId, courseId);

  // Schedule 1-hour pre-session reminder when a live lesson's scheduledAt is set in the future
  if (lesson.type === 'live' && newScheduledAt && newScheduledAt.getTime() > Date.now() + 3600_000) {
    setImmediate(() => {
      const { liveReminderQueue } = require('../../jobs/queue');
      const reminderFireAt = newScheduledAt.getTime() - 3600_000; // 1 hour before
      const delay = reminderFireAt - Date.now();
      liveReminderQueue().add(
        { type: 'live-reminder', tenantId: tenantId.toString(), lessonId: lessonId.toString(), scheduledAt: newScheduledAt.toISOString() },
        { delay, attempts: 2, jobId: `live-reminder-${lessonId}`, removeOnComplete: true }
      ).catch(() => {});
    });
  }

  return updated;
}

async function uploadLessonVideo(tenantId, courseId, lessonId, file, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);
  if (lesson.video?.url) {
    const oldSize = getFileSizeBytes(lesson.video.url);
    deleteFile(lesson.video.url);
    if (oldSize > 0) setImmediate(() => {
      const lgSvc = require('../../services/limitGuard/limitGuard.service');
      lgSvc.decrementStorageUsed(tenantId, oldSize).catch(() => {});
    });
  }

  const { USE_S3 } = require('../../services/storage/storage.service');
  const url = getPublicUrl(file.path);
  const updated = await lessonRepo.updateById(tenantId, lessonId, {
    'video.url': url,
    'video.provider': USE_S3 ? 's3' : 'local',
    updatedBy: user.sub,
  });
  await recalcCourseCounters(tenantId, courseId);
  return updated;
}

async function confirmCfStreamVideo(tenantId, courseId, lessonId, videoUid, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);

  const updated = await lessonRepo.updateById(tenantId, lessonId, {
    'video.url':      videoUid,
    'video.provider': 'cloudflare',
    updatedBy: user.sub,
  });
  await recalcCourseCounters(tenantId, courseId);
  return updated;
}

async function confirmBunnyVideo(tenantId, courseId, lessonId, videoGuid, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);

  const updated = await lessonRepo.updateById(tenantId, lessonId, {
    'video.url':      videoGuid,
    'video.provider': 'bunny',
    updatedBy: user.sub,
  });
  await recalcCourseCounters(tenantId, courseId);
  return updated;
}

async function uploadLessonAudio(tenantId, courseId, lessonId, file, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);
  if (lesson.audio?.url) {
    const oldSize = getFileSizeBytes(lesson.audio.url);
    deleteFile(lesson.audio.url);
    if (oldSize > 0) setImmediate(() => {
      const lgSvc = require('../../services/limitGuard/limitGuard.service');
      lgSvc.decrementStorageUsed(tenantId, oldSize).catch(() => {});
    });
  }

  const url = getPublicUrl(file.path);
  const updated = await lessonRepo.updateById(tenantId, lessonId, {
    'audio.url': url,
    'audio.provider': 'local',
    updatedBy: user.sub,
  });
  await recalcCourseCounters(tenantId, courseId);
  return updated;
}

async function uploadLessonFile(tenantId, courseId, lessonId, file, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);

  // Per-type size limit (multer global ceiling is 100 MB; we enforce finer limits here)
  const { getPerTypeLimit, USE_S3 } = require('../../services/storage/storage.service');
  const typeLimit = getPerTypeLimit(file.mimetype);
  if (file.size > typeLimit) {
    deleteFile(getPublicUrl(file.path));
    const mb = Math.round(typeLimit / 1024 / 1024);
    throw new AppError(`File too large. Maximum for this file type is ${mb} MB`, 400);
  }

  if (lesson.file?.url) {
    const oldSize = lesson.file.sizeBytes || getFileSizeBytes(lesson.file.url);
    deleteFile(lesson.file.url);
    if (oldSize > 0) setImmediate(() => {
      const lgSvc = require('../../services/limitGuard/limitGuard.service');
      lgSvc.decrementStorageUsed(tenantId, oldSize).catch(() => {});
    });
  }

  const url = getPublicUrl(file.path);
  const updated = await lessonRepo.updateById(tenantId, lessonId, {
    'file.url':           url,
    'file.name':          file.originalname,
    'file.mimeType':      file.mimetype,
    'file.sizeBytes':     file.size,
    'file.provider':      USE_S3 ? 's3' : 'local',
    'file.convertedHtml': null,
    'file.isConverted':   false,
    updatedBy: user.sub,
  });

  // Convert Word/Excel to HTML asynchronously (non-blocking)
  const { isConvertible, convertToHtml, readFileBuffer } = require('../../services/fileConversion/fileConversion.service');
  if (isConvertible(file.mimetype)) {
    setImmediate(async () => {
      try {
        const buffer = await readFileBuffer(url, USE_S3 ? null : file.path, USE_S3 ? file.key : null);
        const html   = await convertToHtml(buffer, file.mimetype);
        if (html) {
          await lessonRepo.updateById(tenantId, lessonId, {
            'file.convertedHtml': html,
            'file.isConverted':   true,
          });
        }
      } catch (err) {
        logger.error(`File conversion failed for lesson ${lessonId}: ${err.message}`);
      }
    });
  }

  await recalcCourseCounters(tenantId, courseId);
  return updated;
}

async function addLessonAttachment(tenantId, courseId, lessonId, file, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);

  const url = getPublicUrl(file.path);
  const attachment = { name: file.originalname, url, mimeType: file.mimetype, sizeBytes: file.size };

  return lessonRepo.updateById(tenantId, lessonId, {
    $push: { attachments: attachment },
    updatedBy: user.sub,
  });
}

async function removeLessonAttachment(tenantId, courseId, lessonId, attachmentId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);

  const attachment = lesson.attachments?.find(a => a._id.toString() === attachmentId);
  if (!attachment) throw new AppError('Attachment not found', 404);

  const reclaimBytes = attachment.sizeBytes || getFileSizeBytes(attachment.url);
  deleteFile(attachment.url);
  if (reclaimBytes > 0) setImmediate(() => {
    const lgSvc = require('../../services/limitGuard/limitGuard.service');
    lgSvc.decrementStorageUsed(tenantId, reclaimBytes).catch(() => {});
  });

  return lessonRepo.updateById(tenantId, lessonId, {
    $pull: { attachments: { _id: attachmentId } },
    updatedBy: user.sub,
  });
}

async function deleteLesson(tenantId, courseId, sectionId, lessonId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);

  // Reclaim all storage used by this lesson's media files
  let reclaimBytes = 0;
  if (lesson.video?.url) {
    reclaimBytes += getFileSizeBytes(lesson.video.url);
    deleteFile(lesson.video.url);
  }
  if (lesson.audio?.url) {
    reclaimBytes += getFileSizeBytes(lesson.audio.url);
    deleteFile(lesson.audio.url);
  }
  if (lesson.file?.url) {
    reclaimBytes += lesson.file.sizeBytes || getFileSizeBytes(lesson.file.url);
    deleteFile(lesson.file.url);
  }
  for (const att of lesson.attachments ?? []) {
    reclaimBytes += att.sizeBytes || 0;
    deleteFile(att.url);
  }
  if (reclaimBytes > 0) setImmediate(() => {
    const lgSvc = require('../../services/limitGuard/limitGuard.service');
    lgSvc.decrementStorageUsed(tenantId, reclaimBytes).catch(() => {});
  });

  await lessonRepo.softDelete(tenantId, lessonId, user.sub);
  await sectionRepo.incrementCounter(tenantId, sectionId, { totalLessons: -1 });
  await recalcCourseCounters(tenantId, courseId);
}

async function reorderLessons(tenantId, courseId, sectionId, items, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);
  return lessonRepo.reorder(tenantId, sectionId, items);
}

// ─── Enrollment ───────────────────────────────────────────────────────────────
function calcExpiresAt(accessDurationDays) {
  if (!accessDurationDays || accessDurationDays <= 0) return null;
  return new Date(Date.now() + accessDurationDays * 24 * 60 * 60 * 1000);
}

async function enroll(tenantId, courseId, user, { couponCode, accessCode } = {}) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (course.status !== 'published') throw new AppError('Course is not available for enrollment', 400);

  // ── Feature 4: Enrollment window ──────────────────────────────────────────
  const now = new Date();
  if (course.enrollmentStartsAt && now < course.enrollmentStartsAt)
    throw new AppError(
      `Enrollment opens on ${course.enrollmentStartsAt.toLocaleDateString()}`,
      400, 'ENROLLMENT_NOT_OPEN'
    );
  if (course.enrollmentEndsAt && now > course.enrollmentEndsAt)
    throw new AppError('Enrollment for this course has closed', 400, 'ENROLLMENT_CLOSED');

  // ── Enrollment type gate ───────────────────────────────────────────────────
  if (course.enrollmentType === 'access_code') {
    if (!accessCode) throw new AppError('An access code is required to enroll in this course', 400, 'ACCESS_CODE_REQUIRED');
    if (accessCode.trim() !== (course.accessCode || '').trim())
      throw new AppError('Invalid access code', 400, 'ACCESS_CODE_INVALID');
  }
  if (course.enrollmentType === 'approval') {
    throw new AppError('This course requires approval. Please submit an enrollment request.', 400, 'APPROVAL_REQUIRED');
  }

  // ── Feature 3: Prerequisites ───────────────────────────────────────────────
  if (course.prerequisites && course.prerequisites.length > 0) {
    const Enrollment = require('../../database/models/Enrollment.model');
    const completed = await Enrollment.find({
      tenantId, userId: user.sub,
      courseId: { $in: course.prerequisites },
      status: 'completed',
    }).distinct('courseId');
    const completedIds = completed.map(id => id.toString());
    const missing = course.prerequisites.filter(p => !completedIds.includes(p.toString()));
    if (missing.length > 0)
      throw new AppError('You must complete the prerequisite courses first', 400, 'PREREQUISITES_NOT_MET');
  }

  // Paid courses — check membership access before blocking for payment
  if (!course.isFree && (course.price || 0) > 0) {
    const membershipSvc = require('../membership/membership.service');
    const { hasAccess } = await membershipSvc.checkCourseAccess(tenantId, user.sub, courseId);
    if (!hasAccess) {
      throw new AppError(
        'This course requires payment. Please use the Buy Now button.',
        400,
        'PAYMENT_REQUIRED'
      );
    }
    // Member — fall through to free enrollment below
  }

  const existing = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, courseId);
  if (existing) {
    if (existing.status === 'active') throw new AppError('Already enrolled', 409);
    // Re-enroll after drop, completion, or expiry — recalculate expiry
    return enrollmentRepo.updateByUserAndCourse(tenantId, user.sub, courseId, {
      status: 'active',
      enrolledAt: new Date(),
      droppedAt: null,
      completedAt: null,
      expiresAt: calcExpiresAt(course.accessDurationDays),
    });
  }

  if (course.capacity > 0) {
    const activeCount = await enrollmentRepo.countActive(tenantId, courseId);
    if (activeCount >= course.capacity) throw new AppError('Course is full', 400);
  }

  // ── Coupon / discount ──────────────────────────────────────────────────────
  let pricePaid      = course.isFree ? 0 : (course.price || 0);
  let discountAmount = 0;
  let appliedCode    = null;

  if (couponCode && !course.isFree && course.price > 0) {
    try {
      const couponService = require('../coupon/coupon.service');
      const discount = await couponService.applyCoupon(tenantId, couponCode, courseId, course.price);
      discountAmount = discount.discountAmount;
      pricePaid      = discount.finalPrice;
      appliedCode    = discount.code;
    } catch {
      throw new AppError('Invalid or inapplicable coupon code', 400, 'COUPON_INVALID');
    }
  }

  const enrollment = await enrollmentRepo.create({
    tenantId,
    courseId,
    userId: user.sub,
    pricePaid,
    discountAmount,
    couponCode: appliedCode,
    expiresAt: calcExpiresAt(course.accessDurationDays), // Feature 1
  });

  await courseRepo.incrementCounter(tenantId, courseId, { enrollmentCount: 1 });

  // Notify student
  const notifySvc = require('../notification/notification.service');
  notifySvc.notifyEnrollment(tenantId, user.sub, course.title, courseId).catch(() => {});

  const { emitDashboardUpdated } = require('../../services/socket/io');
  emitDashboardUpdated(tenantId, { event: 'new_enrollment' });

  return enrollment;
}

// ── Feature 1: Extend enrollment access (admin) ────────────────────────────────
async function extendAccess(tenantId, courseId, targetUserId, extraDays, actingUser) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, actingUser)) throw new AppError('Forbidden', 403);

  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, targetUserId, courseId);
  if (!enrollment) throw new AppError('Enrollment not found', 404);

  const base = enrollment.expiresAt && enrollment.expiresAt > new Date()
    ? enrollment.expiresAt
    : new Date();
  const newExpiry = new Date(base.getTime() + extraDays * 24 * 60 * 60 * 1000);

  return enrollmentRepo.updateByUserAndCourse(tenantId, targetUserId, courseId, {
    expiresAt: newExpiry,
    status: enrollment.status === 'expired' ? 'active' : enrollment.status,
  });
}

async function dropEnrollment(tenantId, courseId, user) {
  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, courseId);
  if (!enrollment || enrollment.status !== 'active')
    throw new AppError('Active enrollment not found', 404);

  await enrollmentRepo.updateByUserAndCourse(tenantId, user.sub, courseId, {
    status: 'dropped', droppedAt: new Date(),
  });
  await courseRepo.incrementCounter(tenantId, courseId, { enrollmentCount: -1 });

  // Seat freed — auto-promote next person on waitlist (fire-and-forget)
  const { promoteNext } = require('../waitlist/waitlist.service');
  promoteNext(tenantId, courseId).catch(() => {});
}

async function listEnrolledStudents(tenantId, courseId, user, query) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const [students, total] = await enrollmentRepo.findByCourse(tenantId, courseId, {}, query);
  return { students, total };
}

async function adminEnrollUser(tenantId, courseId, targetUserId, actingUser) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, actingUser)) throw new AppError('Forbidden', 403);

  const existing = await enrollmentRepo.findByUserAndCourse(tenantId, targetUserId, courseId);
  if (existing) {
    if (existing.status === 'active') throw new AppError('User is already enrolled', 409);
    return enrollmentRepo.updateByUserAndCourse(tenantId, targetUserId, courseId, {
      status: 'active', enrolledAt: new Date(), droppedAt: null, completedAt: null,
      expiresAt: calcExpiresAt(course.accessDurationDays),
    });
  }

  const enrollment = await enrollmentRepo.create({
    tenantId, courseId, userId: targetUserId,
    pricePaid: 0, discountAmount: 0, couponCode: null,
    expiresAt: calcExpiresAt(course.accessDurationDays),
  });
  await courseRepo.incrementCounter(tenantId, courseId, { enrollmentCount: 1 });
  return enrollment;
}

// ── Feature 10: Bulk CSV Enrollment ───────────────────────────────────────────
async function bulkEnrollCsv(tenantId, courseId, csvText, actingUser) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, actingUser)) throw new AppError('Forbidden', 403);

  // Inline CSV parser (handles quoted fields)
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) throw new AppError('CSV must have a header row and at least one data row', 400);

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const emailIdx = headers.indexOf('email');
  if (emailIdx === -1) throw new AppError('CSV must have an "email" column', 400);

  const User = require('../../database/models/User.model');
  const Enrollment = require('../../database/models/Enrollment.model');

  const results = { enrolled: [], skipped: [], notFound: [] };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    const email = cols[emailIdx]?.toLowerCase();
    if (!email) continue;

    const user = await User.findOne({ tenantId, email, deletedAt: null });
    if (!user) { results.notFound.push(email); continue; }

    const existing = await Enrollment.findOne({ tenantId, courseId, userId: user._id });
    if (existing?.status === 'active') { results.skipped.push(email); continue; }

    if (existing) {
      await enrollmentRepo.updateByUserAndCourse(tenantId, user._id.toString(), courseId, {
        status: 'active', enrolledAt: new Date(), droppedAt: null,
        expiresAt: calcExpiresAt(course.accessDurationDays),
      });
    } else {
      await Enrollment.create({
        tenantId, courseId, userId: user._id,
        pricePaid: 0, discountAmount: 0, couponCode: null,
        expiresAt: calcExpiresAt(course.accessDurationDays),
      });
      await courseRepo.incrementCounter(tenantId, courseId, { enrollmentCount: 1 });
    }
    results.enrolled.push(email);
  }

  return results;
}

async function adminUnenrollUser(tenantId, courseId, targetUserId, actingUser) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, actingUser)) throw new AppError('Forbidden', 403);

  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, targetUserId, courseId);
  if (!enrollment || enrollment.status !== 'active')
    throw new AppError('Active enrollment not found', 404);

  await enrollmentRepo.updateByUserAndCourse(tenantId, targetUserId, courseId, {
    status: 'dropped', droppedAt: new Date(),
  });
  await courseRepo.incrementCounter(tenantId, courseId, { enrollmentCount: -1 });

  const { promoteNext } = require('../waitlist/waitlist.service');
  promoteNext(tenantId, courseId).catch(() => {});
}

async function getMyEnrollments(tenantId, userId) {
  return enrollmentRepo.findByUser(tenantId, userId, { status: { $in: ['active', 'completed'] } });
}

async function getMyCertificates(tenantId, userId) {
  const enrollments = await enrollmentRepo.findByUser(tenantId, userId, {
    status: 'completed',
    certificateIssued: true,
  });
  return enrollments.map(e => ({
    courseId:      e.courseId?._id ?? e.courseId,
    courseTitle:   e.courseId?.title ?? '',
    thumbnail:     e.courseId?.thumbnail ?? null,
    level:         e.courseId?.level ?? null,
    completedAt:   e.completedAt,
    issuedAt:      e.certificateIssuedAt ?? e.completedAt,
    certificateId: e.certificateId,
  }));
}

// ─── Progress ─────────────────────────────────────────────────────────────────
async function saveVideoPosition(tenantId, courseId, lessonId, userId, seconds) {
  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, userId, courseId);
  if (!enrollment || enrollment.status !== 'active')
    throw new AppError('Not enrolled in this course', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId)
    throw new AppError('Lesson not found', 404);

  await progressRepo.saveVideoPosition(tenantId, userId, lessonId, courseId, lesson.sectionId, seconds);
  return { saved: true, positionSeconds: seconds };
}

async function getLessonProgressForUser(tenantId, courseId, lessonId, userId) {
  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, userId, courseId);
  if (!enrollment || enrollment.status !== 'active')
    throw new AppError('Not enrolled in this course', 403);

  const progress = await progressRepo.getLessonProgress(tenantId, userId, lessonId);
  return { positionSeconds: progress?.watchedDurationSeconds ?? 0, status: progress?.status ?? 'not_started' };
}

async function markLessonComplete(tenantId, courseId, lessonId, userId, watchedDuration) {
  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, userId, courseId);
  if (!enrollment || enrollment.status !== 'active')
    throw new AppError('Not enrolled in this course', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId)
    throw new AppError('Lesson not found', 404);

  await progressRepo.upsertLessonProgress(tenantId, userId, lessonId, {
    courseId, sectionId: lesson.sectionId, lessonId,
    status: 'completed',
    watchedDurationSeconds: watchedDuration || lesson.durationSeconds,
    completedAt: new Date(),
  });

  const course = await courseRepo.findById(tenantId, courseId);
  const completedCount = await progressRepo.countCompletedLessons(tenantId, userId, courseId);
  const total = course.totalLessons || 1;
  const percentage = Math.min(100, Math.round((completedCount / total) * 100));
  const completedAt = percentage === 100 ? new Date() : null;

  await progressRepo.upsertCourseProgress(tenantId, userId, courseId, {
    completedLessons: completedCount,
    totalLessons: total,
    percentage,
    lastLessonId: lessonId,
    completedAt,
  });

  if (completedAt) {
    let certUpdate = {};
    if (course.certificateEnabled) {
      const certTemplateSvc = require('../certificateTemplate/certTemplate.service');
      const tmpl = await certTemplateSvc.getTemplate(tenantId, courseId).catch(() => null);
      const expiresAt = tmpl?.expiryDays
        ? new Date(completedAt.getTime() + tmpl.expiryDays * 86_400_000)
        : null;
      certUpdate = {
        certificateIssued: true,
        certificateIssuedAt: completedAt,
        certificateId: generateCertificateId(),
        certificateExpiresAt: expiresAt,
      };
    }
    await enrollmentRepo.updateByUserAndCourse(tenantId, userId, courseId, {
      status: 'completed', completedAt, ...certUpdate,
    });

    // Notify student of completion and certificate (fire-and-forget)
    const notifySvc = require('../notification/notification.service');
    notifySvc.notifyCourseCompleted(tenantId, userId, course.title, courseId).catch(() => {});
    if (course.certificateEnabled)
      notifySvc.notifyCertificateIssued(tenantId, userId, course.title, courseId).catch(() => {});
  }

  return { completedLessons: completedCount, totalLessons: total, percentage };
}

async function getCertificate(tenantId, courseId, userId) {
  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, userId, courseId);
  if (!enrollment || enrollment.status !== 'completed')
    throw new AppError('Certificate not available — complete the course first', 404);
  if (enrollment.certificateRevoked)
    throw new AppError('This certificate has been revoked', 410, 'CERT_REVOKED');

  const [course, student] = await Promise.all([
    courseRepo.findById(tenantId, courseId),
    userRepo.findByIdRaw(userId),
  ]);
  if (!course) throw new AppError('Course not found', 404);

  let instructorName = 'Instructor';
  if (course.instructorId) {
    const instructorIdStr = course.instructorId._id?.toString() ?? course.instructorId.toString();
    const instructor = await userRepo.findByIdRaw(instructorIdStr);
    if (instructor) instructorName = `${instructor.firstName} ${instructor.lastName}`;
  }

  // Generate certificateId if missing (back-fill for older enrollments)
  let certId = enrollment.certificateId;
  if (!enrollment.certificateIssued || !certId) {
    certId = certId || generateCertificateId();
    await enrollmentRepo.updateByUserAndCourse(tenantId, userId, courseId, {
      certificateIssued: true,
      certificateIssuedAt: enrollment.completedAt ?? new Date(),
      certificateId: certId,
    });
  }

  // Fetch certificate template (course-specific or tenant default)
  const certTemplateSvc = require('../certificateTemplate/certTemplate.service');
  const template = await certTemplateSvc.getTemplate(tenantId, courseId).catch(() => null);

  return {
    certificateId: certId,
    studentName: `${student.firstName} ${student.lastName}`,
    courseTitle: course.title,
    instructorName,
    completedAt: enrollment.completedAt,
    issuedAt: enrollment.certificateIssuedAt ?? enrollment.completedAt,
    expiresAt: enrollment.certificateExpiresAt ?? null,
    template: template ?? null,
  };
}

// ─── Public Certificate Verification ─────────────────────────────────────────
async function verifyCertificate(certificateId) {
  if (!certificateId) throw new AppError('Certificate ID is required', 400);
  const Enrollment = require('../../database/models/Enrollment.model');

  const enrollment = await Enrollment.findOne({ certificateId })
    .populate('courseId', 'title certificateEnabled')
    .populate('userId', 'firstName lastName')
    .lean();

  if (!enrollment || !enrollment.certificateIssued) {
    return { valid: false, message: 'Certificate not found or not valid' };
  }

  if (enrollment.certificateRevoked) {
    return {
      valid: false,
      revoked: true,
      revokedAt: enrollment.certificateRevokedAt,
      revokeReason: enrollment.certificateRevokeReason,
      message: 'This certificate has been revoked',
    };
  }

  const now = new Date();
  const isExpired = !!(enrollment.certificateExpiresAt && now > new Date(enrollment.certificateExpiresAt));

  return {
    valid: !isExpired,
    isExpired,
    certificateId,
    studentName: `${enrollment.userId.firstName} ${enrollment.userId.lastName}`,
    courseTitle: enrollment.courseId?.title ?? 'Unknown Course',
    completedAt: enrollment.completedAt,
    issuedAt: enrollment.certificateIssuedAt,
    expiresAt: enrollment.certificateExpiresAt ?? null,
    ...(isExpired ? { message: 'This certificate has expired' } : {}),
  };
}

// ─── Revoke Certificate ───────────────────────────────────────────────────────
async function revokeCertificate(tenantId, courseId, userId, adminId, reason) {
  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, userId, courseId);
  if (!enrollment) throw new AppError('Enrollment not found', 404);
  if (!enrollment.certificateIssued) throw new AppError('No certificate has been issued for this enrollment', 400);
  if (enrollment.certificateRevoked) throw new AppError('Certificate is already revoked', 409);

  await enrollmentRepo.updateByUserAndCourse(tenantId, userId, courseId, {
    certificateRevoked:      true,
    certificateRevokedAt:    new Date(),
    certificateRevokedBy:    adminId,
    certificateRevokeReason: reason || null,
  });

  return { revoked: true, certificateId: enrollment.certificateId };
}

async function getMyCourseProgress(tenantId, courseId, userId) {
  const [courseProgress, lessonDetails] = await Promise.all([
    progressRepo.getCourseProgress(tenantId, userId, courseId),
    progressRepo.getCourseProgressDetails(tenantId, userId, courseId),
  ]);
  return { courseProgress, lessonDetails };
}

// ─── 1. Course Clone ──────────────────────────────────────────────────────────
async function cloneCourse(tenantId, courseId, user) {
  const source = await courseRepo.findById(tenantId, courseId);
  if (!source) throw new AppError('Course not found', 404);
  if (!canEditCourse(source, user)) throw new AppError('Forbidden', 403);

  const src = source.toObject ? source.toObject() : { ...source };

  let newTitle = `Copy of ${src.title}`;
  let newSlug  = slugify(newTitle);
  const conflict = await courseRepo.findBySlug(tenantId, newSlug);
  if (conflict) {
    const ts = Date.now().toString(36);
    newSlug  = `${newSlug}-${ts}`;
    newTitle = `${newTitle} (${ts})`;
  }

  const cloned = await courseRepo.create({
    tenantId,
    title: newTitle, slug: newSlug,
    description: src.description,
    shortDescription: src.shortDescription,
    categoryId: src.categoryId || null,
    level: src.level || 'all',
    language: src.language || 'en',
    tags: src.tags || [],
    price: src.price || 0, isFree: src.isFree,
    requirements: src.requirements || [],
    objectives: src.objectives || [],
    capacity: src.capacity || 0,
    certificateEnabled: src.certificateEnabled || false,
    allowPreview: src.allowPreview || false,
    passingScore: src.passingScore || 70,
    accessDurationDays: src.accessDurationDays || 0,
    trialEnabled: src.trialEnabled || false,
    trialDurationDays: src.trialDurationDays || 7,
    prerequisites: src.prerequisites || [],
    instructorId: src.instructorId,
    status: 'draft',
    createdBy: user.sub,
  });

  const [sections, allLessons] = await Promise.all([
    sectionRepo.findByCourse(tenantId, courseId),
    lessonRepo.findByCourse(tenantId, courseId),
  ]);

  for (const section of sections) {
    const so = section.toObject ? section.toObject() : { ...section };
    const newSection = await sectionRepo.create({
      tenantId, courseId: cloned._id,
      title: so.title, description: so.description,
      order: so.order, isPublished: so.isPublished,
      createdBy: user.sub,
    });

    const sectionLessons = allLessons.filter(
      l => l.sectionId.toString() === section._id.toString() && !l.deletedAt
    );
    for (const lesson of sectionLessons) {
      const lo = lesson.toObject ? lesson.toObject() : { ...lesson };
      await lessonRepo.create({
        tenantId, courseId: cloned._id, sectionId: newSection._id,
        title: lo.title, type: lo.type, content: lo.content,
        order: lo.order, isPublished: lo.isPublished,
        isPreview: lo.isPreview, discussionEnabled: lo.discussionEnabled,
        dripDays: lo.dripDays || 0, dripDate: lo.dripDate || null,
        notes: lo.notes, durationSeconds: lo.durationSeconds || 0,
        video: lo.video, audio: lo.audio, file: lo.file,
        attachments: lo.attachments || [],
        // quizId intentionally not copied — quiz is owned by the lesson
        createdBy: user.sub,
      });
    }
  }

  await recalcCourseCounters(tenantId, cloned._id);
  if (src.categoryId) await categoryRepo.incrementCourseCount(tenantId, src.categoryId, 1);
  return courseRepo.findById(tenantId, cloned._id);
}

// ─── 2. S3/R2 Presigned Video Upload URL ─────────────────────────────────────
async function presignVideoUpload(tenantId, courseId, lessonId, filename, mimetype, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);

  const { generatePresignedUploadUrl } = require('../../services/storage/storage.service');
  const ext = filename ? `.${filename.split('.').pop().toLowerCase()}` : '.mp4';
  const key = `videos/${tenantId}/${courseId}/${lessonId}-${Date.now()}${ext}`;
  return generatePresignedUploadUrl(key, mimetype || 'video/mp4');
}

// ─── 3. Lesson Embedded Quiz ──────────────────────────────────────────────────
async function getLessonQuiz(tenantId, courseId, lessonId) {
  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);
  if (!lesson.quizId) return { quiz: null };

  const Quiz = require('../../database/models/Quiz.model');
  const quiz = await Quiz.findById(lesson.quizId).lean();
  return { quiz: quiz || null };
}

async function createLessonQuiz(tenantId, courseId, lessonId, data, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);
  if (lesson.type !== 'quiz') throw new AppError('Lesson type must be quiz', 400);

  const Quiz = require('../../database/models/Quiz.model');

  // Detach & unlink previous quiz if any
  if (lesson.quizId) await Quiz.findByIdAndUpdate(lesson.quizId, { lessonId: null });

  const quiz = await Quiz.create({
    tenantId, courseId, lessonId,
    instructorId: user.sub,
    title:        data.title        || `${lesson.title} — Quiz`,
    description:  data.description  || null,
    instructions: data.instructions || null,
    status: 'published',
    settings: {
      timer:             { enabled: !!data.timerEnabled, durationMinutes: Number(data.timerMinutes) || 10 },
      maxAttempts:       Number(data.maxAttempts)  || 3,
      passingScore:      Number(data.passingScore) || 70,
      shuffleQuestions:  !!data.shuffleQuestions,
      shuffleOptions:    !!data.shuffleOptions,
      showCorrectAnswers: data.showCorrectAnswers !== false,
      showExplanations:   data.showExplanations   !== false,
      allowRetake:        data.allowRetake         !== false,
    },
    createdBy: user.sub,
  });

  await lessonRepo.updateById(tenantId, lessonId, { quizId: quiz._id, updatedBy: user.sub });
  return quiz;
}

async function detachLessonQuiz(tenantId, courseId, lessonId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);

  if (lesson.quizId) {
    const Quiz = require('../../database/models/Quiz.model');
    await Quiz.findByIdAndUpdate(lesson.quizId, { lessonId: null });
    await lessonRepo.updateById(tenantId, lessonId, { quizId: null, updatedBy: user.sub });
  }
}

// ─── 4. SCORM Import ──────────────────────────────────────────────────────────
async function importScorm(tenantId, courseId, fileBuffer, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  let manifest;
  try {
    const unzipper = require('unzipper');
    const xml2js   = require('xml2js');

    const directory = await unzipper.Open.buffer(fileBuffer);
    const manifestFile = directory.files.find(f =>
      f.path.toLowerCase() === 'imsmanifest.xml' ||
      f.path.toLowerCase().endsWith('/imsmanifest.xml')
    );
    if (!manifestFile) throw new AppError('Invalid SCORM package: imsmanifest.xml not found', 400);

    const xmlBuf = await manifestFile.buffer();
    manifest = await xml2js.parseStringPromise(xmlBuf.toString(), {
      explicitArray: false, mergeAttrs: true,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`Failed to parse SCORM package: ${err.message}`, 400);
  }

  const root = manifest?.manifest;
  if (!root) throw new AppError('Invalid SCORM manifest structure', 400);

  // Build resource map: identifier → launchUrl
  const resourceMap = {};
  const resources = root.resources?.resource;
  if (resources) {
    const resArr = Array.isArray(resources) ? resources : [resources];
    for (const r of resArr) {
      if (r.identifier) resourceMap[r.identifier] = r.href || r['adlcp:href'] || null;
    }
  }

  // Navigate organization items
  const orgs = root.organizations?.organization;
  const org  = orgs ? (Array.isArray(orgs) ? orgs[0] : orgs) : null;
  if (!org) throw new AppError('Invalid SCORM manifest: no organization found', 400);

  const topItems = org.item ? (Array.isArray(org.item) ? org.item : [org.item]) : [];
  const results  = { sectionsCreated: 0, lessonsCreated: 0, title: String(org.title || 'SCORM Course') };

  for (let si = 0; si < topItems.length; si++) {
    const item = topItems[si];
    const sectionTitle = String(item.title || `Section ${si + 1}`);
    const subItems = item.item ? (Array.isArray(item.item) ? item.item : [item.item]) : [];

    const section = await sectionRepo.create({
      tenantId, courseId, title: sectionTitle,
      order: si, isPublished: true, createdBy: user.sub,
    });
    results.sectionsCreated++;

    // Leaf item with no children → treat as a single lesson
    const lessonsToCreate = subItems.length > 0 ? subItems : [item];
    for (let li = 0; li < lessonsToCreate.length; li++) {
      const sco    = lessonsToCreate[li];
      const launch = resourceMap[sco.identifierref] || null;
      await lessonRepo.create({
        tenantId, courseId, sectionId: section._id,
        title: String(sco.title || `Lesson ${li + 1}`),
        type:  'file',
        order: li, isPublished: true,
        file:  launch ? { url: launch, provider: 'external', name: String(sco.title || 'SCORM Content') } : null,
        notes: `SCORM SCO — original identifierref: ${sco.identifierref || 'N/A'}`,
        createdBy: user.sub,
      });
      results.lessonsCreated++;
    }
  }

  await recalcCourseCounters(tenantId, courseId);
  return results;
}

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listCourses, getCourse, createCourse, updateCourse, updateCourseThumbnail,
  publishCourse, archiveCourse, deleteCourse,
  cloneCourse,
  getSections, createSection, updateSection, deleteSection, reorderSections,
  getLessons, createLesson, updateLesson, uploadLessonVideo, uploadLessonAudio, uploadLessonFile,
  addLessonAttachment, removeLessonAttachment, deleteLesson, reorderLessons,
  getLessonQuiz, createLessonQuiz, detachLessonQuiz,
  presignVideoUpload,
  confirmCfStreamVideo,
  confirmBunnyVideo,
  importScorm,
  enroll, dropEnrollment, listEnrolledStudents, getMyEnrollments, getMyCertificates,
  adminEnrollUser, adminUnenrollUser, extendAccess, bulkEnrollCsv,
  saveVideoPosition, getLessonProgressForUser,
  markLessonComplete, getMyCourseProgress, getCertificate, verifyCertificate, revokeCertificate,
};
