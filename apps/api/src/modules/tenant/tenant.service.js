const tenantRepo = require('../../database/repositories/tenant.repository');
const planRepo   = require('../../database/repositories/plan.repository');
const AppError   = require('../../utils/AppError');
const { encrypt, decrypt } = require('../../utils/crypto');
const { getTenantStripeClient } = require('../../services/stripe/stripe');
const Tenant = require('../../database/models/Tenant.model');

// ─── Get Own Tenant ───────────────────────────────────────────────────────────
async function getMyTenant(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);
  return tenant;
}

// ─── Update Settings ──────────────────────────────────────────────────────────
async function updateSettings(tenantId, updates) {
  const allowed = [
    'logo', 'favicon', 'primaryColor', 'secondaryColor', 'fontFamily', 'language', 'timezone',
    'allowSelfRegistration', 'requireEmailVerification', 'idleTimeoutMinutes',
    'passwordPolicy', 'defaultInviteExpiryHours',
    'currency', 'refundWindowDays', 'taxRate', 'taxLabel',
    'storefront',
  ];

  const settingsUpdate = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) settingsUpdate[`settings.${key}`] = updates[key];
  }

  if (!Object.keys(settingsUpdate).length)
    throw new AppError('No valid settings fields provided', 400);

  const tenant = await tenantRepo.updateById(tenantId, { $set: settingsUpdate });
  return tenant;
}

// ─── Set Custom Domain ────────────────────────────────────────────────────────
async function setCustomDomain(tenantId, domain) {
  const normalized = domain.toLowerCase().trim();

  // Ensure domain isn't already in use by another tenant
  const conflict = await tenantRepo.findByCustomDomain(normalized);
  if (conflict && conflict._id.toString() !== tenantId.toString())
    throw new AppError('This domain is already in use', 409);

  await tenantRepo.updateById(tenantId, {
    customDomain: normalized,
    customDomainVerified: false,
  });

  // Return DNS TXT record the user must add to verify ownership
  const verificationToken = Buffer.from(`lms-verify-${tenantId}`).toString('base64');
  return {
    domain: normalized,
    status: 'pending_verification',
    dnsRecord: {
      type: 'TXT',
      name: `_lms-verify.${normalized}`,
      value: verificationToken,
    },
    instructions: 'Add the TXT record to your DNS provider, then call POST /api/tenant/domain/verify',
  };
}

// ─── Verify Custom Domain ─────────────────────────────────────────────────────
async function verifyCustomDomain(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant?.customDomain)
    throw new AppError('No custom domain set', 400);
  if (tenant.customDomainVerified)
    return { verified: true, domain: tenant.customDomain };

  // In production: do a real DNS TXT lookup here via dns.promises.resolveTxt()
  // For now we mark verified — DNS check can be added as a background job
  await tenantRepo.updateById(tenantId, { customDomainVerified: true });
  return { verified: true, domain: tenant.customDomain };
}

// ─── Remove Custom Domain ─────────────────────────────────────────────────────
async function removeCustomDomain(tenantId) {
  await tenantRepo.updateById(tenantId, {
    customDomain: null,
    customDomainVerified: false,
  });
}

// ─── Plan Info ─────────────────────────────────────────────────────────────────
async function getPlanInfo(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);

  const plan = await planRepo.findById(tenant.plan);
  return {
    plan,
    isOnTrial: tenant.isOnTrial,
    trialEndsAt: tenant.trialEndsAt,
    planExpiresAt: tenant.planExpiresAt,
    status: tenant.status,
  };
}

// ─── Storage Usage ─────────────────────────────────────────────────────────────
async function getStorageUsage(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);

  const plan = await planRepo.findById(tenant.plan);
  const limitBytes = (plan?.limits?.storageGB || 5) * 1024 * 1024 * 1024;
  const usedBytes = tenant.storageUsedBytes || 0;

  return {
    usedBytes,
    usedGB: +(usedBytes / (1024 ** 3)).toFixed(2),
    limitGB: plan?.limits?.storageGB || 5,
    limitBytes,
    percentUsed: limitBytes > 0 ? +((usedBytes / limitBytes) * 100).toFixed(1) : 0,
  };
}

// ─── Get Email Settings ───────────────────────────────────────────────────────
async function getEmailSettings(tenantId) {
  const tenant = await Tenant.findById(tenantId)
    .select('emailSettings')
    .lean();
  if (!tenant) throw new AppError('Tenant not found', 404);

  const es = tenant.emailSettings || {};

  return {
    fromName:  es.fromName  || null,
    fromEmail: es.fromEmail || null,
    replyTo:   es.replyTo   || null,
  };
}

