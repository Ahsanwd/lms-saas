// Tenant-facing billing service — read-only + coupon validation + self-service upgrade
const subscriptionRepo = require('../../database/repositories/subscription.repository');
const invoiceRepo      = require('../../database/repositories/invoice.repository');
const couponRepo       = require('../../database/repositories/coupon.repository');
const planRepo         = require('../../database/repositories/plan.repository');
const tenantRepo       = require('../../database/repositories/tenant.repository');
const { generateInvoiceNumber } = require('../../utils/invoiceNumber');
const { getStripe }          = require('../../services/stripe/stripe');
const { emitBillingUpdated } = require('../../services/socket/io');
const AppError               = require('../../utils/AppError');

async function getMySubscription(tenantId) {
  const sub = await subscriptionRepo.findByTenant(tenantId);
  if (!sub) throw new AppError('No active subscription found', 404);
  return sub;
}

async function getMyInvoices(tenantId, query) {
  const { status, page, limit } = query;
  const filter = status ? { status } : {};
  const [invoices, total] = await invoiceRepo.findByTenant(tenantId, filter, { page, limit });
  return { invoices, pagination: { total, page: Number(page || 1), limit: Number(limit || 20) } };
}

async function getInvoice(tenantId, invoiceId) {
  const invoice = await invoiceRepo.findById(invoiceId);
  if (!invoice || invoice.tenantId._id.toString() !== tenantId.toString())
    throw new AppError('Invoice not found', 404);
  return invoice;
}

async function getAvailablePlans() {
  return planRepo.findAll();
}

async function validateCoupon(tenantId, code, planId) {
  const coupon = await couponRepo.findByCode(code);
  if (!coupon || !coupon.isActive) throw new AppError('Invalid or inactive coupon', 400, 'INVALID_COUPON');

  if (coupon.expiresAt && new Date() > coupon.expiresAt)
    throw new AppError('Coupon has expired', 400, 'COUPON_EXPIRED');

  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)
    throw new AppError('Coupon usage limit reached', 400, 'COUPON_EXHAUSTED');

  if (coupon.onePerTenant && coupon.usedByTenants.some(t => t.toString() === tenantId.toString()))
    throw new AppError('You have already used this coupon', 400, 'COUPON_ALREADY_USED');

  if (coupon.applicablePlans.length > 0) {
    const applicable = coupon.applicablePlans.some(p => p.toString() === planId);
    if (!applicable) throw new AppError('Coupon is not valid for this plan', 400);
  }

  return {
    couponId: coupon._id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    description: coupon.description,
  };
}

