const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./bookmark.controller');

router.use(authenticate);

router.get('/',                    ctrl.list);
router.post('/:courseId',          ctrl.add);
router.delete('/:courseId',        ctrl.remove);
router.get('/:courseId/check',     ctrl.check);

module.exports = router;
