const tenantService = require('./tenant.service');
const { validateUpdateSettings, validateCustomDomain } = require('../../validators/tenant.validator');
const R = require('../../utils/response');

async function getMyTenant(req, res, next) {
  try {
    const tenant = await tenantService.getMyTenant(req.tenant.tenantId);
    R.success(res, { tenant });
  } catch (err) { next(err); }
}

async function updateSettings(req, res, next) {
  try {
    validateUpdateSettings(req.body);
    const tenant = await tenantService.updateSettings(req.tenant.tenantId, req.body);
    R.success(res, { tenant }, 'Settings updated');
  } catch (err) { next(err); }
}

async function setCustomDomain(req, res, next) {
  try {
    const { domain } = req.body;
    validateCustomDomain({ domain });
    const result = await tenantService.setCustomDomain(req.tenant.tenantId, domain);
    R.success(res, result, 'Custom domain set. Add the DNS record to verify.');
  } catch (err) { next(err); }
}

async function verifyCustomDomain(req, res, next) {
  try {
    const result = await tenantService.verifyCustomDomain(req.tenant.tenantId);
    R.success(res, result, result.verified ? 'Domain verified' : 'Verification pending');
  } catch (err) { next(err); }
}

async function removeCustomDomain(req, res, next) {
  try {
    await tenantService.removeCustomDomain(req.tenant.tenantId);
    R.success(res, {}, 'Custom domain removed');
  } catch (err) { next(err); }
}

