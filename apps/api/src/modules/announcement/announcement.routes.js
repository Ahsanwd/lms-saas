const router = require('express').Router();
const ctrl = require('./announcement.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');

router.use(authenticate);

router.get('/',    requirePermission('announcement:read'),   ctrl.listAnnouncements);
router.post('/',   requirePermission('announcement:create'), ctrl.createAnnouncement);
router.get('/:id', requirePermission('announcement:read'),   ctrl.getAnnouncement);
router.patch('/:id',          requirePermission('announcement:update'), ctrl.updateAnnouncement);
router.patch('/:id/publish',  requirePermission('announcement:update'), ctrl.publishAnnouncement);
router.patch('/:id/unpublish',requirePermission('announcement:update'), ctrl.unpublishAnnouncement);
router.delete('/:id',         requirePermission('announcement:delete'), ctrl.deleteAnnouncement);

module.exports = router;
