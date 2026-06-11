const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./zoom.controller');

router.use(authenticate);

router.get   ('/auth-url',                      ctrl.getAuthUrl);
router.post  ('/token',                         ctrl.exchangeToken);
router.get   ('/status',                        ctrl.getStatus);
router.delete('/disconnect',                    ctrl.disconnect);
router.post  ('/lessons/:lessonId/meeting',     ctrl.createMeetingForLesson);

module.exports = router;