async function getPlanInfo(req, res, next) {
  try {
    const data = await tenantService.getPlanInfo(req.tenant.tenantId);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function getStorageUsage(req, res, next) {
  try {
    const data = await tenantService.getStorageUsage(req.tenant.tenantId);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function getUsageSummary(req, res, next) {
  try {
    const limitGuardSvc = require('../../services/limitGuard/limitGuard.service');
    const data = await limitGuardSvc.getUsageSummary(req.tenant.tenantId, req.tenant.plan);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function uploadLogo(req, res, next) {
  try {
    if (!req.file) throw new Error('No file uploaded');
    const { getPublicUrl } = require('../../services/storage/storage.service');
    const Tenant = require('../../database/models/Tenant.model');
    const logoUrl = getPublicUrl(req.file.path);
    await Tenant.updateOne({ _id: req.tenant.tenantId }, { $set: { 'settings.logo': logoUrl } });
    R.success(res, { logoUrl }, 'Logo updated');
  } catch (err) { next(err); }
}

async function removeLogo(req, res, next) {
  try {
    const Tenant = require('../../database/models/Tenant.model');
    await Tenant.updateOne({ _id: req.tenant.tenantId }, { $set: { 'settings.logo': null } });
    R.success(res, {}, 'Logo removed');
  } catch (err) { next(err); }
}

async function uploadFavicon(req, res, next) {
  try {
    if (!req.file) throw new Error('No file uploaded');
    const { getPublicUrl } = require('../../services/storage/storage.service');
    const Tenant = require('../../database/models/Tenant.model');
    const faviconUrl = getPublicUrl(req.file.path);
    await Tenant.updateOne({ _id: req.tenant.tenantId }, { $set: { 'settings.favicon': faviconUrl } });
    R.success(res, { faviconUrl }, 'Favicon updated');
  } catch (err) { next(err); }
}

async function removeFavicon(req, res, next) {
  try {
    const Tenant = require('../../database/models/Tenant.model');
    await Tenant.updateOne({ _id: req.tenant.tenantId }, { $set: { 'settings.favicon': null } });
    R.success(res, {}, 'Favicon removed');
  } catch (err) { next(err); }
}

async function getFeatureFlags(req, res, next) {
  try {
    const flags = await tenantService.getFeatureFlags(req.tenant.tenantId);
    R.success(res, { featureFlags: flags });
  } catch (err) { next(err); }
}

async function updateFeatureFlags(req, res, next) {
  try {
    const flags = await tenantService.updateFeatureFlags(req.tenant.tenantId, req.body);
    R.success(res, { featureFlags: flags }, 'Feature flags updated');
  } catch (err) { next(err); }
}

async function getEmailSettings(req, res, next) {
  try {
    const data = await tenantService.getEmailSettings(req.tenant.tenantId);
    R.success(res, data);
  } catch (err) { next(err); }
}

async function saveEmailSettings(req, res, next) {
  try {
    const data = await tenantService.saveEmailSettings(req.tenant.tenantId, req.body);
    R.success(res, data, 'Email settings saved');
  } catch (err) { next(err); }
}

async function testEmailSmtp(req, res, next) {
  try {
    const result = await tenantService.testEmailSmtp(req.tenant.tenantId, req.body);
    R.success(res, result, result.message);
  } catch (err) { next(err); }
}

// ── Cloudflare Stream BYOK ────────────────────────────────────────────────────
async function getCfStreamSettings(req, res, next) {
  try {
    const Tenant = require('../../database/models/Tenant.model');
    const tenant = await Tenant.findById(req.tenant.tenantId).select('cloudflareStream').lean();
    const cf = tenant?.cloudflareStream || {};
    R.success(res, {
      enabled:      cf.enabled      ?? false,
      accountId:    cf.accountId    ?? null,
      signingKeyId: cf.signingKeyId ?? null,
      connected:    cf.enabled      && !!cf.accountId,
    });
  } catch (err) { next(err); }
}

async function saveCfStreamSettings(req, res, next) {
  try {
    const { accountId, apiToken, signingKeyId, signingKeyPem } = req.body;
    if (!accountId || !apiToken || !signingKeyId || !signingKeyPem)
      return R.error(res, 'accountId, apiToken, signingKeyId and signingKeyPem are required', 400);

    const cfSvc = require('../../services/cloudflareStream/cloudflareStream.service');
    const { encrypt } = cfSvc;

    // Validate credentials before saving
    try {
      await cfSvc.testConnection(accountId, apiToken);
    } catch {
      return R.error(res, 'Invalid Cloudflare credentials — could not connect to Cloudflare Stream API', 400);
    }

    const Tenant = require('../../database/models/Tenant.model');
    await Tenant.updateOne({ _id: req.tenant.tenantId }, {
      $set: {
        'cloudflareStream.enabled':      true,
        'cloudflareStream.accountId':    accountId.trim(),
        'cloudflareStream.apiTokenEnc':  encrypt(apiToken.trim()),
        'cloudflareStream.signingKeyId': signingKeyId.trim(),
        'cloudflareStream.signingKeyEnc':encrypt(signingKeyPem.trim()),
      },
    });
    R.success(res, { connected: true }, 'Cloudflare Stream connected successfully');
  } catch (err) { next(err); }
}

async function disconnectCfStream(req, res, next) {
  try {
    const Tenant = require('../../database/models/Tenant.model');
    await Tenant.updateOne({ _id: req.tenant.tenantId }, {
      $set: {
        'cloudflareStream.enabled':      false,
        'cloudflareStream.accountId':    null,
        'cloudflareStream.apiTokenEnc':  null,
        'cloudflareStream.signingKeyId': null,
        'cloudflareStream.signingKeyEnc':null,
      },
    });
    R.success(res, { connected: false }, 'Cloudflare Stream disconnected');
  } catch (err) { next(err); }
}

async function testCfStreamConnection(req, res, next) {
  try {
    const Tenant = require('../../database/models/Tenant.model');
    const tenant = await Tenant.findById(req.tenant.tenantId)
      .select('+cloudflareStream.apiTokenEnc cloudflareStream').lean();
    const cf = tenant?.cloudflareStream;
    if (!cf?.enabled || !cf.accountId || !cf.apiTokenEnc)
      return R.error(res, 'Cloudflare Stream not configured', 400);

    const cfSvc = require('../../services/cloudflareStream/cloudflareStream.service');
    const { decrypt } = cfSvc;
    const apiToken = decrypt(cf.apiTokenEnc);
    await cfSvc.testConnection(cf.accountId, apiToken);
    R.success(res, { ok: true }, 'Connection successful');
  } catch (err) { next(err); }
}

// ── Bunny.net Stream BYOK ─────────────────────────────────────────────────────
async function getBunnyStreamSettings(req, res, next) {
  try {
    const Tenant = require('../../database/models/Tenant.model');
    const tenant = await Tenant.findById(req.tenant.tenantId).select('bunnyStream').lean();
    const b = tenant?.bunnyStream || {};
    R.success(res, {
      enabled:     b.enabled     ?? false,
      libraryId:   b.libraryId   ?? null,
      cdnHostname: b.cdnHostname ?? null,
      connected:   !!(b.enabled && b.libraryId),
    });
  } catch (err) { next(err); }
}

async function saveBunnyStreamSettings(req, res, next) {
  try {
    const { libraryId, apiKey, cdnHostname, tokenAuthKey } = req.body;
    if (!libraryId || !apiKey)
      return R.error(res, 'libraryId and apiKey are required', 400);

    const bunnySvc = require('../../services/bunnyStream/bunnyStream.service');
    const { encrypt } = bunnySvc;

    try {
      await bunnySvc.testConnection(String(libraryId).trim(), apiKey.trim());
    } catch {
      return R.error(res, 'Invalid Bunny.net credentials — could not connect to Bunny.net API', 400);
    }

    const update = {
      'bunnyStream.enabled':      true,
      'bunnyStream.libraryId':    String(libraryId).trim(),
      'bunnyStream.apiKeyEnc':    encrypt(apiKey.trim()),
      'bunnyStream.cdnHostname':  cdnHostname?.trim() || null,
    };
    if (tokenAuthKey) update['bunnyStream.tokenAuthKeyEnc'] = encrypt(tokenAuthKey.trim());

    const Tenant = require('../../database/models/Tenant.model');
    await Tenant.updateOne({ _id: req.tenant.tenantId }, { $set: update });
    R.success(res, { connected: true }, 'Bunny.net Stream connected successfully');
  } catch (err) { next(err); }
}

async function disconnectBunnyStream(req, res, next) {
  try {
    const Tenant = require('../../database/models/Tenant.model');
    await Tenant.updateOne({ _id: req.tenant.tenantId }, {
      $set: {
        'bunnyStream.enabled':         false,
        'bunnyStream.libraryId':       null,
        'bunnyStream.apiKeyEnc':       null,
        'bunnyStream.cdnHostname':     null,
        'bunnyStream.tokenAuthKeyEnc': null,
      },
    });
    R.success(res, { connected: false }, 'Bunny.net Stream disconnected');
  } catch (err) { next(err); }
}

async function testBunnyStreamConnection(req, res, next) {
  try {
    const Tenant = require('../../database/models/Tenant.model');
    const tenant = await Tenant.findById(req.tenant.tenantId)
      .select('+bunnyStream.apiKeyEnc bunnyStream').lean();
    const b = tenant?.bunnyStream;
    if (!b?.enabled || !b.libraryId || !b.apiKeyEnc)
      return R.error(res, 'Bunny.net Stream not configured', 400);

    const bunnySvc = require('../../services/bunnyStream/bunnyStream.service');
    const apiKey = bunnySvc.decrypt(b.apiKeyEnc);
    await bunnySvc.testConnection(b.libraryId, apiKey);
    R.success(res, { ok: true }, 'Connection successful');
  } catch (err) { next(err); }
}

module.exports = {
  getMyTenant,
  updateSettings,
  setCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
  getPlanInfo,
  getStorageUsage,
  getUsageSummary,
  uploadLogo,
  removeLogo,
  uploadFavicon,
  removeFavicon,
  getFeatureFlags,
  updateFeatureFlags,
  getEmailSettings,
  saveEmailSettings,
  testEmailSmtp,
  getCfStreamSettings,
  saveCfStreamSettings,
  disconnectCfStream,
  testCfStreamConnection,
  getBunnyStreamSettings,
  saveBunnyStreamSettings,
  disconnectBunnyStream,
  testBunnyStreamConnection,
};
