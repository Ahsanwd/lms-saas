const router    = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../../middlewares/auth.middleware');
const { upload } = require('../../services/storage/storage.service');
const { trackMediaAsset } = require('../../middlewares/mediaTracking.middleware');
const ctrl = require('./chat.controller');

router.use(authenticate);

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many messages. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadChatFile = upload('chat').single('file');

// Unread count badge
router.get('/unread-count', ctrl.getUnreadCount);

// Conversations
router.get('/',    ctrl.listConversations);
router.post('/',   ctrl.startConversation);
router.get('/:id', ctrl.getConversation);
router.patch('/:id/close',  ctrl.closeConversation);
router.delete('/:id',       ctrl.deleteConversation);

// Messages within a conversation
router.get('/:id/messages',              ctrl.getMessages);
router.get('/:id/messages/search',       ctrl.searchMessages);
router.post('/:id/messages',             messageLimiter, uploadChatFile,
  trackMediaAsset('chat', req => ({ contextType: 'chat-message', contextId: req.params.id })),
  ctrl.sendMessage);
router.patch('/:id/messages/:msgId',     ctrl.editMessage);
router.delete('/:id/messages/:msgId',    ctrl.deleteMessage);

module.exports = router;
