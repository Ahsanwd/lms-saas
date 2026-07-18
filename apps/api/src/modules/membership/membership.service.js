const { v4: uuidv4 }     = require('uuid');
const planRepo           = require('../../database/repositories/membershipPlan.repository');
const subRepo            = require('../../database/repositories/membershipSubscription.repository');
const AppError           = require('../../utils/AppError');
const { getStripe }      = require('../../services/stripe/stripe');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodEnd(billingCycle) {
  const now = new Date();
  if (billingCycle === 'yearly') return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // monthly
}

function planPrice(plan, billingCycle) {
  return billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

async function getOrCreateStripeCustomer(userId, email) {
  const stripe = getStripe();
  if (!stripe) return null;
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length > 0) return customers.data[0].id;
  const customer = await stripe.customers.create({ email, metadata: { userId: userId.toString() } });
  return customer.id;
}

async function createStripeIntent(amountUsd, metadata, customerId = null) {
  const stripe = getStripe();
  if (!stripe) {
    return {
      id:            `mock_pi_mem_${uuidv4().replace(/-/g, '')}`,
      client_secret: `mock_cs_mem_${uuidv4().replace(/-/g, '')}`,
      status: 'requires_payment_method',
    };
  }
  return stripe.paymentIntents.create({
    amount:   Math.round(amountUsd * 100),
    currency: 'usd',
    metadata,
    // Save the card for off-session renewal charges
    setup_future_usage: 'off_session',
    ...(customerId && { customer: customerId }),
    automatic_payment_methods: { enabled: true },
  });
}

async function retrieveStripeIntent(piId) {
  const stripe = getStripe();
  if (!stripe) return { id: piId, status: 'succeeded', payment_method: null, customer: null };
  return stripe.paymentIntents.retrieve(piId, { expand: ['payment_method'] });
}

// Charge a saved payment method off-session (renewal)
async function chargeOffSession(amountUsd, customerId, paymentMethodId, metadata) {
  const stripe = getStripe();
  if (!stripe) {
    // Mock — simulate success
    return { id: `mock_pi_renew_${uuidv4().replace(/-/g, '')}`, status: 'succeeded' };
  }
  return stripe.paymentIntents.create({
    amount:         Math.round(amountUsd * 100),
    currency:       'usd',
    customer:       customerId,
    payment_method: paymentMethodId,
    off_session:    true,
    confirm:        true,
    metadata,
  });
}

// ─── Plan management (Tenant Admin) ───────────────────────────────────────────

async function listPlans(tenantId, { includeInactive = false } = {}) {
  const plans = await planRepo.findAll(tenantId, { includeInactive });
  // attach subscriber counts
  const withCounts = await Promise.all(
    plans.map(async (p) => {
      const subscribers = await subRepo.countActive(tenantId, p._id);
      return { ...p.toObject(), subscribers };
    })
  );
  return withCounts;
}

// Public marketing-site listing — active plans only, no admin-only
// subscriber counts (unlike listPlans above).
async function listPublicPlans(tenantId) {
  return planRepo.findAll(tenantId, { includeInactive: false });
}

async function createPlan(tenantId, data) {
  const { name, description, monthlyPrice, yearlyPrice, courseAccess, courses, features, trialDays, sortOrder } = data;
  if (!name) throw new AppError('Plan name is required', 400);
  if (monthlyPrice == null || yearlyPrice == null) throw new AppError('Monthly and yearly prices are required', 400);
  return planRepo.create({
    tenantId,
    name, description: description || '',
    monthlyPrice: Number(monthlyPrice),
    yearlyPrice:  Number(yearlyPrice),
    courseAccess: courseAccess || 'all',
    courses:      courseAccess === 'selected' ? (courses || []) : [],
    features:     features || [],
    trialDays:    trialDays || 0,
    sortOrder:    sortOrder || 0,
    isActive:     true,
  });
}

