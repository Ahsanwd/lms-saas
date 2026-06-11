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
};
