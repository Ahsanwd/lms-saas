const router = require('express').Router();
const ctrl   = require('./assignmentTemplate.controller');
const { authenticate }      = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');

router.use(authenticate);

router.get('/',    requirePermission('assignment:manage'), ctrl.listTemplates);
router.post('/',   requirePermission('assignment:manage'), ctrl.createTemplate);
router.delete('/:id', requirePermission('assignment:manage'), ctrl.deleteTemplate);

// Save a template from an existing assignment
router.post('/from-assignment/:assignmentId',
  requirePermission('assignment:manage'), ctrl.createFromAssignment);

module.exports = router;
