const router = require('express').Router();
const ctrl = require('./tenant.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole, requirePermission } = require('../../middlewares/permission.middleware');
const { upload } = require('../../services/storage/storage.service');

// Public — no auth needed (login/register/storefront pages fetch this for branding)
router.get('/branding', ctrl.getPublicBranding);

// All other tenant routes require authentication
router.use(authenticate);

router.get('/', ctrl.getMyTenant); // all authenticated users need basic tenant info (branding)
router.patch('/settings', requirePermission('settings:manage'), ctrl.updateSettings);
router.get('/plan', requirePermission('settings:read'), ctrl.getPlanInfo);
router.get('/storage', requirePermission('settings:read'), ctrl.getStorageUsage)
router.get('/usage',   requirePermission('settings:read'), ctrl.getUsageSummary)

router.post('/logo',    requirePermission('settings:manage'), upload('thumbnail').single('logo'),    ctrl.uploadLogo);
router.delete('/logo', requirePermission('settings:manage'), ctrl.removeLogo);
router.post('/favicon',    requirePermission('settings:manage'), upload('thumbnail').single('favicon'), ctrl.uploadFavicon);
router.delete('/favicon',  requirePermission('settings:manage'), ctrl.removeFavicon);

// Feature flags (tenant_admin only)
router.get('/feature-flags',   requireRole('tenant_admin'), ctrl.getFeatureFlags);
router.patch('/feature-flags', requireRole('tenant_admin'), ctrl.updateFeatureFlags);

router.post('/domain', requirePermission('settings:manage'), ctrl.setCustomDomain);
router.post('/domain/verify', requirePermission('settings:manage'), ctrl.verifyCustomDomain);
router.delete('/domain', requirePermission('settings:manage'), ctrl.removeCustomDomain);

// Email settings (tenant admin only)
router.get( '/email-settings',      requireRole('tenant_admin'), ctrl.getEmailSettings);
router.put( '/email-settings',      requireRole('tenant_admin'), ctrl.saveEmailSettings);
router.post('/email-settings/test', requireRole('tenant_admin'), ctrl.testEmailSmtp);

// Cloudflare Stream — shared platform-level account, any authenticated user can
// check availability (instructors need this when uploading lesson videos)
router.get('/cloudflare-stream/status', ctrl.getCfStreamStatus);

// Bunny.net Stream BYOK (tenant admin only)
router.get(   '/bunny-stream',      requireRole('tenant_admin'), ctrl.getBunnyStreamSettings);
router.post(  '/bunny-stream',      requireRole('tenant_admin'), ctrl.saveBunnyStreamSettings);
router.delete('/bunny-stream',      requireRole('tenant_admin'), ctrl.disconnectBunnyStream);
router.post(  '/bunny-stream/test', requireRole('tenant_admin'), ctrl.testBunnyStreamConnection);

module.exports = router;