// ── Self-service plan upgrade ─────────────────────────────────────────────────
// Flow when Stripe is configured and total > 0:
//   1. Create invoice (status: 'unpaid') + Stripe PaymentIntent
//   2. Return clientSecret — subscription is NOT activated yet
//   3. Frontend confirms card → calls confirmSubscriptionPayment()
//   4. confirmSubscriptionPayment() verifies PI + activates subscription
//
// Flow when total = 0 (free plan or full coupon discount):
//   Activate subscription immediately (no payment needed).
async function upgradePlan(tenantId, { planId, billingCycle, couponCode }) {
  const [sub, newPlan, tenant] = await Promise.all([
    subscriptionRepo.findByTenant(tenantId),
    planRepo.findById(planId),
    tenantRepo.findById(tenantId),
  ]);
  const currency = (tenant?.settings?.currency || 'USD').toLowerCase();

  if (!newPlan) throw new AppError('Plan not found', 404);
  if (sub && sub.status === 'active' && sub.planId?._id?.toString() === planId)
    throw new AppError('You are already on this plan', 400);

  const cycle = billingCycle || (sub?.billingCycle ?? 'monthly');
  const subtotal = cycle === 'yearly' ? newPlan.price.yearly : newPlan.price.monthly;

  let coupon = null;
  let discountAmount = 0;
  if (couponCode) {
    coupon = await couponRepo.findByCode(couponCode);
    if (!coupon || !coupon.isActive) throw new AppError('Invalid coupon code', 400);
    if (coupon.expiresAt && new Date() > coupon.expiresAt) throw new AppError('Coupon has expired', 400);
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) throw new AppError('Coupon usage limit reached', 400);
    if (coupon.onePerTenant && coupon.usedByTenants?.some(t => t.toString() === tenantId.toString()))
      throw new AppError('You have already used this coupon', 400);
    if (coupon.applicablePlans?.length > 0 && !coupon.applicablePlans.some(p => p.toString() === planId))
      throw new AppError('Coupon is not valid for this plan', 400);
    discountAmount = coupon.discountType === 'percentage'
      ? Math.round((subtotal * coupon.discountValue) / 100)
      : Math.min(coupon.discountValue, subtotal);
  }

  const discountedTotal = Math.max(0, subtotal - discountAmount);
  const taxRate   = tenant?.settings?.taxRate  || 0;
  const taxLabel  = tenant?.settings?.taxLabel || 'Tax';
  // taxAmount rounded to 2 decimal places: e.g. $99 × 20% = $19.80
  const taxAmount = taxRate > 0 ? Math.round(discountedTotal * taxRate) / 100 : 0;
  const total     = discountedTotal + taxAmount;
  const now = new Date();
  const periodEnd = new Date(now);
  if (cycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const invoice = await invoiceRepo.create({
    tenantId,
    subscriptionId: sub?._id || null,
    planId,
    invoiceNumber: generateInvoiceNumber(),
    billingCycle: cycle,
    periodStart: now,
    periodEnd,
    currency,
    subtotal,
    discountAmount,
    taxRate,
    taxLabel,
    taxAmount,
    total,
    couponId:   coupon?._id  || null,
    couponCode: coupon?.code || null,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    description: `${newPlan.name} plan (${cycle})`,
    status: 'unpaid',
  });

  // If payment is required, create a Stripe PaymentIntent and return the clientSecret.
  // The subscription activation is deferred to confirmSubscriptionPayment().
  const stripe = getStripe();
  if (total > 0 && stripe) {
    // Ensure this tenant has a Stripe Customer (created once, reused across payments)
    let customerId = sub?.stripeCustomerId || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name:     tenant?.name || tenantId.toString(),
        metadata: { tenantId: tenantId.toString() },
      });
      customerId = customer.id;
      if (sub) await subscriptionRepo.updateById(sub._id, { stripeCustomerId: customerId });
    }

    const intent = await stripe.paymentIntents.create({
      amount:              Math.round(total * 100), // major unit → minor unit (cents)
      currency,
      customer:            customerId,
      setup_future_usage:  'off_session', // save payment method to customer after success
      metadata: {
        type:      'subscription_upgrade',
        invoiceId: invoice._id.toString(),
        tenantId:  tenantId.toString(),
        planId,
        cycle,
      },
      automatic_payment_methods: { enabled: true },
    });

    // Store the PI id on the invoice for webhook reconciliation
    await invoiceRepo.updateById(invoice._id, { stripePaymentIntentId: intent.id });

    return {
      invoice,
      plan: newPlan,
      clientSecret:    intent.client_secret,
      requiresPayment: true,
    };
  }

  // Free plan or total=0 (full coupon discount) — activate immediately
  await _activateSubscription({ sub, tenantId, planId, cycle, now, periodEnd, coupon, invoice });

  return { invoice, plan: newPlan, requiresPayment: false };
}

// ── Confirm subscription payment (called by frontend after Stripe card confirm) ─
async function confirmSubscriptionPayment(tenantId, paymentIntentId) {
  const stripe = getStripe();
  if (!stripe) throw new AppError('Stripe not configured', 500);

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== 'succeeded') throw new AppError('Payment not completed', 402, 'PAYMENT_FAILED');

  const invoiceId = intent.metadata?.invoiceId;
  if (!invoiceId) throw new AppError('Invalid payment intent metadata', 400);

  const invoice = await invoiceRepo.findById(invoiceId);
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (invoice.tenantId.toString() !== tenantId.toString()) throw new AppError('Forbidden', 403);
  if (invoice.status === 'paid') return { invoice }; // already activated (e.g. webhook fired first)

  const sub = await subscriptionRepo.findByTenant(tenantId);
  const now = new Date(invoice.periodStart);
  const periodEnd = new Date(invoice.periodEnd);

  // The invoice remembers which coupon (if any) was applied at checkout —
  // pass it through so usage tracking (maxUses/onePerTenant) actually counts
  // this redemption. Previously hardcoded to null, so coupon limits were
  // silently bypassed for every paid (non-free) Stripe subscription upgrade.
  const coupon = invoice.couponId ? { _id: invoice.couponId } : null;

  await _activateSubscription({
    sub, tenantId,
    planId: invoice.planId.toString(),
    cycle:  invoice.billingCycle,
    now, periodEnd,
    coupon,
    invoice,
  });

  return { invoice };
}

