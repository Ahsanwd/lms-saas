const mongoose = require('mongoose');
const slugify = require('../../utils/slugify');
const courseRepo = require('../../database/repositories/course.repository');
const sectionRepo = require('../../database/repositories/section.repository');
const lessonRepo = require('../../database/repositories/lesson.repository');
const categoryRepo = require('../../database/repositories/category.repository');
const enrollmentRepo = require('../../database/repositories/enrollment.repository');
const progressRepo = require('../../database/repositories/progress.repository');
const userRepo = require('../../database/repositories/user.repository');
const cohortMemberRepo = require('../../database/repositories/cohortMember.repository');
const Cohort = require('../../database/models/Cohort.model');
const { getPublicUrl, deleteFile, getFileSizeBytes } = require('../../services/storage/storage.service');
const livekitService = require('../../services/livekit/livekit.service');
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

// Removes a Cloudflare Stream video (fire-and-forget) when a lesson's video is
// replaced or the lesson is deleted, and releases its storage-minutes back to the
// tenant's quota. Mirrors the R2 deleteFile()/decrementStorageUsed() cleanup pattern
// used for other providers, since deleteFile()/getFileSizeBytes() silently no-op for
// a Cloudflare videoUid (it isn't a real file path).
function cleanupCloudflareVideo(tenantId, video) {
  if (!video?.url) return;
  const config = require('../../config');
  const cf = config.cloudflareStream;
  if (cf.accountId && cf.apiToken) {
    const cfSvc = require('../../services/cloudflareStream/cloudflareStream.service');
    cfSvc.deleteVideo(cf.accountId, cf.apiToken, video.url).catch(() => {});
  }
  if (video.durationSeconds > 0) {
    const lgSvc = require('../../services/limitGuard/limitGuard.service');
    lgSvc.decrementStreamStorageUsed(tenantId, video.durationSeconds / 60).catch(() => {});
  }
}

// Removes a Bunny.net Stream video (fire-and-forget) when a lesson's video is
// replaced or the lesson is deleted. Bunny is BYOK per-tenant (Tenant.bunnyStream),
// unlike Cloudflare's shared platform-level account — same rationale as
// cleanupCloudflareVideo above: deleteFile()/getFileSizeBytes() silently no-op
// for a Bunny video GUID (it isn't a real file path), so without this the
// actual video on the tenant's own Bunny account was never deleted.
function cleanupBunnyVideo(tenantId, video) {
  if (!video?.url) return;
  (async () => {
    try {
      const Tenant = require('../../database/models/Tenant.model');
      const tenant = await Tenant.findById(tenantId).select('+bunnyStream.apiKeyEnc bunnyStream').lean();
      const b = tenant?.bunnyStream;
      if (!b?.enabled || !b.libraryId || !b.apiKeyEnc) return;
      const bunnySvc = require('../../services/bunnyStream/bunnyStream.service');
      const apiKey = bunnySvc.decrypt(b.apiKeyEnc);
      await bunnySvc.deleteVideo(b.libraryId, apiKey, video.url);
    } catch { /* non-fatal */ }
  })();
}

