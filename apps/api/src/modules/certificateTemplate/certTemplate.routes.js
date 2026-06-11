const router = require('express').Router();
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const { upload }            = require('../../services/storage/storage.service');
const ctrl = require('./certTemplate.controller');

router.use(authenticate);

// Public read — any authenticated user can read template (for certificate rendering)
router.get('/', ctrl.getTemplate);

// Write — only admins/instructors
router.post('/',         requirePermission('course:manage'), ctrl.saveTemplate);
router.delete('/reset',  requirePermission('course:manage'), ctrl.resetTemplate);
router.post('/logo',              requirePermission('course:manage'), upload('thumbnail').single('logo'),             ctrl.uploadLogo);
router.post('/background',       requirePermission('course:manage'), upload('thumbnail').single('background'),      ctrl.uploadBackground);
router.post('/signature',        requirePermission('course:manage'), upload('thumbnail').single('signature'),       ctrl.uploadSignature);
router.post('/second-signature', requirePermission('course:manage'), upload('thumbnail').single('secondSignature'),  ctrl.uploadSecondSignature);

module.exports = router;