// ── Shared activation logic ───────────────────────────────────────────────────
async function _activateSubscription({ sub, tenantId, planId, cycle, now, periodEnd, coupon, invoice }) {
  if (sub) {
    await subscriptionRepo.updateById(sub._id, {
      previousPlanId: sub.planId,
      planId,
      billingCycle: cycle,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      status: 'active',
      isOnTrial: false,
      planChangedAt: now,
      gracePeriodEndsAt: null,
    });
  } else {
    await subscriptionRepo.create({
      tenantId, planId, billingCycle: cycle,
      currentPeriodStart: now, currentPeriodEnd: periodEnd,
      isOnTrial: false, status: 'active',
    });
  }

  await tenantRepo.updateById(tenantId, {
    plan: planId, planExpiresAt: periodEnd, isOnTrial: false, status: 'active',
  });

  if (invoice) {
    await invoiceRepo.updateById(invoice._id, { status: 'paid', paidAt: new Date() });
  }

  if (coupon) {
    await couponRepo.incrementUsage(coupon._id, tenantId);
  }

  emitBillingUpdated(tenantId, { event: 'subscription_activated' });
}

async function createPortalSession(tenantId) {
  const stripe = getStripe();
  if (!stripe) throw new AppError('Stripe not configured', 500);

  const sub = await subscriptionRepo.findByTenant(tenantId);
  if (!sub?.stripeCustomerId) throw new AppError('No Stripe customer found. Please make a payment first to create your customer record.', 400);

  const session = await stripe.billingPortal.sessions.create({
    customer:   sub.stripeCustomerId,
    return_url: `${process.env.APP_URL || 'http://localhost:3000'}/billing`,
  });

  return { url: session.url };
}

// ── Saved payment methods ─────────────────────────────────────────────────────

async function listPaymentMethods(tenantId) {
  const stripe = getStripe();
  if (!stripe) return { paymentMethods: [] };

  const sub = await subscriptionRepo.findByTenant(tenantId);
  if (!sub?.stripeCustomerId) return { paymentMethods: [] };

  const result = await stripe.paymentMethods.list({
    customer: sub.stripeCustomerId,
    type: 'card',
  });

  return {
    paymentMethods: result.data.map(pm => ({
      id:       pm.id,
      brand:    pm.card?.brand    || 'card',
      last4:    pm.card?.last4    || '****',
      expMonth: pm.card?.exp_month,
      expYear:  pm.card?.exp_year,
    })),
  };
}

async function deletePaymentMethod(tenantId, pmId) {
  const stripe = getStripe();
  if (!stripe) throw new AppError('Stripe not configured', 500);

  const sub = await subscriptionRepo.findByTenant(tenantId);
  if (!sub?.stripeCustomerId) throw new AppError('No Stripe customer found', 404);

  const pm = await stripe.paymentMethods.retrieve(pmId);
  if (pm.customer !== sub.stripeCustomerId)
    throw new AppError('Payment method not found', 404);

  await stripe.paymentMethods.detach(pmId);
  return { message: 'Payment method removed' };
}

async function getBillingInfo(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  return {
    taxRate:  tenant?.settings?.taxRate  || 0,
    taxLabel: tenant?.settings?.taxLabel || 'Tax',
    currency: (tenant?.settings?.currency || 'USD').toUpperCase(),
  };
}

async function downloadInvoice(tenantId, invoiceId) {
  const invoice = await invoiceRepo.findById(invoiceId);
  if (!invoice || invoice.tenantId._id?.toString() !== tenantId.toString())
    throw new AppError('Invoice not found', 404);
  const { generateInvoicePdf } = require('../../services/pdf/invoice.pdf');
  return { pdf: await generateInvoicePdf(invoice), invoice };
}