// ─── Save Email Settings ──────────────────────────────────────────────────────
async function saveEmailSettings(tenantId, body) {
  const { fromName, fromEmail, replyTo } = body;

  await Tenant.findByIdAndUpdate(tenantId, {
    $set: {
      'emailSettings.fromName':  fromName  || null,
      'emailSettings.fromEmail': fromEmail || null,
      'emailSettings.replyTo':   replyTo   || null,
    },
  });

  return getEmailSettings(tenantId);
}

// ─── Get Payment Gateway Settings (secrets masked) ────────────────────────────
async function getPaymentGatewaySettings(tenantId) {
  // Note: don't also select the parent 'paymentGateway' path here — mixing a whole-object
  // inclusion with a nested sub-path inclusion in the same projection makes MongoDB throw
  // "Path collision". Selecting just the two normally-excluded leaf paths with '+' already
  // returns the rest of the (non select:false) paymentGateway fields by default.
  const tenant = await Tenant.findById(tenantId)
    .select('+paymentGateway.stripe.secretKeyEncrypted +paymentGateway.safepay.secretKeyEncrypted')
    .lean();
  if (!tenant) throw new AppError('Tenant not found', 404);

  const pg      = tenant.paymentGateway || {};
  const stripe  = pg.stripe  || {};
  const safepay = pg.safepay || {};

  return {
    activeProvider: pg.activeProvider || null,
    stripe: {
      hasSecretKey:   !!stripe.secretKeyEncrypted,
      publishableKey: stripe.publishableKey || null,
      verified:       stripe.verified || false,
      verifiedAt:     stripe.verifiedAt || null,
    },
    safepay: {
      apiKey:       safepay.apiKey || null,
      hasSecretKey: !!safepay.secretKeyEncrypted,
      environment:  safepay.environment || 'sandbox',
      verified:     safepay.verified || false,
      verifiedAt:   safepay.verifiedAt || null,
    },
  };
}

// ─── Save Stripe Gateway ───────────────────────────────────────────────────────
async function saveStripeGateway(tenantId, { secretKey, publishableKey }) {
  const update = { 'paymentGateway.activeProvider': 'stripe' };
  if (publishableKey !== undefined) update['paymentGateway.stripe.publishableKey'] = publishableKey || null;

  // Only re-verify/re-encrypt if a new non-empty secret key was submitted
  if (secretKey && secretKey.trim()) {
    const client = getTenantStripeClient(secretKey.trim());
    try {
      await client.balance.retrieve();
    } catch (err) {
      throw new AppError(`Stripe key rejected: ${err.message}`, 422, 'STRIPE_KEY_INVALID');
    }
    update['paymentGateway.stripe.secretKeyEncrypted'] = encrypt(secretKey.trim());
    update['paymentGateway.stripe.verified']   = true;
    update['paymentGateway.stripe.verifiedAt'] = new Date();
  }

  await Tenant.findByIdAndUpdate(tenantId, { $set: update });
  return getPaymentGatewaySettings(tenantId);
}

// ─── Save Safepay Gateway ──────────────────────────────────────────────────────
// No live verification call here (avoids creating a stray tracker on Safepay's side) —
// `verified` flips true the first time a real payment through this tenant confirms
// successfully (see markSafepayVerified, called from payment.service.js).
async function saveSafepayGateway(tenantId, { apiKey, secretKey, environment }) {
  const update = {
    'paymentGateway.activeProvider':      'safepay',
    'paymentGateway.safepay.apiKey':      apiKey || null,
    'paymentGateway.safepay.environment': environment === 'production' ? 'production' : 'sandbox',
  };

  if (secretKey && secretKey.trim()) {
    update['paymentGateway.safepay.secretKeyEncrypted'] = encrypt(secretKey.trim());
    update['paymentGateway.safepay.verified']   = false;
    update['paymentGateway.safepay.verifiedAt'] = null;
  }

  await Tenant.findByIdAndUpdate(tenantId, { $set: update });
  return getPaymentGatewaySettings(tenantId);
}

