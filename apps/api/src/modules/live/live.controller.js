const svc = require('./live.service');
const ok  = (res, data, msg) => res.json({ success: true, data, ...(msg ? { message: msg } : {}) });
const tid = req => req.tenant.tenantId;

exports.getSession          = async (req, res, next) => { try { ok(res, await svc.getSession(tid(req), req.params.lessonId, req.user)); } catch (e) { next(e); } };
exports.recordJoin          = async (req, res, next) => { try { ok(res, await svc.recordJoin(tid(req), req.params.lessonId, req.user)); } catch (e) { next(e); } };
exports.selfCheckin         = async (req, res, next) => { try { ok(res, await svc.selfCheckin(tid(req), req.params.lessonId, req.user)); } catch (e) { next(e); } };
exports.startSession        = async (req, res, next) => { try { ok(res, await svc.startSession(tid(req), req.params.lessonId, req.user), 'Session started'); } catch (e) { next(e); } };
exports.endSession          = async (req, res, next) => { try { ok(res, await svc.endSession(tid(req), req.params.lessonId, req.user), 'Session ended'); } catch (e) { next(e); } };
exports.setRecording        = async (req, res, next) => { try { ok(res, await svc.setRecording(tid(req), req.params.lessonId, req.user, req.body)); } catch (e) { next(e); } };
exports.getAttendanceReport = async (req, res, next) => { try { ok(res, await svc.getAttendanceReport(tid(req), req.params.lessonId, req.user)); } catch (e) { next(e); } };
exports.overrideAttendance  = async (req, res, next) => { try { ok(res, await svc.overrideAttendance(tid(req), req.params.lessonId, req.params.userId, req.user, req.body)); } catch (e) { next(e); } };
