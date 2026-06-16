const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth.middleware');
const ctrl = require('./secureFile.controller');

// Token generation — requires a valid user JWT
router.get('/token', authenticate, ctrl.getFileToken);

// File streaming — the signed file token in the URL IS the credential
router.get('/serve/:token', ctrl.serveFile);

module.exports = router;