async function updatePlan(tenantId, planId, data) {
  const plan = await planRepo.findById(tenantId, planId);
  if (!plan) throw new AppError('Plan not found', 404);
  const update = {};
  const fields = ['name', 'description', 'monthlyPrice', 'yearlyPrice', 'courseAccess', 'features', 'trialDays', 'sortOrder'];
  fields.forEach(f => { if (data[f] !== undefined) update[f] = data[f]; });
  if (data.courseAccess === 'selected' && data.courses !== undefined) update.courses = data.courses;
  if (data.courseAccess === 'all') update.courses = [];
  return planRepo.updateById(tenantId, planId, update);
}

async function togglePlan(tenantId, planId) {
  const plan = await planRepo.findById(tenantId, planId);
  if (!plan) throw new AppError('Plan not found', 404);
  return planRepo.updateById(tenantId, planId, { isActive: !plan.isActive });
}

async function deletePlan(tenantId, planId) {
  const plan = await planRepo.findById(tenantId, planId);
  if (!plan) throw new AppError('Plan not found', 404);
  const subscribers = await subRepo.countActive(tenantId, planId);
  if (subscribers > 0) throw new AppError(`Cannot delete a plan with ${subscribers} active subscriber(s)`, 400);
  return planRepo.softDelete(tenantId, planId);
}

// ─── Student subscription ─────────────────────────────────────────────────────

async function getMySubscription(tenantId, userId) {
  return subRepo.findByUser(tenantId, userId);
}

// Initiate — creates a PaymentIntent and a pending subscription record
async function initiateSubscription(tenantId, userId, { planId, billingCycle = 'monthly' } = {}) {
  if (!planId) throw new AppError('planId is required', 400);

  const plan = await planRepo.findById(tenantId, planId);
  if (!plan) throw new AppError('Membership plan not found', 404);
  if (!plan.isActive) throw new AppError('This plan is no longer available', 400);

  // Check for existing active subscription
  const existing = await subRepo.findByUser(tenantId, userId);
  if (existing) throw new AppError('You already have an active membership. Cancel it before subscribing to a new plan.', 409);

  const price = planPrice(plan, billingCycle);

  // Free plan (price = 0) → activate immediately, no payment needed
  if (price === 0) {
    const now = new Date();
    const sub = await subRepo.create({
      tenantId, userId, planId,
      status:             plan.trialDays > 0 ? 'trial' : 'active',
      billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd(billingCycle),
      trialEndsAt:        plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * 86400000) : null,
      provider:           'mock',
    });
    return { free: true, subscription: sub };
  }

  // Get or create a Stripe Customer so we can save the PM for auto-renewal
  const User = require('../../database/models/User.model');
  const user = await User.findById(userId).select('email');
  const stripeCustomerId = await getOrCreateStripeCustomer(userId, user?.email);

  const intent = await createStripeIntent(
    price,
    { type: 'membership', tenantId: tenantId.toString(), userId: userId.toString(), planId: planId.toString(), billingCycle },
    stripeCustomerId
  );

  // Store pending subscription (activated on confirm)
  const now = new Date();
  const sub = await subRepo.create({
    tenantId, userId, planId,
    status:             'pending',   // waiting for payment confirmation
    billingCycle,
    currentPeriodStart: now,
    currentPeriodEnd:   now,         // updated on confirm
    paymentIntentId:    intent.id,
    stripeCustomerId:   stripeCustomerId || null,
    provider:           getStripe() ? 'stripe' : 'mock',
  });

  return {
    free:             false,
    subscriptionId:   sub._id,
    paymentIntentId:  intent.id,
    clientSecret:     intent.client_secret,
    amount:           price,
    planName:         plan.name,
    billingCycle,
  };
}

// Confirm — verifies payment and activates the subscription
async function confirmSubscription(tenantId, subscriptionId, userId) {
  const MembershipSubscription = require('../../database/models/MembershipSubscription.model');
  const record = await MembershipSubscription.findOne({ _id: subscriptionId, tenantId, userId });
  if (!record) throw new AppError('Subscription not found', 404);
  if (record.status === 'active') throw new AppError('Already activated', 409);
  if (!['pending', 'expired'].includes(record.status)) throw new AppError('Subscription cannot be confirmed in its current state', 400);

  // Verify payment and extract saved payment method for future renewals
  let stripePaymentMethodId = record.stripePaymentMethodId || null;
  if (record.provider === 'stripe') {
    const intent = await retrieveStripeIntent(record.paymentIntentId);
    if (intent.status !== 'succeeded') throw new AppError('Payment not yet completed', 402, 'PAYMENT_FAILED');
    // Stripe attaches the PM to the customer when setup_future_usage: 'off_session'
    if (intent.payment_method) {
      stripePaymentMethodId = typeof intent.payment_method === 'string'
        ? intent.payment_method
        : intent.payment_method?.id || null;
    }
  }
  // mock → always proceed

  const now = new Date();
  const updated = await subRepo.updateById(record._id, {
    status:                'active',
    currentPeriodStart:    now,
    currentPeriodEnd:      periodEnd(record.billingCycle),
    stripePaymentMethodId,
    renewalAttempts:       0,
    renewalFailReason:     null,
  });
  return updated;
}

