const { verifyWebhookSignature, mapLsStatus } = require('../../services/lemonSqueezy/lemonSqueezy.service');
const subscriptionRepo = require('../../database/repositories/subscription.repository');
const invoiceRepo      = require('../../database/repositories/invoice.repository');
const planRepo         = require('../../database/repositories/plan.repository');
const tenantRepo       = require('../../database/repositories/tenant.repository');
const { generateInvoiceNumber } = require('../../utils/invoiceNumber');
const logger = require('../../utils/logger');

// Resolve Plan from LS variant ID using env var mapping
function getPlanAndCycleFromVariant(variantId) {
  const vid = String(variantId);
  const map = {
    [process.env.LS_VARIANT_BASIC_MONTHLY]:  { slug: 'basic',  cycle: 'monthly' },
    [process.env.LS_VARIANT_BASIC_YEARLY]:   { slug: 'basic',  cycle: 'yearly'  },
    [process.env.LS_VARIANT_PRO_MONTHLY]:    { slug: 'pro',    cycle: 'monthly' },
    [process.env.LS_VARIANT_PRO_YEARLY]:     { slug: 'pro',    cycle: 'yearly'  },
  };
  return map[vid] || null;
}

async function handleSubscriptionCreated(data, meta) {
  const tenantId    = meta?.custom_data?.tenant_id;
  const attrs       = data.attributes;
  const variantId   = String(attrs.variant_id);
  const planCycle   = getPlanAndCycleFromVariant(variantId);

  if (!tenantId) return logger.warn('LS webhook: subscription_created missing tenant_id');
  if (!planCycle) return logger.warn(`LS webhook: unknown variant ${variantId}`);

  const plan = await planRepo.findBySlug(planCycle.slug);
  if (!plan) return logger.warn(`LS webhook: plan not found for slug ${planCycle.slug}`);

  const periodStart = new Date(attrs.renews_at || Date.now());
  const cycle       = planCycle.cycle;
  const periodEnd   = new Date(periodStart);
  if (cycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else                    periodEnd.setMonth(periodEnd.getMonth() + 1);

  const existing = await subscriptionRepo.findByTenant(tenantId);
  const lsFields = {
    lsSubscriptionId: String(data.id),
    lsCustomerId:     String(attrs.customer_id),
    lsVariantId:      variantId,
  };

  if (existing) {
    await subscriptionRepo.updateByTenant(tenantId, {
      planId:             plan._id,
      status:             'active',
      billingCycle:       cycle,
      currentPeriodStart: periodStart,
      currentPeriodEnd:   periodEnd,
      isOnTrial:          false,
      autoRenew:          true,
      cancelledAt:        null,
      gracePeriodEndsAt:  null,
      ...lsFields,
    });
  } else {
    await subscriptionRepo.create({
      tenantId,
      planId:             plan._id,
      status:             'active',
      billingCycle:       cycle,
      currentPeriodStart: periodStart,
      currentPeriodEnd:   periodEnd,
      isOnTrial:          false,
      autoRenew:          true,
      ...lsFields,
    });
  }

  logger.info(`LS: subscription activated — tenant ${tenantId}, plan ${plan.slug}, ${cycle}`);
}

async function handleSubscriptionUpdated(data, meta) {
  const attrs  = data.attributes;
  const lsSubId = String(data.id);
  const status  = mapLsStatus(attrs.status);

  const periodStart = attrs.created_at ? new Date(attrs.created_at) : new Date();
  const periodEnd   = attrs.renews_at   ? new Date(attrs.renews_at)   : new Date();

  await subscriptionRepo.updateByLsId(lsSubId, {
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd:   periodEnd,
    autoRenew:          !attrs.cancelled,
    cancelledAt:        attrs.cancelled ? (attrs.ends_at ? new Date(attrs.ends_at) : new Date()) : null,
  });

  logger.info(`LS: subscription updated — lsId ${lsSubId}, status ${status}`);
}

async function handleSubscriptionCancelled(data) {
  const lsSubId = String(data.id);
  const endsAt  = data.attributes.ends_at ? new Date(data.attributes.ends_at) : new Date();
  await subscriptionRepo.updateByLsId(lsSubId, {
    autoRenew:   false,
    cancelledAt: new Date(),
    status:      'cancelled',
    currentPeriodEnd: endsAt,
  });
  logger.info(`LS: subscription cancelled — lsId ${lsSubId}`);
}

async function handleSubscriptionExpired(data) {
  const lsSubId = String(data.id);
  await subscriptionRepo.updateByLsId(lsSubId, { status: 'expired', autoRenew: false });
  logger.info(`LS: subscription expired — lsId ${lsSubId}`);
}

async function handlePaymentSuccess(data, meta) {
  const attrs     = data.attributes;
  const tenantId  = meta?.custom_data?.tenant_id;
  if (!tenantId) return;

  const sub = await subscriptionRepo.findByTenant(tenantId);
  if (!sub) return;

  const total      = (attrs.total || 0) / 100; // LS stores in cents
  const periodStart = new Date(attrs.created_at || Date.now());
  const periodEnd   = sub.currentPeriodEnd;

  await invoiceRepo.create({
    tenantId,
    subscriptionId:    sub._id,
    planId:            sub.planId._id || sub.planId,
    invoiceNumber:     await generateInvoiceNumber(),
    periodStart,
    periodEnd,
    dueDate:           periodStart,
    subtotal:          total,
    discountAmount:    0,
    total,
    currency:          (attrs.currency || 'usd').toLowerCase(),
    status:            'paid',
    paidAt:            new Date(),
    billingCycle:      sub.billingCycle,
    description:       `Coursel ${sub.planId?.name || ''} — ${sub.billingCycle} plan`,
    provider:          'lemonsqueezy',
    providerInvoiceId: String(data.id),
  });
  logger.info(`LS: invoice created for tenant ${tenantId}`);
}

async function handlePaymentFailed(data) {
  const lsSubId = String(data.attributes?.subscription_id || data.id);
  await subscriptionRepo.updateByLsId(lsSubId, { status: 'past_due' });
  logger.warn(`LS: payment failed — lsId ${lsSubId}`);
}

async function handleWebhook(req, res) {
  try {
    verifyWebhookSignature(req.body, req.headers['x-signature']);
  } catch {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventName = payload.meta?.event_name;
  const data      = payload.data;
  const meta      = payload.meta;

  try {
    switch (eventName) {
      case 'subscription_created':         await handleSubscriptionCreated(data, meta); break;
      case 'subscription_updated':         await handleSubscriptionUpdated(data, meta); break;
      case 'subscription_cancelled':       await handleSubscriptionCancelled(data);     break;
      case 'subscription_expired':         await handleSubscriptionExpired(data);       break;
      case 'subscription_payment_success': await handlePaymentSuccess(data, meta);      break;
      case 'subscription_payment_failed':  await handlePaymentFailed(data);             break;
      default: logger.info(`LS webhook: unhandled event ${eventName}`);
    }
    res.json({ received: true });
  } catch (err) {
    logger.error('LS webhook handler error', { err: err.message, eventName });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

module.exports = { handleWebhook };
