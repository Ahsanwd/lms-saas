const router = require('express').Router();
const ctrl = require('./media.controller');
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');

router.use(authenticate);

router.get('/',      requirePermission('media:read'),   ctrl.listMedia);
router.delete('/:id', requirePermission('media:delete'), ctrl.deleteMedia);

module.exports = router;