// Confirm by payment intent (webhook backup)
async function confirmSubscriptionByIntentId(paymentIntentId) {
  const MembershipSubscription = require('../../database/models/MembershipSubscription.model');
  const record = await MembershipSubscription.findOne({ paymentIntentId, status: { $in: ['pending', 'expired'] } });
  if (!record) return null;
  const now = new Date();
  return subRepo.updateById(record._id, {
    status:             'active',
    currentPeriodStart: now,
    currentPeriodEnd:   periodEnd(record.billingCycle),
  });
}

async function cancelSubscription(tenantId, userId, { reason = '' } = {}) {
  const sub = await subRepo.findByUser(tenantId, userId);
  if (!sub) throw new AppError('No active membership to cancel', 404);
  return subRepo.updateById(sub._id, {
    status:      'cancelled',
    autoRenew:   false,
    cancelledAt: new Date(),
    cancelReason: reason || null,
  });
}

// Check if a student's membership covers a given course.
// Also grants access during the 3-day grace period after failed renewal.
async function checkCourseAccess(tenantId, userId, courseId) {
  const sub = await subRepo.findByUser(tenantId, userId);
  if (!sub) return { hasAccess: false };

  const now = new Date();

  // Active or trial — check period hasn't passed
  if (sub.status === 'active' || sub.status === 'trial') {
    if (now > sub.currentPeriodEnd) return { hasAccess: false };
  } else if (sub.status === 'past_due') {
    // Allow access during grace period only
    if (!sub.gracePeriodEndsAt || now > sub.gracePeriodEndsAt) {
      return { hasAccess: false };
    }
  } else {
    return { hasAccess: false };
  }

  const plan = sub.planId;
  if (!plan) return { hasAccess: false };

  if (plan.courseAccess === 'all')
    return { hasAccess: true, planId: plan._id, planName: plan.name, onGracePeriod: sub.status === 'past_due' };

  const covered = (plan.courses || []).some(c => c._id.toString() === courseId.toString());
  return {
    hasAccess: covered,
    planId: covered ? plan._id : null,
    planName: covered ? plan.name : null,
    onGracePeriod: sub.status === 'past_due',
  };
}

// Admin: list all subscriptions for a tenant
async function listSubscriptions(tenantId, query) {
  const [subscriptions, total] = await subRepo.findAll(tenantId, query);
  return { subscriptions, total };
}

// ─── Renewal (called by cron job) ────────────────────────────────────────────

