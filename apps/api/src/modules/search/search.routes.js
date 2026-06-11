const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./search.controller');

router.use(authenticate);
router.get('/', ctrl.search);

module.exports = router;
