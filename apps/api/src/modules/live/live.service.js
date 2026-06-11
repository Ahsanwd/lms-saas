const Lesson           = require('../../database/models/Lesson.model');
const enrollmentRepo   = require('../../database/repositories/enrollment.repository');
const attendanceRepo   = require('../../database/repositories/liveAttendance.repository');
const userRepo         = require('../../database/repositories/user.repository');
const AppError         = require('../../utils/AppError');

const MOD_ROLES = ['instructor', 'tenant_admin'];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getLiveLesson(tenantId, lessonId) {
  const lesson = await Lesson.findOne({ _id: lessonId, tenantId, type: 'live', deletedAt: null });
  if (!lesson) throw new AppError('Live lesson not found', 404);
  return lesson;
}

async function assertEnrolled(tenantId, userId, courseId, role) {
  if (MOD_ROLES.includes(role)) return;
  const enr = await enrollmentRepo.findByUserAndCourse(tenantId, userId, courseId);
  if (!enr || !['active', 'completed'].includes(enr.status))
    throw new AppError('You must be enrolled to access this session', 403);
}

function isCheckinOpen(lesson) {
  const lc = lesson.liveClass;
  if (!lc?.attendanceEnabled) return false;
  if (lc.status === 'live') return true;
  if (lc.status === 'ended' && lc.liveEndedAt) {
    const hoursAllowed = lc.checkinWindowHours ?? 24;
    const hoursElapsed = (Date.now() - new Date(lc.liveEndedAt).getTime()) / 3600000;
    return hoursElapsed <= hoursAllowed;
  }
  return false;
}

// ── Get session info + student's own attendance ───────────────────────────────
async function getSession(tenantId, lessonId, user) {
  const lesson = await getLiveLesson(tenantId, lessonId);
  await assertEnrolled(tenantId, user.sub, lesson.courseId.toString(), user.role);

  const lc = lesson.liveClass ?? {};
  const attendance = await attendanceRepo.findByUserAndLesson(tenantId, lessonId, user.sub);

  return {
    lesson: {
      _id:      lesson._id,
      title:    lesson.title,
      courseId: lesson.courseId,
      liveClass: {
        platform:       lc.platform,
        meetingUrl:     lc.meetingUrl,
        scheduledAt:    lc.scheduledAt,
        durationMinutes: lc.durationMinutes,
        instructions:   lc.instructions,
        status:         lc.status ?? 'scheduled',
        liveStartedAt:  lc.liveStartedAt,
        liveEndedAt:    lc.liveEndedAt,
        recordingUrl:   lc.recordingUrl,
        attendanceEnabled: lc.attendanceEnabled ?? true,
        checkinOpen:    isCheckinOpen(lesson),
      },
    },
    myAttendance: attendance ? {
      status:       attendance.status,
      source:       attendance.source,
      joinedAt:     attendance.joinedAt,
      checkedInAt:  attendance.checkedInAt,
      durationMinutes: attendance.durationMinutes,
    } : null,
  };
}

// ── Student clicks Join button ────────────────────────────────────────────────
async function recordJoin(tenantId, lessonId, user) {
  const lesson = await getLiveLesson(tenantId, lessonId);
  await assertEnrolled(tenantId, user.sub, lesson.courseId.toString(), user.role);

  const lc = lesson.liveClass ?? {};
  if (lc.status !== 'live') throw new AppError('This session is not currently live', 400);
  if (!lc.meetingUrl)       throw new AppError('No meeting URL configured for this session', 400);

  // Upsert: only set joinedAt if not already recorded
  const existing = await attendanceRepo.findByUserAndLesson(tenantId, lessonId, user.sub);
  if (!existing) {
    await attendanceRepo.upsert(tenantId, lessonId, user.sub, {
      tenantId, courseId: lesson.courseId, lessonId, userId: user.sub,
      source: 'join_button', status: 'attended', joinedAt: new Date(),
    });
  }

  return { meetingUrl: lc.meetingUrl };
}

// ── Student self check-in ─────────────────────────────────────────────────────
async function selfCheckin(tenantId, lessonId, user) {
  const lesson = await getLiveLesson(tenantId, lessonId);
  await assertEnrolled(tenantId, user.sub, lesson.courseId.toString(), user.role);

  if (!isCheckinOpen(lesson))
    throw new AppError('Self check-in is not available for this session', 400);

  const existing = await attendanceRepo.findByUserAndLesson(tenantId, lessonId, user.sub);
  if (existing?.source === 'join_button') {
    // Upgrade to confirmed check-in
    await attendanceRepo.upsert(tenantId, lessonId, user.sub, {
      checkedInAt: new Date(), status: 'attended',
    });
  } else {
    await attendanceRepo.upsert(tenantId, lessonId, user.sub, {
      tenantId, courseId: lesson.courseId, lessonId, userId: user.sub,
      source: 'self_checkin', status: 'attended', checkedInAt: new Date(),
    });
  }

  return { checkedIn: true };
}

