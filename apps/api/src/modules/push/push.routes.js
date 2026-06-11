const router   = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const pushSvc  = require('../../services/push/push.service');
const AppError = require('../../utils/AppError');

// Public — frontend fetches this before the user logs in
router.get('/vapid-key', (req, res) => {
  const key = pushSvc.getPublicKey();
  if (!key) return res.json({ success: true, data: { key: null } });
  res.json({ success: true, data: { key } });
});

router.use(authenticate);

// Save a push subscription (called after browser grants permission)
router.post('/subscribe', async (req, res, next) => {
  try {
    const { endpoint, keys, userAgent } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth)
      throw new AppError('Invalid subscription object', 400);

    await pushSvc.subscribe(
      req.tenant.tenantId,
      req.user.sub,
      { endpoint, keys, userAgent: userAgent || req.headers['user-agent'] }
    );
    res.json({ success: true, data: { subscribed: true } });
  } catch (e) { next(e); }
});

// Remove a push subscription (user disabled notifications in browser)
router.delete('/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) throw new AppError('Endpoint required', 400);
    await pushSvc.unsubscribe(req.tenant.tenantId, req.user.sub, endpoint);
    res.json({ success: true, data: { unsubscribed: true } });
  } catch (e) { next(e); }
});

module.exports = router;
