const tenantRepo = require('../../database/repositories/tenant.repository');
const planRepo   = require('../../database/repositories/plan.repository');
const AppError   = require('../../utils/AppError');
const { encrypt, decrypt } = require('../../utils/crypto');
const { getTenantStripeClient } = require('../../services/stripe/stripe');
const paypalService = require('../../services/paypal/paypal');
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function saveEmailSettings(tenantId, body) {
  const { fromName, fromEmail, replyTo } = body;

  // Had no format validation at all — fromEmail becomes the literal SMTP
  // "From:" header for every email this tenant sends (email.service.js's
  // resolveFrom()), so any garbage string here would break outbound email
  // delivery tenant-wide with no clear error pointing back to this field.
  // Confirmed live: 'not-an-email-at-all' saved without complaint.
  if (fromEmail && !EMAIL_RE.test(fromEmail))
    throw new AppError('From email must be a valid email address', 400);
  if (replyTo && !EMAIL_RE.test(replyTo))
    throw new AppError('Reply-to email must be a valid email address', 400);

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
    .select('+paymentGateway.stripe.secretKeyEncrypted +paymentGateway.safepay.secretKeyEncrypted +paymentGateway.paypal.clientSecretEncrypted')
    .lean();
  if (!tenant) throw new AppError('Tenant not found', 404);

  const pg      = tenant.paymentGateway || {};
  const stripe  = pg.stripe  || {};
  const safepay = pg.safepay || {};
  const manual  = pg.manual  || {};
  const paypal  = pg.paypal  || {};
  const wise    = pg.wise    || {};

  return {
    activeProvider: pg.activeProvider || null,
    stripe: {
      hasSecretKey:   !!stripe.secretKeyEncrypted,
      publishableKey: stripe.publishableKey || null,
      verified:       stripe.verified || false,
      verifiedAt:     stripe.verifiedAt || null,
    },
    // Legacy — Safepay is no longer a usable gateway (see the note on
    // Tenant.model.js's paymentGateway.safepay field). Kept here only so a
    // tenant that had it configured can still see + clear the old setting.
    safepay: {
      apiKey:       safepay.apiKey || null,
      hasSecretKey: !!safepay.secretKeyEncrypted,
      environment:  safepay.environment || 'sandbox',
      verified:     safepay.verified || false,
      verifiedAt:   safepay.verifiedAt || null,
    },
    manual: {
      accounts:     manual.accounts || [],
      instructions: manual.instructions || null,
    },
    paypal: {
      clientId:       paypal.clientId || null,
      hasClientSecret: !!paypal.clientSecretEncrypted,
      mode:           paypal.mode || 'sandbox',
      verified:       paypal.verified || false,
      verifiedAt:     paypal.verifiedAt || null,
    },
    wise: {
      accountHolderName: wise.accountHolderName || null,
      email:              wise.email || null,
      iban:               wise.iban || null,
      swiftBic:           wise.swiftBic || null,
      accountNumber:      wise.accountNumber || null,
      instructions:       wise.instructions || null,
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

const MANUAL_ACCOUNT_TYPES = ['bank', 'jazzcash', 'easypaisa'];

// ─── Save Manual Payment Gateway ───────────────────────────────────────────────
// Tenant publishes their own bank/JazzCash/EasyPaisa account details for
// students to pay into directly. No secrets here (account numbers, not
// credentials) so nothing is encrypted, and there's no API to live-verify against.
async function saveManualGateway(tenantId, { accounts, instructions }) {
  if (!Array.isArray(accounts) || accounts.length === 0)
    throw new AppError('At least one payment account is required', 400);

  for (const acc of accounts) {
    if (!MANUAL_ACCOUNT_TYPES.includes(acc.type))
      throw new AppError('Invalid account type', 400);
    if (!acc.accountTitle?.trim() || !acc.accountNumber?.trim())
      throw new AppError('Account title and number are required for every account', 400);
    if (acc.type === 'bank' && !acc.bankName?.trim())
      throw new AppError('Bank name is required for bank transfer accounts', 400);
  }

  const cleanAccounts = accounts.map(acc => ({
    type:          acc.type,
    label:         acc.label?.trim() || null,
    accountTitle:  acc.accountTitle.trim(),
    accountNumber: acc.accountNumber.trim(),
    bankName:      acc.type === 'bank' ? acc.bankName.trim() : null,
  }));

  await Tenant.findByIdAndUpdate(tenantId, {
    $set: {
      'paymentGateway.activeProvider':      'manual',
      'paymentGateway.manual.accounts':     cleanAccounts,
      'paymentGateway.manual.instructions': instructions?.trim() || null,
    },
  });
  return getPaymentGatewaySettings(tenantId);
}

// ─── Save PayPal Gateway ───────────────────────────────────────────────────────
// clientId + secret identify the tenant's own PayPal Business "app" (BYO,
// like Stripe above) — verified by actually requesting an OAuth token before
// saving, same "reject bad credentials up front" approach as Stripe.
async function savePaypalGateway(tenantId, { clientId, clientSecret, mode }) {
  if (!clientId?.trim()) throw new AppError('Client ID is required', 400);
  const resolvedMode = mode === 'live' ? 'live' : 'sandbox';

  const update = {
    'paymentGateway.activeProvider': 'paypal',
    'paymentGateway.paypal.clientId': clientId.trim(),
    'paymentGateway.paypal.mode': resolvedMode,
  };

  // Only re-verify/re-encrypt if a new non-empty secret was submitted
  if (clientSecret && clientSecret.trim()) {
    try {
      await paypalService.getAccessToken(clientId.trim(), clientSecret.trim(), resolvedMode);
    } catch (err) {
      throw new AppError(`PayPal credentials rejected: ${err.message}`, 422, 'PAYPAL_KEY_INVALID');
    }
    update['paymentGateway.paypal.clientSecretEncrypted'] = encrypt(clientSecret.trim());
    update['paymentGateway.paypal.verified']   = true;
    update['paymentGateway.paypal.verifiedAt'] = new Date();
  }

  await Tenant.findByIdAndUpdate(tenantId, { $set: update });
  return getPaymentGatewaySettings(tenantId);
}

// ─── Save Wise Gateway ──────────────────────────────────────────────────────────
// Same shape as Manual: tenant publishes their own Wise account details;
// student pays externally and uploads a screenshot as proof. No secrets, no
// live API to verify against (Wise has no usable one-off checkout API).
async function saveWiseGateway(tenantId, { accountHolderName, email, iban, swiftBic, accountNumber, instructions }) {
  if (!accountHolderName?.trim()) throw new AppError('Account holder name is required', 400);
  if (!email?.trim() && !iban?.trim() && !accountNumber?.trim())
    throw new AppError('Provide at least one way for students to send payment (email, IBAN, or account number)', 400);

  await Tenant.findByIdAndUpdate(tenantId, {
    $set: {
      'paymentGateway.activeProvider':          'wise',
      'paymentGateway.wise.accountHolderName':  accountHolderName.trim(),
      'paymentGateway.wise.email':               email?.trim() || null,
      'paymentGateway.wise.iban':                iban?.trim() || null,
      'paymentGateway.wise.swiftBic':            swiftBic?.trim() || null,
      'paymentGateway.wise.accountNumber':       accountNumber?.trim() || null,
      'paymentGateway.wise.instructions':        instructions?.trim() || null,
    },
  });
  return getPaymentGatewaySettings(tenantId);
}

// ─── Disconnect a Gateway ───────────────────────────────────────────────────────
async function disconnectGateway(tenantId, provider) {
  if (!['stripe', 'safepay', 'manual', 'paypal', 'wise'].includes(provider)) throw new AppError('Invalid provider', 400);

  const tenant = await Tenant.findById(tenantId).select('paymentGateway.activeProvider').lean();
  if (!tenant) throw new AppError('Tenant not found', 404);

  let update;
  if (provider === 'stripe') {
    update = {
      'paymentGateway.stripe.secretKeyEncrypted': null,
      'paymentGateway.stripe.publishableKey':     null,
      'paymentGateway.stripe.verified':           false,
      'paymentGateway.stripe.verifiedAt':         null,
    };
  } else if (provider === 'manual') {
    update = {
      'paymentGateway.manual.accounts':     [],
      'paymentGateway.manual.instructions': null,
    };
  } else if (provider === 'paypal') {
    update = {
      'paymentGateway.paypal.clientId':              null,
      'paymentGateway.paypal.clientSecretEncrypted': null,
      'paymentGateway.paypal.verified':              false,
      'paymentGateway.paypal.verifiedAt':            null,
    };
  } else if (provider === 'wise') {
    update = {
      'paymentGateway.wise.accountHolderName': null,
      'paymentGateway.wise.email':              null,
      'paymentGateway.wise.iban':               null,
      'paymentGateway.wise.swiftBic':            null,
      'paymentGateway.wise.accountNumber':      null,
      'paymentGateway.wise.instructions':       null,
    };
  } else {
    update = {
      'paymentGateway.safepay.apiKey':             null,
      'paymentGateway.safepay.secretKeyEncrypted': null,
      'paymentGateway.safepay.verified':           false,
      'paymentGateway.safepay.verifiedAt':         null,
    };
  }

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
    .select('+paymentGateway.stripe.secretKeyEncrypted +paymentGateway.safepay.secretKeyEncrypted +paymentGateway.paypal.clientSecretEncrypted')
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

  if (pg.activeProvider === 'paypal' && pg.paypal?.clientId && pg.paypal?.clientSecretEncrypted) {
    return {
      provider:     'paypal',
      clientId:     pg.paypal.clientId,
      clientSecret: decrypt(pg.paypal.clientSecretEncrypted),
      mode:         pg.paypal.mode || 'sandbox',
    };
  }

  if (pg.activeProvider === 'wise' && (pg.wise?.email || pg.wise?.iban || pg.wise?.accountNumber)) {
    return {
      provider: 'wise',
      account: {
        accountHolderName: pg.wise.accountHolderName || null,
        email:              pg.wise.email || null,
        iban:               pg.wise.iban || null,
        swiftBic:           pg.wise.swiftBic || null,
        accountNumber:      pg.wise.accountNumber || null,
      },
      instructions: pg.wise.instructions || null,
    };
  }

  // Legacy — Safepay is no longer a usable gateway (nothing downstream acts on
  // provider:'safepay' anymore), but this branch is left returning its shape
  // for symmetry/debuggability rather than silently falling through.
  if (pg.activeProvider === 'safepay' && pg.safepay?.secretKeyEncrypted && pg.safepay?.apiKey) {
    return {
      provider:    'safepay',
      apiKey:      pg.safepay.apiKey,
      secretKey:   decrypt(pg.safepay.secretKeyEncrypted),
      environment: pg.safepay.environment || 'sandbox',
    };
  }

  if (pg.activeProvider === 'manual' && pg.manual?.accounts?.length) {
    return {
      provider:     'manual',
      accounts:     pg.manual.accounts,
      instructions: pg.manual.instructions || null,
    };
  }

  return { provider: null };
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

// Same per-field cap as tenantPage.service.js's page-level Custom Code
// sections — this is the same Mixed-typed, schema-unvalidated shape, just
// stored on the tenant's header/footer settings instead of a page section.
const MAX_CUSTOM_CODE_CHARS = 100_000;

const DEFAULT_CUSTOM_CODE = { html: '', css: '', js: '', heightPx: 80, isEnabled: false };

const DEFAULT_HEADER = {
  logoHeightPx: 36, backgroundColor: '#ffffff', menuTextColor: '#4b5563',
  signInText: 'Sign in', signUpText: 'Sign up free', buttonStyle: 'solid', menuOverrides: [],
  customCode: DEFAULT_CUSTOM_CODE,
};
const DEFAULT_FOOTER = {
  backgroundColor: '#ffffff', textColor: '#9ca3af', tagline: null, copyrightText: null, socialLinks: [],
  customCode: { ...DEFAULT_CUSTOM_CODE, heightPx: 150 },
};

// Shared by validateHeader/validateFooter — same emptiness/size rules as
// tenantPage.service.js's page-level Custom Code section validation.
function validateCustomCode(customCode, label) {
  if (customCode === undefined) return;
  if (typeof customCode !== 'object' || customCode === null) throw new AppError(`Invalid ${label} custom code`, 400);
  const { html = '', css = '', js = '', heightPx = 80 } = customCode;
  for (const [field, value] of Object.entries({ html, css, js })) {
    if (String(value).length > MAX_CUSTOM_CODE_CHARS)
      throw new AppError(`${label} custom code ${field} exceeds the ${MAX_CUSTOM_CODE_CHARS.toLocaleString()} character limit`, 400);
  }
  const h = Number(heightPx);
  if (!Number.isFinite(h) || h < 20 || h > 2000) throw new AppError(`${label} custom code height must be between 20 and 2000px`, 400);
}

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
  validateCustomCode(header.customCode, 'Header');
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
  validateCustomCode(footer.customCode, 'Footer');
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
  saveManualGateway,
  savePaypalGateway,
  saveWiseGateway,
  disconnectGateway,
  getActiveGateway,
  getHeaderFooterSettings,
  updateHeaderFooterSettings,
  getFeatureFlags,
  updateFeatureFlags,
};