// Shared dispatch for "a lesson's video is about to be replaced" — used by
// every video-set path (direct upload, Cloudflare Stream confirm, Bunny
// confirm) so replacing a video via ANY of them reclaims whatever the
// previous video actually was, not just the one matching that same path.
function cleanupPreviousLessonVideo(tenantId, video) {
  if (!video?.url) return;
  if (video.provider === 'cloudflare') {
    cleanupCloudflareVideo(tenantId, video);
  } else if (video.provider === 'bunny') {
    cleanupBunnyVideo(tenantId, video);
  } else {
    const oldSize = getFileSizeBytes(video.url);
    deleteFile(video.url);
    if (oldSize > 0) setImmediate(() => {
      const lgSvc = require('../../services/limitGuard/limitGuard.service');
      lgSvc.decrementStorageUsed(tenantId, oldSize).catch(() => {});
    });
  }
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

  let course;
  try {
    course = await courseRepo.create({
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
      certificateEnabled: data.certificateEnabled !== false, // default true — matches Course.model.js's own schema default
      allowPreview: data.allowPreview || false,
      instructorId: data.instructorId || user.sub,
      status: 'draft',
      createdBy: user.sub,
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError('A course with this title already exists', 409);
    throw err;
  }

  if (data.categoryId) {
    await categoryRepo.incrementCourseCount(tenantId, data.categoryId, 1).catch(() => {});
  }

  return course;
}

async function updateCourse(tenantId, courseId, data, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);
  if (course.status === 'archived') throw new AppError('Cannot edit archived course', 400);

  const update = { updatedBy: user.sub };
  // enrollmentType/accessCode/waitlistEnabled were never in this whitelist —
  // the schema and the enroll()/enrollmentRequest logic that reads them
  // were fully built, but no endpoint (create or update) could ever set
  // them, so 'approval'- and 'access_code'-gated enrollment (and the
  // waitlist) were unreachable from every course a tenant_admin created.
  // trialEnabled/trialDurationDays have the exact same gap — trial.service.js
  // fully implements start/upgrade/status, but nothing could ever turn a
  // course's trial on, found while testing the payment module's trial flow.
  const fields = ['title', 'description', 'shortDescription', 'level', 'language', 'tags',
    'price', 'requirements', 'objectives', 'capacity', 'certificateEnabled', 'allowPreview', 'passingScore',
    'ctaLabel', 'displayLayout', 'enrollmentType', 'accessCode', 'waitlistEnabled',
    'trialEnabled', 'trialDurationDays'];

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

// The raw storage URL for locally-hosted media (video/audio/file, provider
// 'local' or 's3') must never reach a student directly — it points at a
// publicly-readable R2/CDN path with no access control of its own; the only
// real gate is the app never handing it out. Students always fetch playable
// URLs through the dedicated video-token/audio-token/file-token endpoints,
// which enforce enrollment (and preview/drip) at request time instead.
// External providers (YouTube, Vimeo, SoundCloud, Spotify, external links,
// embeds) are intentionally public — left untouched.
function redactHostedMediaUrls(lessonObj) {
  for (const field of ['video', 'audio', 'file']) {
    const media = lessonObj[field];
    if (media && (media.provider === 'local' || media.provider === 's3')) {
      lessonObj[field] = { ...media, url: null };
    }
  }
  return lessonObj;
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
  let myCohortIds = null;
  if (!isEditor && user.role === 'student') {
    const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, courseId);
    enrolledAt = enrollment?.enrolledAt ?? null;
    myCohortIds = new Set(await cohortMemberRepo.findUserCohortIds(tenantId, user.sub, courseId));
  }

  return visibleSections.map(section => {
    const sectionObj = section.toObject ? section.toObject() : { ...section };
    sectionObj.lessons = allLessons
      .filter(l => {
        if (l.sectionId.toString() !== section._id.toString()) return false;
        // Lesson-level publish state is always respected, independent of the
        // course's own status — otherwise a draft lesson added to an already-
        // published course would show to students immediately regardless of
        // its own toggle.
        if (!isEditor && !l.isPublished) return false;
        // A live-class lesson restricted to one batch is invisible to every
        // other student, same enforcement point as isPublished above.
        if (!isEditor && l.type === 'live' && l.liveClass?.cohortId) {
          return myCohortIds.has(l.liveClass.cohortId.toString());
        }
        return true;
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
          redactHostedMediaUrls(lessonObj);
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
  if (!section || section.courseId.toString() !== courseId) throw new AppError('Section not found', 404);

  // Cascade: a deleted section's lessons must not become orphaned — otherwise
  // they vanish from the curriculum list but stay fully live and reachable
  // (and playable/downloadable) through every lesson-scoped endpoint, and
  // keep counting toward the course's lesson total. Reuses deleteLesson so
  // storage reclaim logic stays in one place.
  const lessons = await lessonRepo.findBySection(tenantId, courseId, sectionId);
  for (const lesson of lessons) {
    await deleteLesson(tenantId, courseId, sectionId, lesson._id.toString(), user);
  }

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
  if (isEditor) return lessons;
  return lessons
    .filter(l => l.isPublished)
    .map(l => redactHostedMediaUrls(l.toObject ? l.toObject() : { ...l }));
}

async function createLesson(tenantId, courseId, sectionId, data, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const section = await sectionRepo.findById(tenantId, sectionId);
  if (!section || section.courseId.toString() !== courseId) throw new AppError('Section not found', 404);

  if (data.liveClass?.cohortId) {
    const cohort = await Cohort.findOne({ _id: data.liveClass.cohortId, tenantId, courseId });
    if (!cohort) throw new AppError('Cohort not found for this course', 400);
  }

  const existing = await lessonRepo.findBySection(tenantId, courseId, sectionId);
  const order = existing.length;

  // Live lessons get their LiveKit room generated automatically at creation —
  // no separate "Create Live Class Room" step needed. Room name is derived
  // from the lesson's own id, so the id is minted up front instead of left
  // to Mongo's default auto-assignment.
  let lessonId;
  let liveClass = data.liveClass ? { ...data.liveClass } : undefined;
  if (data.type === 'live') {
    lessonId = new mongoose.Types.ObjectId();
    liveClass = {
      ...(liveClass || {}),
      platform: 'livekit',
      livekitRoomName: livekitService.generateRoomName(lessonId.toString()),
    };
  }

  const lesson = await lessonRepo.create({
    ...(lessonId ? { _id: lessonId } : {}),
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
    ...(liveClass ? { liveClass } : {}),
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
    if (data.liveClass.cohortId) {
      const cohort = await Cohort.findOne({ _id: data.liveClass.cohortId, tenantId, courseId });
      if (!cohort) throw new AppError('Cohort not found for this course', 400);
    }
    for (const k of ['meetingUrl', 'platform', 'scheduledAt', 'durationMinutes', 'instructions']) {
      if (data.liveClass[k] !== undefined) update[`liveClass.${k}`] = data.liveClass[k];
    }
    if (data.liveClass.cohortId !== undefined) update['liveClass.cohortId'] = data.liveClass.cohortId || null;
    if (data.liveClass.scheduledAt) newScheduledAt = new Date(data.liveClass.scheduledAt);
  }
  // A lesson turned into type 'live' after creation (or one saved before
  // rooms were auto-generated on create) still needs a room — same
  // auto-provisioning as createLesson, so there's never a manual step.
  const becomingLive = (data.type ?? lesson.type) === 'live';
  if (becomingLive && !lesson.liveClass?.livekitRoomName) {
    update['liveClass.platform'] = 'livekit';
    update['liveClass.livekitRoomName'] = livekitService.generateRoomName(lessonId);
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

  // Switching a lesson's type (e.g. video → audio) must clear the previous
  // type's media subdocument — otherwise it's never touched again (the
  // frontend only ever sends the field matching the current type) and stays
  // in the DB forever, showing up as a stale duration/provider in the
  // curriculum list and leaking storage that's no longer reachable to delete.
  if (data.type !== undefined && data.type !== lesson.type) {
    for (const mediaField of ['video', 'audio', 'file']) {
      if (mediaField !== data.type && data[mediaField] === undefined) {
        update[mediaField] = null;
      }
    }
  }

  const updated = await lessonRepo.updateById(tenantId, lessonId, update);
  await recalcCourseCounters(tenantId, courseId);

  // Schedule 1-hour pre-session reminder when a live lesson's scheduledAt is set in the future
  if (lesson.type === 'live' && newScheduledAt && newScheduledAt.getTime() > Date.now() + 3600_000) {
    setImmediate(() => {
      const scheduledTaskRepo = require('../../database/repositories/scheduledTask.repository');
      const reminderFireAt = newScheduledAt.getTime() - 3600_000; // 1 hour before
      scheduledTaskRepo.schedule({
        type:   'live-reminder',
        jobKey: `live-reminder-${lessonId}`,
        payload: { tenantId: tenantId.toString(), lessonId: lessonId.toString(), scheduledAt: newScheduledAt.toISOString() },
        runAt: new Date(reminderFireAt),
        maxAttempts: 2,
        backoffMs:   0,
      }).catch(() => {});
    });
  }

  return updated;
}

async function uploadLessonVideo(tenantId, courseId, lessonId, file, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);
  cleanupPreviousLessonVideo(tenantId, lesson.video);

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
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);
  cleanupPreviousLessonVideo(tenantId, lesson.video);

  const updated = await lessonRepo.updateById(tenantId, lessonId, {
    'video.url':      videoUid,
    'video.provider': 'cloudflare',
    updatedBy: user.sub,
  });
  await recalcCourseCounters(tenantId, courseId);
  return updated;
}

// Called from the status-poll endpoint once Cloudflare reports the video ready with
// a known duration. Idempotent (no-ops once video.durationSeconds is already set) so
// repeated polls from the frontend are safe. Meters the duration against the
// tenant's Cloudflare Stream storage-minute quota; if the tenant is over quota at
// this point (e.g. two uploads raced past the pre-upload check), the orphaned
// Cloudflare video is deleted and the lesson's video field is cleared.
async function syncCfStreamDuration(tenantId, courseId, lessonId, planId, durationSeconds, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);
  if (lesson.video?.provider !== 'cloudflare' || !lesson.video.url) return lesson;
  if (lesson.video.durationSeconds > 0) return lesson; // already synced

  const minutes = durationSeconds / 60;
  const limitGuardSvc = require('../../services/limitGuard/limitGuard.service');

  try {
    await limitGuardSvc.assertStreamStorageLimit(tenantId, planId, minutes);
  } catch (err) {
    const config = require('../../config');
    const cf = config.cloudflareStream;
    if (cf.accountId && cf.apiToken) {
      const cfSvc = require('../../services/cloudflareStream/cloudflareStream.service');
      cfSvc.deleteVideo(cf.accountId, cf.apiToken, lesson.video.url).catch(() => {});
    }
    await lessonRepo.updateById(tenantId, lessonId, {
      'video.url': null, 'video.provider': 'local', updatedBy: user.sub,
    });
    throw err;
  }

  const updated = await lessonRepo.updateById(tenantId, lessonId, {
    'video.durationSeconds': durationSeconds,
    durationSeconds,
    updatedBy: user.sub,
  });
  await limitGuardSvc.incrementStreamStorageUsed(tenantId, minutes);
  await recalcCourseCounters(tenantId, courseId);

  const Media = require('../../database/models/Media.model');
  Media.create({
    tenantId, url: lesson.video.url, key: lesson.video.url, filename: null, mimeType: 'video/mp4',
    category: 'cloudflare-stream', sizeBytes: 0, durationSeconds, provider: 'cloudflare',
    contextType: 'lesson-video', contextId: lessonId, createdBy: user.sub,
  }).catch(() => {});

  return updated;
}

async function confirmBunnyVideo(tenantId, courseId, lessonId, videoGuid, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);
  cleanupPreviousLessonVideo(tenantId, lesson.video);

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
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);
  if (lesson.audio?.url) {
    const oldSize = getFileSizeBytes(lesson.audio.url);
    deleteFile(lesson.audio.url);
    if (oldSize > 0) setImmediate(() => {
      const lgSvc = require('../../services/limitGuard/limitGuard.service');
      lgSvc.decrementStorageUsed(tenantId, oldSize).catch(() => {});
    });
  }

  const { USE_S3 } = require('../../services/storage/storage.service');
  const url = getPublicUrl(file.path);
  const updated = await lessonRepo.updateById(tenantId, lessonId, {
    'audio.url': url,
    'audio.provider': USE_S3 ? 's3' : 'local',
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
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);

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
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);

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
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);

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
  if (!lesson || lesson.courseId.toString() !== courseId) throw new AppError('Lesson not found', 404);

  // Reclaim all storage used by this lesson's media files
  let reclaimBytes = 0;
  if (lesson.video?.url) {
    if (lesson.video.provider === 'cloudflare') {
      cleanupCloudflareVideo(tenantId, lesson.video);
    } else if (lesson.video.provider === 'bunny') {
      cleanupBunnyVideo(tenantId, lesson.video);
    } else {
      reclaimBytes += getFileSizeBytes(lesson.video.url);
      deleteFile(lesson.video.url);
    }
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

  const section = await sectionRepo.findById(tenantId, sectionId);
  if (!section || section.courseId.toString() !== courseId) throw new AppError('Section not found', 404);

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
  let viaMembership    = false;
  let membershipPlanId = null;
  if (!course.isFree && (course.price || 0) > 0) {
    const membershipSvc = require('../membership/membership.service');
    const access = await membershipSvc.checkCourseAccess(tenantId, user.sub, courseId);
    if (!access.hasAccess) {
      throw new AppError(
        'This course requires payment. Please use the Buy Now button.',
        400,
        'PAYMENT_REQUIRED'
      );
    }
    // Member — fall through to free enrollment below
    viaMembership    = true;
    membershipPlanId = access.planId;
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
      enrolledVia: viaMembership ? 'membership' : 'direct',
      membershipPlanId: viaMembership ? membershipPlanId : null,
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

  if (viaMembership) {
    // Covered by the subscription, not a per-course payment — a coupon makes
    // no sense stacked on top of membership access, so skip that branch entirely.
    pricePaid = 0;
  } else if (couponCode && !course.isFree && course.price > 0) {
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
    enrolledVia: viaMembership ? 'membership' : 'direct',
    membershipPlanId: viaMembership ? membershipPlanId : null,
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
    // 'completed' must be treated the same as 'active' here — this used to
    // only guard 'active', so re-enrolling someone who'd already finished
    // the course (and could hold an issued certificate) silently reset
    // status back to 'active' and wiped completedAt, with no restart
    // intended by the caller. Confirmed live: a real completed enrollment
    // with an issued certificate got reverted to active/completedAt:null
    // via this exact path, called from courseApplication's approve flow.
    if (['active', 'completed'].includes(existing.status)) throw new AppError('User is already enrolled', 409);
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
    // Same fix as adminEnrollUser() above — 'completed' must skip here too,
    // or CSV-enrolling a name that already finished the course silently
    // reverts them to active/completedAt:null.
    if (existing && ['active', 'completed'].includes(existing.status)) { results.skipped.push(email); continue; }

    if (existing) {
      await enrollmentRepo.updateByUserAndCourse(tenantId, user._id.toString(), courseId, {
        status: 'active', enrolledAt: new Date(), droppedAt: null, completedAt: null,
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
    courseId:           e.courseId?._id ?? e.courseId,
    courseTitle:        e.courseId?.title ?? '',
    thumbnail:          e.courseId?.thumbnail ?? null,
    level:              e.courseId?.level ?? null,
    completedAt:        e.completedAt,
    issuedAt:           e.certificateIssuedAt ?? e.completedAt,
    certificateId:      e.certificateId,
    certificateRevoked: e.certificateRevoked ?? false,
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
  // 'completed' must stay allowed here, not just 'active' — otherwise a
  // student who already finished the course once can never mark progress
  // again, which permanently freezes CourseProgress.totalLessons/percentage
  // at whatever the course's lesson count was back when they first hit
  // 100%, even after new lessons are added to the course later.
  if (!enrollment || !['active', 'completed'].includes(enrollment.status))
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
    // Only issue a certificate the first time — a student who drops and
    // re-enrolls (enroll()'s re-enrollment branch resets status/completedAt
    // but leaves CourseProgress/certificateIssued untouched) can hit this
    // 100%-completion branch again on the very next lesson they mark
    // complete. Without this guard, re-issuing regenerates certificateId,
    // silently orphaning the original certificate's public verification
    // link and re-sending the "certificate ready" notification.
    let certUpdate = {};
    if (course.certificateEnabled && !enrollment.certificateIssued) {
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
    if (course.certificateEnabled && !enrollment.certificateIssued)
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
      certificateId,
      studentName: `${enrollment.userId.firstName} ${enrollment.userId.lastName}`,
      courseTitle: enrollment.courseId?.title ?? 'Unknown Course',
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
async function revokeCertificate(tenantId, courseId, userId, user, reason) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);
  if (!canEditCourse(course, user)) throw new AppError('Forbidden', 403);

  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, userId, courseId);
  if (!enrollment) throw new AppError('Enrollment not found', 404);
  if (!enrollment.certificateIssued) throw new AppError('No certificate has been issued for this enrollment', 400);
  if (enrollment.certificateRevoked) throw new AppError('Certificate is already revoked', 409);

  await enrollmentRepo.updateByUserAndCourse(tenantId, userId, courseId, {
    certificateRevoked:      true,
    certificateRevokedAt:    new Date(),
    certificateRevokedBy:    user.sub,
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
    certificateEnabled: src.certificateEnabled !== false,
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

    // Leaf item with no children → treat as a single lesson.
    // NOTE: the manifest only tells us the SCO's launch path *inside the zip*
    // (e.g. "scormcontent/lesson1.html") — it is not a real, servable URL, and
    // this import does not extract/upload the zip's actual content files. So
    // `file` is intentionally left null here rather than pointing it at a
    // broken path that would 404 when a student opens the lesson. Only the
    // course structure (sections/lesson titles) is imported; each lesson's
    // real content still needs to be added manually.
    const lessonsToCreate = subItems.length > 0 ? subItems : [item];
    for (let li = 0; li < lessonsToCreate.length; li++) {
      const sco = lessonsToCreate[li];
      await lessonRepo.create({
        tenantId, courseId, sectionId: section._id,
        title: String(sco.title || `Lesson ${li + 1}`),
        type:  'file',
        order: li, isPublished: false,
        file:  null,
        notes: `Imported from SCORM — original identifierref: ${sco.identifierref || 'N/A'}. Add this lesson's real content (video/file/text) manually.`,
        createdBy: user.sub,
      });
      results.lessonsCreated++;
    }
  }

  await recalcCourseCounters(tenantId, courseId);
  results.note = 'Only the course structure (sections and lesson titles) was imported — SCORM content files are not yet supported. Each lesson was left unpublished; add its real content and publish it manually.';
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
  syncCfStreamDuration,
  confirmBunnyVideo,
  importScorm,
  enroll, dropEnrollment, listEnrolledStudents, getMyEnrollments, getMyCertificates,
  adminEnrollUser, adminUnenrollUser, extendAccess, bulkEnrollCsv,
  saveVideoPosition, getLessonProgressForUser,
  markLessonComplete, getMyCourseProgress, getCertificate, verifyCertificate, revokeCertificate,
};