// ─── Disconnect a Gateway ───────────────────────────────────────────────────────
async function disconnectGateway(tenantId, provider) {
  if (!['stripe', 'safepay'].includes(provider)) throw new AppError('Invalid provider', 400);

  const tenant = await Tenant.findById(tenantId).select('paymentGateway.activeProvider').lean();
  if (!tenant) throw new AppError('Tenant not found', 404);

  const update = provider === 'stripe'
    ? {
        'paymentGateway.stripe.secretKeyEncrypted': null,
        'paymentGateway.stripe.publishableKey':     null,
        'paymentGateway.stripe.verified':           false,
        'paymentGateway.stripe.verifiedAt':         null,
      }
    : {
        'paymentGateway.safepay.apiKey':             null,
        'paymentGateway.safepay.secretKeyEncrypted': null,
        'paymentGateway.safepay.verified':           false,
        'paymentGateway.safepay.verifiedAt':         null,
      };

  if (tenant.paymentGateway?.activeProvider === provider) {
    update['paymentGateway.activeProvider'] = null;
  }

  await Tenant.findByIdAndUpdate(tenantId, { $set: update });
  return getPaymentGatewaySettings(tenantId);
}

// ─── Internal: resolve tenant's active gateway with DECRYPTED credentials ─────
// Used only by payment.service.js server-side — never exposed over HTTP.
async function getActiveGateway(tenantId) {
  // Same projection-collision fix as getPaymentGatewaySettings above.
  const tenant = await Tenant.findById(tenantId)
    .select('+paymentGateway.stripe.secretKeyEncrypted +paymentGateway.safepay.secretKeyEncrypted')
    .lean();
  if (!tenant) return { provider: null };

  const pg = tenant.paymentGateway || {};

  if (pg.activeProvider === 'stripe' && pg.stripe?.secretKeyEncrypted) {
    return {
      provider:       'stripe',
      secretKey:      decrypt(pg.stripe.secretKeyEncrypted),
      publishableKey: pg.stripe.publishableKey || null,
    };
  }

  if (pg.activeProvider === 'safepay' && pg.safepay?.secretKeyEncrypted && pg.safepay?.apiKey) {
    return {
      provider:    'safepay',
      apiKey:      pg.safepay.apiKey,
      secretKey:   decrypt(pg.safepay.secretKeyEncrypted),
      environment: pg.safepay.environment || 'sandbox',
    };
  }

  return { provider: null };
}

// ─── Internal: flip Safepay verified flag after the tenant's first real payment ─
async function markSafepayVerified(tenantId) {
  await Tenant.findByIdAndUpdate(tenantId, {
    $set: { 'paymentGateway.safepay.verified': true, 'paymentGateway.safepay.verifiedAt': new Date() },
  });
}

// ─── Get Feature Flags ────────────────────────────────────────────────────────
async function getFeatureFlags(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);
  return tenant.settings?.featureFlags ?? {};
}

// ─── Update Feature Flags ──────────────────────────────────────────────────────
const VALID_FLAGS = ['liveClasses', 'certificates', 'assignments', 'announcements', 'payments', 'forums'];

async function updateFeatureFlags(tenantId, flags) {
  const update = {};
  for (const key of VALID_FLAGS) {
    if (typeof flags[key] === 'boolean') {
      update[`settings.featureFlags.${key}`] = flags[key];
    }
  }
  if (!Object.keys(update).length) throw new AppError('No valid feature flag fields provided', 400);
  const tenant = await tenantRepo.updateById(tenantId, { $set: update });
  return tenant.settings?.featureFlags ?? {};
}

// ─── Header / Footer Builder ───────────────────────────────────────────────────
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const MAX_MENU_OVERRIDES = 30;
const MAX_SOCIAL_LINKS = 6;
const SOCIAL_PLATFORMS = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok'];

const DEFAULT_HEADER = {
  logoHeightPx: 36, backgroundColor: '#ffffff', menuTextColor: '#4b5563',
  signInText: 'Sign in', signUpText: 'Sign up free', buttonStyle: 'solid', menuOverrides: [],
};
const DEFAULT_FOOTER = {
  backgroundColor: '#ffffff', textColor: '#9ca3af', tagline: null, copyrightText: null, socialLinks: [],
};

async function getHeaderFooterSettings(tenantId) {
  const tenant = await Tenant.findById(tenantId).select('settings.header settings.footer').lean();
  if (!tenant) throw new AppError('Tenant not found', 404);
  return {
    header: { ...DEFAULT_HEADER, ...(tenant.settings?.header || {}) },
    footer: { ...DEFAULT_FOOTER, ...(tenant.settings?.footer || {}) },
  };
}

