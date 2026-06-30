const AppError = require('../utils/AppError');

function validateUpdateSettings(body) {
  const { primaryColor, secondaryColor, idleTimeoutMinutes } = body;
  if (primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(primaryColor))
    throw new AppError('Invalid color format. Use hex e.g. #3B82F6', 400);
  if (secondaryColor && !/^#[0-9A-Fa-f]{6}$/.test(secondaryColor))
    throw new AppError('Invalid color format. Use hex e.g. #8B5CF6', 400);
  if (idleTimeoutMinutes !== undefined && (isNaN(idleTimeoutMinutes) || idleTimeoutMinutes < 0))
    throw new AppError('idleTimeoutMinutes must be a non-negative number', 400);
  if (body.defaultInviteExpiryHours !== undefined) {
    const h = body.defaultInviteExpiryHours;
    if (!Number.isInteger(h) || h < 1 || h > 720)
      throw new AppError('defaultInviteExpiryHours must be an integer between 1 and 720', 400);
  }
}

function validateCustomDomain({ domain }) {
  if (!domain?.trim()) throw new AppError('Domain is required', 400);
  if (!/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/.test(domain.toLowerCase()))
    throw new AppError('Invalid domain format', 400);
}

function validateCreateTenant({ name, subdomain, contactEmail, planId }) {
  if (!name?.trim()) throw new AppError('Name is required', 400);
  if (!subdomain?.trim()) throw new AppError('Subdomain is required', 400);
  if (!/^[a-z0-9-]+$/.test(subdomain))
    throw new AppError('Subdomain may only contain lowercase letters, numbers and hyphens', 400);
  if (!contactEmail?.trim()) throw new AppError('Contact email is required', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    throw new AppError('Invalid contact email', 400);
  if (!planId) throw new AppError('Plan ID is required', 400);
}

module.exports = { validateUpdateSettings, validateCustomDomain, validateCreateTenant };
