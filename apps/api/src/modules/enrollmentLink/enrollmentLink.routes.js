const router = require('express').Router();
const ctrl   = require('./enrollmentLink.controller');
const { authenticate }    = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');

// ── Public (no auth, only tenant resolution needed) ───────────────────────────
router.get('/join/:token', ctrl.getPublic);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(authenticate);

router.post('/join/:token', requirePermission('enrollment:create'), ctrl.join);

// list was gated on course:read, which students also hold — any student
// could enumerate every enrollment link in the tenant, including its raw
// token, straight from this endpoint (confirmed live), letting them use
// any admin/instructor's free-enrollment link regardless of who it was
// actually meant for. create/delete already correctly require
// course:manage; list needs the same.
router.get('/',    requirePermission('course:manage'), ctrl.list);
router.post('/',   requirePermission('course:manage'), ctrl.create);
router.delete('/:id', requirePermission('course:manage'), ctrl.remove);

module.exports = router;
