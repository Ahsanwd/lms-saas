const router = require('express').Router();
const ctrl = require('./websiteDesign.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/permission.middleware');

router.use(authenticate);

router.get('/', requireRole('tenant_admin'), ctrl.listDesigns);
router.post('/:id/apply', requireRole('tenant_admin'), ctrl.applyDesign);

module.exports = router;
