const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./live.controller');

router.use(authenticate);

// Student routes
router.get  ('/lessons/:lessonId/session',  ctrl.getSession);
router.post ('/lessons/:lessonId/join',     ctrl.recordJoin);
router.post ('/lessons/:lessonId/checkin',  ctrl.selfCheckin);

// Instructor / admin routes
router.patch('/lessons/:lessonId/start',              ctrl.startSession);
router.patch('/lessons/:lessonId/end',                ctrl.endSession);
router.put  ('/lessons/:lessonId/recording',          ctrl.setRecording);
router.get  ('/lessons/:lessonId/attendance',         ctrl.getAttendanceReport);
router.patch('/lessons/:lessonId/attendance/:userId', ctrl.overrideAttendance);

module.exports = router;
