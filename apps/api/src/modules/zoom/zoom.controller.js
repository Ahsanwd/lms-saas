const svc = require('./zoom.service');
const Lesson = require('../../database/models/Lesson.model');
const Course = require('../../database/models/Course.model');
const AppError = require('../../utils/AppError');

const tid = req => req.tenant.tenantId;
const ok  = (res, data, msg) => res.json({ success: true, data, ...(msg ? { message: msg } : {}) });

// Instructors manage their own personal Zoom account; tenant_admin/super_admin
// manage the tenant-wide fallback. Each role only ever touches its own scope
// server-side (never trusts a client-supplied scope) — see zoom.service.js.
const canManageZoom = role => role === 'instructor' || role === 'tenant_admin' || role === 'super_admin';
const scopeUserId = req => (req.user.role === 'instructor' ? req.user.sub : null);

// GET /api/zoom/auth-url  (instructor or tenant_admin)
exports.getAuthUrl = async (req, res, next) => {
  try {
    if (!canManageZoom(req.user.role))
      throw new AppError('Only instructors and organisation admins can connect a Zoom account', 403);
    const url = svc.getAuthUrl(tid(req), req.user.sub);
    ok(res, { url });
  } catch (e) { next(e); }
};

// POST /api/zoom/token  (instructor or tenant_admin)
// Body: { code, state }
exports.exchangeToken = async (req, res, next) => {
  try {
    if (!canManageZoom(req.user.role))
      throw new AppError('Only instructors and organisation admins can connect a Zoom account', 403);
    const { code, state } = req.body;
    if (!code || !state) throw new AppError('code and state are required', 400);
    const result = await svc.exchangeToken(code, state, req.user);
    ok(res, result, 'Zoom connected successfully');
  } catch (e) { next(e); }
};

// GET /api/zoom/status[?courseId=...]  (any authenticated user)
// Without courseId: the requesting user's own scope (their personal account
// if instructor, the tenant default if admin) — used by the Settings page.
// With courseId: the EFFECTIVE status for that course — whichever account
// would actually be used to create a meeting — used by the lesson editor.
exports.getStatus = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (courseId) {
      const course = await Course.findById(courseId).select('instructorId tenantId').lean();
      if (!course || course.tenantId.toString() !== tid(req).toString())
        throw new AppError('Course not found', 404);
      const status = await svc.getStatus(tid(req), { instructorId: course.instructorId });
      return ok(res, status);
    }
    const status = await svc.getStatus(tid(req), { userId: scopeUserId(req) });
    ok(res, status);
  } catch (e) { next(e); }
};

// DELETE /api/zoom/disconnect  (instructor or tenant_admin — own scope only)
exports.disconnect = async (req, res, next) => {
  try {
    if (!canManageZoom(req.user.role))
      throw new AppError('Only instructors and organisation admins can disconnect Zoom', 403);
    await svc.disconnect(tid(req), scopeUserId(req));
    ok(res, null, 'Zoom disconnected');
  } catch (e) { next(e); }
};

// POST /api/zoom/lessons/:lessonId/meeting  (instructor or tenant_admin)
// Creates a Zoom meeting for the lesson's course, preferring the course
// instructor's own connected account, falling back to the tenant's.
exports.createMeetingForLesson = async (req, res, next) => {
  try {
    if (!canManageZoom(req.user.role))
      throw new AppError('Forbidden', 403);

    const lesson = await Lesson.findOne({ _id: req.params.lessonId, tenantId: tid(req) });
    if (!lesson) throw new AppError('Lesson not found', 404);
    if (lesson.liveClass?.platform !== 'zoom') throw new AppError('Lesson platform is not Zoom', 400);

    const course = await Course.findById(lesson.courseId).select('instructorId').lean();

    const oldMeetingId = lesson.liveClass.zoomMeetingId;
    if (oldMeetingId) {
      await svc.deleteMeeting(tid(req), oldMeetingId, lesson.liveClass.zoomHostUserId).catch(() => {});
    }

    const meeting = await svc.createMeeting({
      tenantId: tid(req),
      instructorId: course?.instructorId ?? null,
      topic: lesson.title,
      startTime: lesson.liveClass.scheduledAt,
      durationMinutes: lesson.liveClass.durationMinutes,
    });

    lesson.liveClass.meetingUrl     = meeting.joinUrl;
    lesson.liveClass.zoomMeetingId  = meeting.meetingId;
    lesson.liveClass.zoomHostUserId = meeting.hostUserId;
    await lesson.save();

    ok(res, meeting, 'Zoom meeting created');
  } catch (e) { next(e); }
};