// tenantRepo.updateById doesn't set runValidators, so — matching this
// codebase's established style (tenantPage.service.js's validateSections,
// quiz.service.js's validateQuestionStructure) — validate explicitly rather
// than relying on Mongoose schema validation to catch a bad enum/color/count.
function validateHeader(header) {
  if (header.backgroundColor !== undefined && !HEX_COLOR_RE.test(header.backgroundColor))
    throw new AppError('Header background color must be a hex color like #ffffff', 400);
  if (header.menuTextColor !== undefined && !HEX_COLOR_RE.test(header.menuTextColor))
    throw new AppError('Menu text color must be a hex color like #4b5563', 400);
  if (header.buttonStyle !== undefined && !['solid', 'outline'].includes(header.buttonStyle))
    throw new AppError('Invalid button style', 400);
  if (header.logoHeightPx !== undefined) {
    const h = Number(header.logoHeightPx);
    if (!Number.isFinite(h) || h < 20 || h > 80) throw new AppError('Logo height must be between 20 and 80px', 400);
  }
  if (header.signInText !== undefined && String(header.signInText).length > 30)
    throw new AppError('Sign in text is too long (max 30 characters)', 400);
  if (header.signUpText !== undefined && String(header.signUpText).length > 30)
    throw new AppError('Sign up text is too long (max 30 characters)', 400);
  if (header.menuOverrides !== undefined) {
    if (!Array.isArray(header.menuOverrides)) throw new AppError('menuOverrides must be an array', 400);
    if (header.menuOverrides.length > MAX_MENU_OVERRIDES)
      throw new AppError(`A maximum of ${MAX_MENU_OVERRIDES} menu items is allowed`, 400);
    for (const item of header.menuOverrides) {
      if (!item.pageSlug || typeof item.pageSlug !== 'string')
        throw new AppError('Each menu item needs a pageSlug', 400);
    }
  }
}

function validateFooter(footer) {
  if (footer.backgroundColor !== undefined && !HEX_COLOR_RE.test(footer.backgroundColor))
    throw new AppError('Footer background color must be a hex color like #ffffff', 400);
  if (footer.textColor !== undefined && !HEX_COLOR_RE.test(footer.textColor))
    throw new AppError('Footer text color must be a hex color like #9ca3af', 400);
  if (footer.tagline !== undefined && footer.tagline !== null && String(footer.tagline).length > 200)
    throw new AppError('Tagline is too long (max 200 characters)', 400);
  if (footer.copyrightText !== undefined && footer.copyrightText !== null && String(footer.copyrightText).length > 200)
    throw new AppError('Copyright text is too long (max 200 characters)', 400);
  if (footer.socialLinks !== undefined) {
    if (!Array.isArray(footer.socialLinks)) throw new AppError('socialLinks must be an array', 400);
    if (footer.socialLinks.length > MAX_SOCIAL_LINKS)
      throw new AppError(`A maximum of ${MAX_SOCIAL_LINKS} social links is allowed`, 400);
    for (const link of footer.socialLinks) {
      if (!SOCIAL_PLATFORMS.includes(link.platform))
        throw new AppError(`Invalid social platform "${link.platform}"`, 400);
      if (!link.url || typeof link.url !== 'string' || link.url.length > 500)
        throw new AppError('Each social link needs a valid URL', 400);
    }
  }
}

async function updateHeaderFooterSettings(tenantId, { header, footer }) {
  const update = {};
  if (header !== undefined) {
    validateHeader(header);
    update['settings.header'] = { ...DEFAULT_HEADER, ...header };
  }
  if (footer !== undefined) {
    validateFooter(footer);
    update['settings.footer'] = { ...DEFAULT_FOOTER, ...footer };
  }
  if (!Object.keys(update).length) throw new AppError('No valid header/footer fields provided', 400);

  await tenantRepo.updateById(tenantId, { $set: update });
  return getHeaderFooterSettings(tenantId);
}

// Website Builder website-content logic (getWebsiteContent/saveWebsiteContent/
// getPublicWebsiteContent) moved to ../tenantPage/tenantPage.service.js as of
// the multi-page builder migration (Phase 1a) — storage moved from
// Tenant.websiteContent to the TenantPage collection. tenant.controller.js's
// getWebsiteContent/saveWebsiteContent/getPublicWebsiteContent now call that
// module directly; the HTTP contract (routes, request/response shape) is
// unchanged.

module.exports = {
  getMyTenant,
  updateSettings,
  setCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
  getPlanInfo,
  getStorageUsage,
  getEmailSettings,
  saveEmailSettings,
  getPaymentGatewaySettings,
  saveStripeGateway,
  saveSafepayGateway,
  disconnectGateway,
  getActiveGateway,
  getHeaderFooterSettings,
  updateHeaderFooterSettings,
  markSafepayVerified,
  getFeatureFlags,
  updateFeatureFlags,
};
