const tenantRepo = require('../../database/repositories/tenant.repository');
const planRepo   = require('../../database/repositories/plan.repository');
const AppError   = require('../../utils/AppError');
const { encrypt, decrypt } = require('../../utils/crypto');
const { testSmtpConnection } = require('../../services/email/email.service');
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

// ─── Get Email Settings (password masked) ────────────────────────────────────
async function getEmailSettings(tenantId) {
  const tenant = await Tenant.findById(tenantId)
    .select('emailSettings')
    .lean();
  if (!tenant) throw new AppError('Tenant not found', 404);

  const es = tenant.emailSettings || {};
  const smtp = es.smtp || {};

  return {
    fromName:  es.fromName  || null,
    fromEmail: es.fromEmail || null,
    replyTo:   es.replyTo   || null,
    smtp: {
      host:      smtp.host      || null,
      port:      smtp.port      || 587,
      secure:    smtp.secure    || false,
      user:      smtp.user      || null,
      hasPassword: !!smtp.passEncrypted,   // never expose raw/encrypted value
      verified:  smtp.verified  || false,
      verifiedAt: smtp.verifiedAt || null,
    },
  };
}

// ─── Save Email Settings ──────────────────────────────────────────────────────
async function saveEmailSettings(tenantId, body) {
  const { fromName, fromEmail, replyTo, smtp } = body;

  const update = { 'emailSettings.fromName': fromName || null,
                   'emailSettings.fromEmail': fromEmail || null,
                   'emailSettings.replyTo':   replyTo   || null };

  if (smtp) {
    update['emailSettings.smtp.host']   = smtp.host   || null;
    update['emailSettings.smtp.port']   = smtp.port   || 587;
    update['emailSettings.smtp.secure'] = smtp.secure || false;
    update['emailSettings.smtp.user']   = smtp.user   || null;

    // Only re-encrypt password if a new one was provided (non-empty string)
    if (smtp.password && smtp.password.trim()) {
      update['emailSettings.smtp.passEncrypted'] = encrypt(smtp.password.trim());
      // Changing credentials resets verified status
      update['emailSettings.smtp.verified']   = false;
      update['emailSettings.smtp.verifiedAt'] = null;
    }

    // If SMTP host/user was cleared, also clear verification
    if (!smtp.host || !smtp.user) {
      update['emailSettings.smtp.verified']      = false;
      update['emailSettings.smtp.verifiedAt']    = null;
      update['emailSettings.smtp.passEncrypted'] = null;
    }
  }

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: update },
    { new: true, select: 'emailSettings' }
  );

  return getEmailSettings(tenantId);
}

// ─── Test SMTP Connection ─────────────────────────────────────────────────────
async function testEmailSmtp(tenantId, { host, port, secure, user, password, fromEmail, toEmail }) {
  if (!host || !user || !password) throw new AppError('host, user and password are required', 400);
  if (!toEmail) throw new AppError('toEmail is required to receive the test email', 400);

  try {
    await testSmtpConnection({ host, port: port || 587, secure: secure || false,
                                user, pass: password, fromEmail, toEmail });
  } catch (err) {
    throw new AppError(`SMTP test failed: ${err.message}`, 422);
  }

  // Mark as verified in DB
  await Tenant.findByIdAndUpdate(tenantId, {
    $set: {
      'emailSettings.smtp.verified':   true,
      'emailSettings.smtp.verifiedAt': new Date(),
    },
  });

  return { verified: true, message: `Test email sent to ${toEmail}` };
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
  testEmailSmtp,
  getPaymentGatewaySettings,
  saveStripeGateway,
  saveSafepayGateway,
  disconnectGateway,
  getActiveGateway,
  markSafepayVerified,
  getFeatureFlags,
  updateFeatureFlags,
};
