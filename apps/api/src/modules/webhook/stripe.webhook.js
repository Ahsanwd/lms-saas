const { getStripe }          = require('../../services/stripe/stripe');
const { emitBillingUpdated } = require('../../services/socket/io');
const invoiceRepo            = require('../../database/repositories/invoice.repository');
const subscriptionRepo       = require('../../database/repositories/subscription.repository');
const Subscription           = require('../../database/models/Subscription.model');
const tenantRepo             = require('../../database/repositories/tenant.repository');
const StripeWebhookEvent     = require('../../database/models/StripeWebhookEvent.model');
const logger                 = require('../../utils/logger');

// ── payment_intent.succeeded ──────────────────────────────────────────────────
async function handlePaymentSucceeded(intent) {
  const { type, invoiceId, tenantId, planId, cycle } = intent.metadata || {};

  if (type === 'subscription_upgrade' && invoiceId) {
    // Subscription upgrade — activate if not already done by the sync confirm call
    const invoice = await invoiceRepo.findById(invoiceId);
    if (!invoice || invoice.status === 'paid') return; // already handled

    const sub = await subscriptionRepo.findByTenant(invoice.tenantId);
    const now       = new Date(invoice.periodStart);
    const periodEnd = new Date(invoice.periodEnd);

    // Shared with confirmSubscriptionPayment() so both the webhook and the
    // synchronous confirm call activate a subscription identically — this
    // used to be duplicated inline here and had drifted (missing the
    // gracePeriodEndsAt reset and coupon usage tracking entirely).
    const billingSvc = require('../billing/billing.service');
    const coupon = invoice.couponId ? { _id: invoice.couponId } : null;
    await billingSvc._activateSubscription({
      sub, tenantId: invoice.tenantId,
      planId: invoice.planId,
      cycle:  invoice.billingCycle,
      now, periodEnd,
      coupon,
      invoice,
    });

    logger.info(`[stripe.webhook] Subscription activated for tenant ${invoice.tenantId} via PI ${intent.id}`);
    return;
  }

  // Course payment — confirm enrollment via payment service
  try {
    const paymentSvc = require('../payment/payment.service');
    const result = await paymentSvc.confirmPaymentByIntentId(intent.id);
    if (result) {
      logger.info(`[stripe.webhook] Course payment confirmed: PI ${intent.id}`);
    }
  } catch (err) {
    logger.error(`[stripe.webhook] Failed to confirm course payment PI ${intent.id}: ${err.message}`);
  }
}

// ── payment_intent.payment_failed ─────────────────────────────────────────────
async function handlePaymentFailed(intent) {
  const { type } = intent.metadata || {};

  // Subscription payment failure — apply 3-day grace period
  if (type === 'subscription_upgrade') {
    try {
      const gracePeriodEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const sub = intent.customer
        ? await Subscription.findOne({ stripeCustomerId: intent.customer, deletedAt: null }).lean()
        : null;
      if (sub) {
        await subscriptionRepo.updateById(sub._id, { status: 'past_due', gracePeriodEndsAt });
        // Notify tenant admin of payment failure
        const { queueEmail } = require('../jobs/email.job');
        const User   = require('../../database/models/User.model');
        const Tenant = require('../../database/models/Tenant.model');
        const admin  = await User.findOne({ tenantId: sub.tenantId, role: 'tenant_admin', deletedAt: null }).select('firstName email').lean();
        const tenant = await Tenant.findById(sub.tenantId).select('name').lean();
        if (admin?.email) {
          const APP_URL = process.env.APP_URL || 'http://localhost:3000';
          await queueEmail({
            to: admin.email,
            subject: `Payment failed — 3-day grace period started`,
            html: `<p>Hi ${admin.firstName || 'Admin'},</p>
<p>A subscription payment for <strong>${tenant?.name || 'your school'}</strong> failed. Your account remains active for a <strong>3-day grace period</strong> until <strong>${gracePeriodEndsAt.toDateString()}</strong>.</p>
<p>Please <a href="${APP_URL}/billing">update your payment method</a> to avoid service interruption.</p>`,
          });
        }
        emitBillingUpdated(sub.tenantId, { event: 'payment_failed' });
        logger.info(`[stripe.webhook] Subscription payment failed, grace period set: PI ${intent.id}`);
      } else {
        logger.warn(`[stripe.webhook] payment_intent.payment_failed for subscription_upgrade but no matching Subscription found for customer ${intent.customer}`);
      }
    } catch (err) {
      logger.error(`[stripe.webhook] handlePaymentFailed (subscription) error: ${err.message}`);
    }
    return;
  }

  // Course payment failure
  try {
    const CoursePayment = require('../../database/models/CoursePayment.model');
    await CoursePayment.updateOne(
      { paymentIntentId: intent.id, status: 'pending' },
      { $set: { status: 'failed' } }
    );
    logger.info(`[stripe.webhook] Payment failed: PI ${intent.id}`);
  } catch (err) {
    logger.error(`[stripe.webhook] handlePaymentFailed error: ${err.message}`);
  }
}

// ── Main webhook handler (called with raw body) ───────────────────────────────
async function handleWebhook(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(200).json({ received: true }); // no-op in mock mode

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn(`[stripe.webhook] Signature verification failed: ${err.message}`);
    return res.status(400).json({ error: `Webhook signature invalid: ${err.message}` });
  }

  // ── Log event (upsert for idempotency) ──────────────────────────────────────
  let eventDoc;
  try {
    eventDoc = await StripeWebhookEvent.findOneAndUpdate(
      { stripeEventId: event.id },
      { $setOnInsert: { stripeEventId: event.id, type: event.type, payload: event.data.object, status: 'received' } },
      { upsert: true, new: true }
    );
    // Idempotency guard — already successfully processed
    if (eventDoc.status === 'processed') {
      logger.info(`[stripe.webhook] Skipping already-processed event ${event.id}`);
      return res.json({ received: true });
    }
  } catch (logErr) {
    logger.warn(`[stripe.webhook] Failed to log event ${event.id}: ${logErr.message}`);
    // Continue processing even if logging fails
  }

  let processingError = null;
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        // Acknowledged without processing — still mark as processed
        break;
    }
  } catch (err) {
    processingError = err;
    logger.error(`[stripe.webhook] Error processing event ${event.type}: ${err.message}`);
  }

  // ── Update event log status ──────────────────────────────────────────────────
  try {
    await StripeWebhookEvent.findOneAndUpdate(
      { stripeEventId: event.id },
      processingError
        ? { status: 'failed', error: processingError.message }
        : { status: 'processed', processedAt: new Date() }
    );
  } catch (logErr) {
    logger.warn(`[stripe.webhook] Failed to update event log ${event.id}: ${logErr.message}`);
  }

  res.json({ received: true });
}

// ── Webhook event log (admin) ─────────────────────────────────────────────────
async function listWebhookEvents({ page = 1, limit = 30, status, type } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (type)   filter.type   = { $regex: type, $options: 'i' };

  const skip = (page - 1) * limit;
  const [events, total] = await Promise.all([
    StripeWebhookEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    StripeWebhookEvent.countDocuments(filter),
  ]);
  return { events, total, page: Number(page), limit: Number(limit) };
}

module.exports = { handleWebhook, listWebhookEvents };
