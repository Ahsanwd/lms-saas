const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole }  = require('../../middlewares/permission.middleware');
const ctrl = require('./forum.controller');

router.use(authenticate);

// ── Course threads ────────────────────────────────────────────────────────────
router.get( '/courses/:courseId/threads', ctrl.listThreads);
router.post('/courses/:courseId/threads', ctrl.createThread);

// ── Thread actions ────────────────────────────────────────────────────────────
router.get   ('/threads/:threadId',            ctrl.getThread);
router.put   ('/threads/:threadId',            ctrl.editThread);
router.delete('/threads/:threadId',            ctrl.deleteThread);
router.patch ('/threads/:threadId/pin',        ctrl.pinThread);
router.patch ('/threads/:threadId/resolve',    ctrl.resolveThread);
router.patch ('/threads/:threadId/close',      ctrl.closeThread);
router.post  ('/threads/:threadId/like',       ctrl.likeThread);
router.post  ('/threads/:threadId/replies',    ctrl.createReply);
router.post  ('/threads/:threadId/subscribe',  ctrl.subscribeThread);
router.post  ('/threads/:threadId/unsubscribe',ctrl.unsubscribeThread);
router.post  ('/threads/:threadId/flag',       ctrl.flagThread);
router.delete('/threads/:threadId/flags',      requireRole('instructor', 'tenant_admin'), ctrl.clearThreadFlags);

// ── Reply actions ─────────────────────────────────────────────────────────────
router.put   ('/replies/:replyId',        ctrl.editReply);
router.delete('/replies/:replyId',        ctrl.deleteReply);
router.post  ('/replies/:replyId/like',   ctrl.likeReply);
router.patch ('/replies/:replyId/accept', ctrl.acceptReply);
router.post  ('/replies/:replyId/flag',   ctrl.flagReply);
router.delete('/replies/:replyId/flags',  requireRole('instructor', 'tenant_admin'), ctrl.clearReplyFlags);

// ── Admin / Moderator ─────────────────────────────────────────────────────────
router.get('/admin/threads', requireRole('tenant_admin'), ctrl.adminListThreads);
router.get('/admin/flagged', requireRole('instructor', 'tenant_admin'), ctrl.getFlaggedContent);

module.exports = router;
