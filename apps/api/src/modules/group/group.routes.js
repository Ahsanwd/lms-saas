const router = require('express').Router();
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const ctrl = require('./group.controller');

router.use(authenticate);
router.use(requirePermission('user:manage'));

// Group CRUD
router.get('/',               ctrl.list);
router.post('/',              ctrl.create);
router.get('/find-user',      ctrl.findUser);
router.patch('/:id',          ctrl.update);
router.delete('/:id',         ctrl.remove);

// Member management
router.post('/:id/members',   ctrl.addMembers);
router.delete('/:id/members', ctrl.removeMembers);

// Bulk enrollment
router.post('/:id/enroll',    ctrl.enrollInCourse);

// Group Chat
router.get('/:id/messages',   ctrl.listMessages);
router.post('/:id/messages',  ctrl.sendMessage);

// Group Announcements
router.get('/:id/announcements',              ctrl.listAnnouncements);
router.post('/:id/announcements',             ctrl.createAnnouncement);
router.delete('/:id/announcements/:annId',    ctrl.deleteAnnouncement);

module.exports = router;
