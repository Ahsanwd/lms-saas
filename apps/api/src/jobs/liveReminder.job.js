const logger = require('../utils/logger');

async function handleLiveReminder(payload) {
  const { tenantId, lessonId, scheduledAt } = payload;

  const Lesson = require('../database/models/Lesson.model');
  const doc = await Lesson.findOne({ _id: lessonId, tenantId, type: 'live', deletedAt: null });

  // Skip if lesson gone, already started/ended, or rescheduled
  if (!doc || !['scheduled'].includes(doc.liveClass?.status)) return;
  if (!doc.liveClass?.scheduledAt) return;
  if (doc.liveClass.scheduledAt.toISOString() !== scheduledAt) return; // stale — rescheduled

  const enrollmentRepo  = require('../database/repositories/enrollment.repository');
  const notifySvc       = require('../modules/notification/notification.service');
  const Course          = require('../database/models/Course.model');
  const Tenant          = require('../database/models/Tenant.model');

  const course  = await Course.findById(doc.courseId).select('title').lean();
  const tenant  = await Tenant.findById(tenantId).select('name branding').lean();

  const enrollments = await enrollmentRepo.findByCourse(tenantId, doc.courseId.toString());
  const studentIds  = (enrollments ?? [])
    .filter(e => ['active', 'completed'].includes(e.status))
    .map(e => e.userId?.toString())
    .filter(Boolean);

  if (!studentIds.length) return;

  await notifySvc.notifyLiveSessionReminder(
    tenantId,
    studentIds,
    doc.title,
    course?.title ?? null,
    doc.courseId.toString(),
    lessonId,
    doc.liveClass.scheduledAt,
    doc.liveClass.platform ?? 'zoom',
    { tenantName: tenant?.name ?? 'Learning Platform' }
  );

  logger.info(`Live reminder sent for lesson ${lessonId} to ${studentIds.length} students`);
}

module.exports = { handleLiveReminder };