// Renew a single subscription — charge off-session or mark past_due
async function renewSubscription(subscriptionId) {
  const MembershipSubscription = require('../../database/models/MembershipSubscription.model');
  const record = await MembershipSubscription.findById(subscriptionId)
    .populate('planId')
    .populate('userId', 'email firstName lastName');

  if (!record) return { ok: false, reason: 'not_found' };
  if (!record.autoRenew) {
    await subRepo.updateById(record._id, { status: 'expired' });
    return { ok: false, reason: 'auto_renew_off' };
  }

  const plan  = record.planId;
  const price = planPrice(plan, record.billingCycle);

  // Mock mode or free plan — just extend period, no charge needed
  if (record.provider === 'mock' || price === 0) {
    const now = new Date();
    await subRepo.updateById(record._id, {
      status:             'active',
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd(record.billingCycle),
      renewalAttempts:    0,
      renewalFailReason:  null,
      lastRenewalAttemptAt: now,
    });
    return { ok: true, mode: 'mock' };
  }

  // Stripe off-session charge
  if (!record.stripeCustomerId || !record.stripePaymentMethodId) {
    // No saved PM — mark past_due so student can renew manually
    await subRepo.updateById(record._id, {
      status:              'past_due',
      renewalFailReason:   'no_payment_method',
      lastRenewalAttemptAt: new Date(),
      renewalAttempts:     (record.renewalAttempts || 0) + 1,
    });
    return { ok: false, reason: 'no_payment_method' };
  }

  try {
    await chargeOffSession(
      price,
      record.stripeCustomerId,
      record.stripePaymentMethodId,
      { type: 'membership_renewal', subscriptionId: record._id.toString() }
    );

    const now = new Date();
    await subRepo.updateById(record._id, {
      status:             'active',
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd(record.billingCycle),
      renewalAttempts:    0,
      renewalFailReason:  null,
      lastRenewalAttemptAt: now,
    });
    return { ok: true, mode: 'stripe' };

  } catch (err) {
    const attempts = (record.renewalAttempts || 0) + 1;
    const update = {
      status:              'past_due',
      renewalAttempts:     attempts,
      renewalFailReason:   err.message,
      lastRenewalAttemptAt: new Date(),
    };
    // After 3 failed attempts: stay past_due but open a 3-day grace period.
    // The daily job will expire the subscription once gracePeriodEndsAt passes.
    if (attempts >= 3 && !record.gracePeriodEndsAt) {
      update.gracePeriodEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    }
    await subRepo.updateById(record._id, update);
    return { ok: false, reason: err.message, attempts };
  }
}

// Admin: subscriptions with failed renewals (past_due with attempt count)
async function getFailedRenewals(tenantId, { page = 1, limit = 20 } = {}) {
  const MembershipSubscription = require('../../database/models/MembershipSubscription.model');
  const filter = { tenantId, status: 'past_due', renewalAttempts: { $gt: 0 } };
  const skip   = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    MembershipSubscription.find(filter)
      .populate('userId', 'firstName lastName email')
      .populate('planId', 'name')
      .sort({ lastRenewalAttemptAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select('userId planId status renewalAttempts renewalFailReason lastRenewalAttemptAt gracePeriodEndsAt currentPeriodEnd billingCycle'),
    MembershipSubscription.countDocuments(filter),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

// Expire subscriptions whose grace period has ended — called daily by renewal job
async function expireGracePeriodEnded() {
  const MembershipSubscription = require('../../database/models/MembershipSubscription.model');
  const now = new Date();
  const result = await MembershipSubscription.updateMany(
    { status: 'past_due', gracePeriodEndsAt: { $lte: now } },
    { $set: { status: 'expired' } }
  );
  return result.modifiedCount;
}

// Find subscriptions due for renewal (expired or expiring within 1 hour)
async function getSubscriptionsDueForRenewal() {
  const MembershipSubscription = require('../../database/models/MembershipSubscription.model');
  const cutoff = new Date(Date.now() + 60 * 60 * 1000); // 1 hour ahead
  return MembershipSubscription.find({
    status:    { $in: ['active', 'trial', 'past_due'] },
    autoRenew: true,
    currentPeriodEnd: { $lte: cutoff },
  }).select('_id');
}

// Find subscriptions expiring in ~7 days (for reminder emails)
async function getSubscriptionsExpiringSoon() {
  const MembershipSubscription = require('../../database/models/MembershipSubscription.model');
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const in6Days = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
  return MembershipSubscription.find({
    status:    { $in: ['active', 'trial'] },
    autoRenew: false,
    currentPeriodEnd: { $gte: in6Days, $lte: in7Days },
  }).populate('userId', 'email firstName')
    .populate('planId', 'name');
}

module.exports = {
  listPlans, listPublicPlans, createPlan, updatePlan, togglePlan, deletePlan,
  getMySubscription, initiateSubscription, confirmSubscription,
  confirmSubscriptionByIntentId, cancelSubscription, checkCourseAccess,
  listSubscriptions, getFailedRenewals,
  renewSubscription, getSubscriptionsDueForRenewal, getSubscriptionsExpiringSoon,
  expireGracePeriodEnded,
};