// ── Instructor: start session ─────────────────────────────────────────────────
async function startSession(tenantId, lessonId, user) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  const lesson = await getLiveLesson(tenantId, lessonId);
  if (lesson.liveClass?.status === 'live') throw new AppError('Session is already live', 400);

  await Lesson.findByIdAndUpdate(lessonId, {
    $set: {
      'liveClass.status':       'live',
      'liveClass.liveStartedAt': new Date(),
      'liveClass.liveEndedAt':   null,
    },
  });

  // Notify enrolled students (fire and forget)
  try {
    const enrollments = await enrollmentRepo.findByCourse(tenantId, lesson.courseId.toString());
    const studentIds  = (enrollments ?? []).map(e => e.userId?.toString()).filter(Boolean);
    if (studentIds.length) {
      const notifySvc = require('../notification/notification.service');
      const pushSvc   = require('../../services/push/push.service');
      const tenantIdStr = tenantId.toString();

      await notifySvc.createBulk(tenantId, studentIds, {
        type: 'announcement',
        title: '🔴 Live session started',
        message: `"${lesson.title}" is now live. Join now!`,
        link: `/courses/${lesson.courseId}/learn?lessonId=${lessonId}`,
      });

      pushSvc.sendToUsers(tenantIdStr, studentIds, {
        title: '🔴 Session is live now!',
        body:  `"${lesson.title}" just started. Tap to join.`,
        url:   `/courses/${lesson.courseId}/learn?lessonId=${lessonId}`,
      }).catch(() => {});
    }
  } catch { /* non-critical */ }

  return { status: 'live' };
}

// ── Instructor: end session ───────────────────────────────────────────────────
async function endSession(tenantId, lessonId, user) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  const lesson = await getLiveLesson(tenantId, lessonId);

  const startedAt = lesson.liveClass?.liveStartedAt;
  const endedAt   = new Date();
  const duration  = startedAt
    ? Math.round((endedAt - new Date(startedAt)) / 60000)
    : null;

  await Lesson.findByIdAndUpdate(lessonId, {
    $set: {
      'liveClass.status':      'ended',
      'liveClass.liveEndedAt': endedAt,
    },
  });

  // Update any open join_button records with duration + leftAt
  const records = await attendanceRepo.listByLesson(tenantId, lessonId);
  for (const rec of records) {
    if (rec.source === 'join_button' && !rec.leftAt) {
      await attendanceRepo.updateById(rec._id, {
        leftAt: endedAt,
        durationMinutes: duration,
      });
    }
  }

  // Auto-fetch Zoom recording 30 minutes after session ends (gives Zoom time to process)
  const zoomMeetingId = lesson.liveClass?.zoomMeetingId;
  if (lesson.liveClass?.platform === 'zoom' && zoomMeetingId && !lesson.liveClass?.recordingUrl) {
    setImmediate(() => {
      const { zoomRecordingQueue } = require('../../jobs/queue');
      const THIRTY_MIN = 30 * 60 * 1000;
      zoomRecordingQueue().add(
        { type: 'zoom-recording-fetch', tenantId: tenantId.toString(), lessonId: lessonId.toString(), meetingId: zoomMeetingId },
        { delay: THIRTY_MIN, attempts: 5, backoff: { type: 'fixed', delay: 15 * 60 * 1000 }, jobId: `zoom-rec-${lessonId}`, removeOnComplete: true }
      ).catch(() => {});
    });
  }

  return { status: 'ended', durationMinutes: duration };
}

// ── Instructor: add / update recording URL ────────────────────────────────────
async function setRecording(tenantId, lessonId, user, { recordingUrl }) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);
  if (!recordingUrl?.trim())          throw new AppError('recordingUrl is required', 400);

  await getLiveLesson(tenantId, lessonId);
  await Lesson.findByIdAndUpdate(lessonId, {
    $set: { 'liveClass.recordingUrl': recordingUrl.trim() },
  });

  return { recordingUrl: recordingUrl.trim() };
}

// ── Instructor: get attendance report ─────────────────────────────────────────
async function getAttendanceReport(tenantId, lessonId, user) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  const lesson  = await getLiveLesson(tenantId, lessonId);
  const records = await attendanceRepo.listByLesson(tenantId, lessonId);

  // Enrolled student count for the course
  const enrollments = await enrollmentRepo.findByCourse(tenantId, lesson.courseId.toString());
  const totalEnrolled = (enrollments ?? []).filter(e => e.status === 'active').length;

  const attendedCount = records.filter(r => ['attended', 'partial'].includes(r.status)).length;

  return {
    lesson:       { _id: lesson._id, title: lesson.title, liveClass: lesson.liveClass },
    totalEnrolled,
    attendedCount,
    absentCount:  totalEnrolled - attendedCount,
    attendanceRate: totalEnrolled > 0 ? Math.round((attendedCount / totalEnrolled) * 100) : 0,
    records: records.map(r => ({
      _id:            r._id,
      user:           r.userId,
      source:         r.source,
      status:         r.status,
      joinedAt:       r.joinedAt,
      checkedInAt:    r.checkedInAt,
      durationMinutes: r.durationMinutes,
      overrideNote:   r.overrideNote,
    })),
  };
}

// ── Instructor: manually override a student's attendance ─────────────────────
async function overrideAttendance(tenantId, lessonId, studentId, user, { status, note }) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);
  if (!['attended', 'partial', 'absent'].includes(status))
    throw new AppError('status must be attended, partial, or absent', 400);

  const lesson  = await getLiveLesson(tenantId, lessonId);
  const student = await userRepo.findByIdRaw(studentId);
  if (!student) throw new AppError('Student not found', 404);

  const record = await attendanceRepo.upsert(tenantId, lessonId, studentId, {
    tenantId, courseId: lesson.courseId, lessonId, userId: studentId,
    source: 'manual', status,
    overriddenBy: user.sub, overrideNote: note || null,
  });

  return record;
}

module.exports = {
  getSession, recordJoin, selfCheckin,
  startSession, endSession, setRecording,
  getAttendanceReport, overrideAttendance,
};
