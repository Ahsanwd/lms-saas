const router = require('express').Router();
const ctrl   = require('./enrollmentLink.controller');
const { authenticate }    = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');

// ── Public (no auth, only tenant resolution needed) ───────────────────────────
router.get('/join/:token', ctrl.getPublic);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(authenticate);

router.post('/join/:token', requirePermission('enrollment:create'), ctrl.join);

router.get('/',    requirePermission('course:read'),   ctrl.list);
router.post('/',   requirePermission('course:manage'), ctrl.create);
router.delete('/:id', requirePermission('course:manage'), ctrl.remove);

module.exports = router;
