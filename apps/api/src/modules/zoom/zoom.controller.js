const svc = require('./zoom.service');
const Lesson = require('../../database/models/Lesson.model');
const AppError = require('../../utils/AppError');

const tid = req => req.tenant.tenantId;
const ok  = (res, data, msg) => res.json({ success: true, data, ...(msg ? { message: msg } : {}) });

// GET /api/zoom/auth-url  (tenant_admin only)
exports.getAuthUrl = async (req, res, next) => {
  try {
    if (req.user.role !== 'tenant_admin' && req.user.role !== 'super_admin')
      throw new AppError('Only organisation admins can connect a Zoom account', 403);
    const url = svc.getAuthUrl(tid(req), req.user.sub);
    ok(res, { url });
  } catch (e) { next(e); }
};

// POST /api/zoom/token  (tenant_admin only)
// Body: { code, state }
exports.exchangeToken = async (req, res, next) => {
  try {
    if (req.user.role !== 'tenant_admin' && req.user.role !== 'super_admin')
      throw new AppError('Only organisation admins can connect a Zoom account', 403);
    const { code, state } = req.body;
    if (!code || !state) throw new AppError('code and state are required', 400);
    const result = await svc.exchangeToken(code, state, req.user.sub);
    ok(res, result, 'Zoom connected successfully');
  } catch (e) { next(e); }
};

// GET /api/zoom/status  (any authenticated user — instructors need this to show status in lesson modal)
exports.getStatus = async (req, res, next) => {
  try {
    const status = await svc.getStatus(tid(req));
    ok(res, status);
  } catch (e) { next(e); }
};

// DELETE /api/zoom/disconnect  (tenant_admin only)
exports.disconnect = async (req, res, next) => {
  try {
    if (req.user.role !== 'tenant_admin' && req.user.role !== 'super_admin')
      throw new AppError('Only organisation admins can disconnect Zoom', 403);
    await svc.disconnect(tid(req));
    ok(res, null, 'Zoom disconnected');
  } catch (e) { next(e); }
};

// POST /api/zoom/lessons/:lessonId/meeting  (instructor or tenant_admin)
// Creates a Zoom meeting using the tenant's connected account and stores it on the lesson.
exports.createMeetingForLesson = async (req, res, next) => {
  try {
    const { role } = req.user;
    if (role !== 'instructor' && role !== 'tenant_admin' && role !== 'super_admin')
      throw new AppError('Forbidden', 403);

    const lesson = await Lesson.findOne({ _id: req.params.lessonId, tenantId: tid(req) });
    if (!lesson) throw new AppError('Lesson not found', 404);
    if (lesson.liveClass?.platform !== 'zoom') throw new AppError('Lesson platform is not Zoom', 400);

    const oldMeetingId = lesson.liveClass.zoomMeetingId;
    if (oldMeetingId) {
      await svc.deleteMeeting(tid(req), oldMeetingId).catch(() => {});
    }

    const meeting = await svc.createMeeting(tid(req), {
      topic: lesson.title,
      startTime: lesson.liveClass.scheduledAt,
      durationMinutes: lesson.liveClass.durationMinutes,
    });

    lesson.liveClass.meetingUrl    = meeting.joinUrl;
    lesson.liveClass.zoomMeetingId = meeting.meetingId;
    await lesson.save();

    ok(res, meeting, 'Zoom meeting created');
  } catch (e) { next(e); }
};
