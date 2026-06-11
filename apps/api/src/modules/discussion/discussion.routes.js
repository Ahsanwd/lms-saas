const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./discussion.controller');

router.use(authenticate);

// Lesson-scoped — list & create top-level posts
router.get('/lesson/:lessonId',  ctrl.list);
router.post('/lesson/:lessonId', ctrl.post);

// Post-level actions
router.post('/:id/reply',   ctrl.reply);
router.patch('/:id',        ctrl.edit);
router.delete('/:id',       ctrl.remove);
router.patch('/:id/resolve', ctrl.resolve);
router.patch('/:id/pin',    ctrl.pin);
router.post('/:id/upvote',  ctrl.upvote);

module.exports = router;