// ── Self-service reactivation for expired / past_due subscriptions ────────────
// Delegates to upgradePlan with the current plan so the same invoice+payment
// flow is reused. The "already on this plan" guard was made status-aware to
// allow this path.
async function reactivatePlan(tenantId, { billingCycle, couponCode } = {}) {
  const sub = await subscriptionRepo.findByTenant(tenantId);
  if (!sub) throw new AppError('No subscription found', 404);
  if (!['expired', 'past_due', 'cancelled'].includes(sub.status))
    throw new AppError('Your subscription is not expired and does not need reactivation', 400);

  const planId = sub.planId?._id?.toString() || sub.planId?.toString();
  if (!planId) throw new AppError('Could not determine current plan — contact support', 500);

  return upgradePlan(tenantId, {
    planId,
    billingCycle: billingCycle || sub.billingCycle,
    couponCode,
  });
}

// ── Lemon Squeezy checkout ────────────────────────────────────────────────────
// Variant IDs are stored as env vars: LS_VARIANT_{PLAN}_{CYCLE}
// planSlug: 'basic' | 'pro'   billingCycle: 'monthly' | 'yearly'
async function createLsCheckout(tenantId, { planSlug, billingCycle }) {
  const { createCheckout } = require('../../services/lemonSqueezy/lemonSqueezy.service');

  const key = `LS_VARIANT_${planSlug.toUpperCase()}_${billingCycle.toUpperCase()}`;
  const variantId = process.env[key];
  if (!variantId) throw new AppError(`Lemon Squeezy variant not configured (${key})`, 500);

  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);

  const rootDomain = process.env.ROOT_DOMAIN || 'coursel.space';
  const tenantUrl  = tenant.subdomain
    ? `https://${tenant.subdomain}.${rootDomain}`
    : (process.env.APP_URL || 'http://localhost:3000');
  const checkoutUrl = await createCheckout({
    variantId,
    tenantId,
    email:        tenant.contactEmail,
    name:         tenant.name,
    billingCycle,
    successUrl:   `${tenantUrl}/billing?ls_success=1`,
    cancelUrl:    `${tenantUrl}/billing`,
  });

  return { checkoutUrl };
}

// One-time Cloudflare Stream top-up purchase (storage-minutes or viewer-minutes),
// via the platform's Lemon Squeezy account — the first non-subscription LS
// purchase in this codebase. topupType: 'storage_500' | 'viewer_5000'.
const TOPUP_VARIANT_ENV = {
  storage_500: 'LS_VARIANT_TOPUP_STORAGE_500',
  viewer_5000: 'LS_VARIANT_TOPUP_VIEWER_5000',
};

async function createLsTopupCheckout(tenantId, topupType) {
  const envKey = TOPUP_VARIANT_ENV[topupType];
  if (!envKey) throw new AppError('Unknown top-up type', 400);

  const variantId = process.env[envKey];
  if (!variantId) throw new AppError(`Lemon Squeezy variant not configured (${envKey})`, 500);

  const limitGuardSvc = require('../../services/limitGuard/limitGuard.service');
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);

  const usage = await limitGuardSvc.getStreamUsageSummary(tenantId, tenant.plan);
  if (!usage.planAllows) {
    throw new AppError('Cloudflare Stream is not available on your current plan. Upgrade to Basic or Pro first.', 403);
  }

  const { createCheckout } = require('../../services/lemonSqueezy/lemonSqueezy.service');
  const rootDomain = process.env.ROOT_DOMAIN || 'coursel.space';
  const tenantUrl  = tenant.subdomain
    ? `https://${tenant.subdomain}.${rootDomain}`
    : (process.env.APP_URL || 'http://localhost:3000');

  const checkoutUrl = await createCheckout({
    variantId,
    tenantId,
    email: tenant.contactEmail,
    name:  tenant.name,
    successUrl: `${tenantUrl}/billing?ls_success=1`,
    cancelUrl:  `${tenantUrl}/billing`,
    extraCustom: { purchase_type: 'topup', topup_type: topupType },
  });

  return { checkoutUrl };
}

module.exports = {
  getMySubscription, getMyInvoices, getInvoice, getAvailablePlans,
  validateCoupon, upgradePlan, reactivatePlan, confirmSubscriptionPayment,
  createPortalSession, downloadInvoice,
  listPaymentMethods, deletePaymentMethod,
  getBillingInfo, createLsCheckout, createLsTopupCheckout,
  // Exported for the Stripe webhook, so the "payment_intent.succeeded" fires-
  // first race path shares the exact same activation logic (previously
  // duplicated inline in stripe.webhook.js and had drifted — missing the
  // gracePeriodEndsAt reset and coupon usage tracking entirely).
  _activateSubscription,
};
