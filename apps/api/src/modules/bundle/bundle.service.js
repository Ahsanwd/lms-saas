const { v4: uuidv4 } = require('uuid');
const CourseBundle   = require('../../database/models/CourseBundle.model');
const BundlePayment  = require('../../database/models/BundlePayment.model');
const Course         = require('../../database/models/Course.model');
const Enrollment     = require('../../database/models/Enrollment.model');
const User           = require('../../database/models/User.model');
const AppError       = require('../../utils/AppError');
const { getTenantStripeClient, createOrGetCustomer } = require('../../services/stripe/stripe');
const safepay        = require('../../services/safepay/safepay');
const tenantRepo     = require('../../database/repositories/tenant.repository');
const tenantService  = require('../tenant/tenant.service');

// ═══════════════════════════════════════════════════════════════════════════
// CRUD — bundle product management
// ═══════════════════════════════════════════════════════════════════════════

async function listBundles(tenantId, { search, status, page = 1, limit = 20 } = {}) {
  const filter = { tenantId };
  if (status) filter.status = status;
  if (search) filter.title = { $regex: search, $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const [bundles, total] = await Promise.all([
    CourseBundle.find(filter)
      .populate('courseIds', 'title price thumbnail')
      .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    CourseBundle.countDocuments(filter),
  ]);
  return { bundles, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } };
}

async function listPublicBundles(tenantId) {
  return CourseBundle.find({ tenantId, status: 'published' })
    .populate('courseIds', 'title thumbnail price')
    .sort({ createdAt: -1 });
}

async function getBundle(tenantId, bundleId) {
  const bundle = await CourseBundle.findOne({ _id: bundleId, tenantId })
    .populate('courseIds', 'title price thumbnail status');
  if (!bundle) throw new AppError('Bundle not found', 404);
  return bundle;
}

// requirePermission('course:manage') passes for every instructor tenant-wide
// (same as certTemplate.service.js's assertCanEditTemplate) — so an
// instructor is only allowed to bundle their OWN published courses.
async function _validateCourseIds(tenantId, courseIds, actingUser) {
  if (!Array.isArray(courseIds) || courseIds.length < 2)
    throw new AppError('A bundle must include at least 2 courses', 400);

  const courses = await Course.find({ _id: { $in: courseIds }, tenantId, deletedAt: null });
  if (courses.length !== courseIds.length)
    throw new AppError('One or more selected courses were not found', 400);

  const unpublished = courses.filter(c => c.status !== 'published');
  if (unpublished.length > 0)
    throw new AppError(`All bundle courses must be published (unpublished: ${unpublished.map(c => c.title).join(', ')})`, 400);

  if (actingUser?.role === 'instructor') {
    const notOwned = courses.filter(c => c.instructorId?.toString() !== actingUser.sub.toString());
    if (notOwned.length > 0)
      throw new AppError(`You can only bundle your own courses (not yours: ${notOwned.map(c => c.title).join(', ')})`, 403);
  }
}

// Same ownership rule as certTemplate.service.js's assertCanEditTemplate —
// only a tenant admin or the bundle's own creator may edit/delete it, since
// course:manage alone doesn't distinguish between instructors.
function _assertCanManageBundle(bundle, actingUser) {
  if (actingUser.role === 'instructor' && bundle.createdBy?.toString() !== actingUser.sub.toString())
    throw new AppError('You can only manage bundles you created', 403);
}

async function createBundle(tenantId, data, actingUser) {
  const { title, description, courseIds, price, status } = data;
  if (!title?.trim()) throw new AppError('Title is required', 400);
  if (price == null || Number(price) < 0) throw new AppError('A valid price is required', 400);

  await _validateCourseIds(tenantId, courseIds, actingUser);

  return CourseBundle.create({
    tenantId,
    title: title.trim(),
    description: description?.trim() || null,
    courseIds,
    price: Number(price),
    status: status === 'published' ? 'published' : 'draft',
    createdBy: actingUser.sub,
  });
}

async function updateBundle(tenantId, bundleId, data, actingUser) {
  const bundle = await CourseBundle.findOne({ _id: bundleId, tenantId });
  if (!bundle) throw new AppError('Bundle not found', 404);
  _assertCanManageBundle(bundle, actingUser);

  if (data.courseIds) await _validateCourseIds(tenantId, data.courseIds, actingUser);

  const allowed = ['title', 'description', 'courseIds', 'price', 'status'];
  allowed.forEach(field => {
    if (data[field] !== undefined) bundle[field] = data[field];
  });
  bundle.updatedBy = actingUser.sub;

  return bundle.save();
}

async function deleteBundle(tenantId, bundleId, actingUser) {
  const bundle = await CourseBundle.findOne({ _id: bundleId, tenantId });
  if (!bundle) throw new AppError('Bundle not found', 404);
  _assertCanManageBundle(bundle, actingUser);
  return bundle.softDelete(actingUser.sub);
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECKOUT — mirrors payment.service.js's Stripe/Safepay/mock branching
// ═══════════════════════════════════════════════════════════════════════════

async function providerCreateIntent(stripeClient, amount, currency, metadata, customerId = null) {
  if (stripeClient) {
    const intentParams = {
      amount, currency, metadata,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: 'off_session',
      ...(customerId && { customer: customerId }),
    };
    return stripeClient.paymentIntents.create(intentParams);
  }
  return {
    id:            `mock_pi_${uuidv4().replace(/-/g, '')}`,
    client_secret: `mock_cs_${uuidv4().replace(/-/g, '')}`,
    amount, currency,
    status: 'requires_payment_method',
  };
}

async function providerRetrieveIntent(stripeClient, paymentIntentId) {
  if (stripeClient) return stripeClient.paymentIntents.retrieve(paymentIntentId);
  return { id: paymentIntentId, status: 'succeeded' };
}

async function providerRefund(stripeClient, paymentIntentId) {
  if (stripeClient) return stripeClient.refunds.create({ payment_intent: paymentIntentId });
  return { id: `mock_re_${uuidv4().replace(/-/g, '')}`, payment_intent: paymentIntentId, status: 'succeeded' };
}

function receiptNumber() {
  return `BRCP-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

function calcExpiresAt(days) {
  if (!days || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function tenantBaseUrl(tenant) {
  const rootDomain = process.env.ROOT_DOMAIN || 'coursel.space';
  return tenant?.subdomain
    ? `https://${tenant.subdomain}.${rootDomain}`
    : (process.env.APP_URL || 'http://localhost:3000');
}

// ─── Initiate bundle payment ───────────────────────────────────────────────
async function initiateBundlePayment(tenantId, bundleId, userId, { couponCode } = {}) {
  const [bundle, tenant, user] = await Promise.all([
    CourseBundle.findOne({ _id: bundleId, tenantId, status: 'published' }),
    tenantRepo.findById(tenantId),
    User.findOne({ _id: userId, tenantId, deletedAt: null }).select('+stripeCustomerId'),
  ]);
  if (!bundle) throw new AppError('Bundle not found or not available', 404);

  const courses = await Course.find({ _id: { $in: bundle.courseIds }, tenantId, deletedAt: null });
  const unavailable = courses.filter(c => c.status !== 'published');
  if (unavailable.length > 0 || courses.length !== bundle.courseIds.length)
    throw new AppError('One or more courses in this bundle are no longer available', 400);

  const existingEnrollments = await Enrollment.find({
    tenantId, userId, courseId: { $in: bundle.courseIds }, status: 'active', isTrial: false,
  });
  if (existingEnrollments.length === bundle.courseIds.length)
    throw new AppError('Already enrolled in all courses in this bundle', 409);

  const currency = (tenant?.settings?.currency || 'usd').toLowerCase();

  let finalAmount    = Math.round(bundle.price * 100); // cents
  let discountAmount = 0;
  let appliedCoupon  = null;

  if (couponCode) {
    try {
      const couponService = require('../coupon/coupon.service');
      const disc = await couponService.validateBundleCoupon(tenantId, couponCode, bundle.courseIds, bundle.price);
      discountAmount = Math.round(disc.discountAmount * 100);
      finalAmount    = Math.round(disc.finalPrice * 100);
      appliedCoupon  = disc.code;
    } catch {
      throw new AppError('Invalid or inapplicable coupon code', 400, 'COUPON_INVALID');
    }
  }

  const gateway = await tenantService.getActiveGateway(tenantId);

  // ── Safepay: hosted-checkout redirect ────────────────────────────────────
  if (gateway.provider === 'safepay') {
    const payment = await BundlePayment.create({
      tenantId, bundleId, userId,
      courseIds: bundle.courseIds,
      amount: finalAmount, currency, discountAmount,
      couponCode: appliedCoupon,
      provider: 'safepay',
      receiptNumber: receiptNumber(),
      status: 'pending',
    });

    const returnBase = `${tenantBaseUrl(tenant)}/bundles`;

    const [{ tracker }, tbt] = await Promise.all([
      safepay.createSession({
        apiKey:      gateway.apiKey,
        environment: gateway.environment,
        amount:      finalAmount,
        currency:    currency.toUpperCase(),
        orderId:     payment._id.toString(),
      }),
      safepay.getPassportToken({ secretKey: gateway.secretKey, environment: gateway.environment }),
    ]);

    payment.safepayTracker = tracker;
    await payment.save();

    const redirectUrl = safepay.buildCheckoutUrl({
      environment: gateway.environment,
      tracker,
      tbt,
      redirectUrl: `${returnBase}?safepayPaymentId=${payment._id}`,
      cancelUrl:   `${returnBase}?safepayCancelled=1`,
    });

    return { paymentId: payment._id, provider: 'safepay', redirectUrl, amount: finalAmount, currency, bundleTitle: bundle.title };
  }

  // ── Stripe (tenant's own key) or mock fallback ───────────────────────────
  const stripeClient = gateway.provider === 'stripe' ? getTenantStripeClient(gateway.secretKey) : null;

  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const stripeCustomerId = stripeClient
    ? await createOrGetCustomer(stripeClient, userId, user?.email ?? '', userName, user?.stripeCustomerId ?? null)
    : null;

  const resolvedProvider = stripeClient ? 'stripe' : 'mock';
  const intent = await providerCreateIntent(
    stripeClient, finalAmount, currency,
    { bundleId: bundleId.toString(), userId: userId.toString(), tenantId: tenantId.toString() },
    stripeCustomerId
  );

  const payment = await BundlePayment.create({
    tenantId, bundleId, userId,
    courseIds: bundle.courseIds,
    amount: finalAmount, currency, discountAmount,
    couponCode: appliedCoupon,
    paymentIntentId: intent.id,
    provider: resolvedProvider,
    receiptNumber: receiptNumber(),
    status: 'pending',
  });

  return {
    paymentId:       payment._id,
    paymentIntentId: intent.id,
    clientSecret:    intent.client_secret,
    amount:          finalAmount,
    currency,
    bundleTitle:     bundle.title,
    provider:        resolvedProvider,
    publishableKey:  stripeClient ? gateway.publishableKey : null,
  };
}

// ─── Confirm bundle payment ──────────────────────────────────────────────────
async function confirmBundlePayment(tenantId, paymentId, userId) {
  const payment = await BundlePayment.findOne({ _id: paymentId, tenantId, userId, status: 'pending' });
  if (!payment) throw new AppError('Payment not found or already processed', 404);

  if (payment.provider === 'safepay') {
    const gateway = await tenantService.getActiveGateway(tenantId);
    if (gateway.provider !== 'safepay') throw new AppError('Safepay is no longer configured for this school', 409);

    const status = await safepay.getPaymentStatus({
      secretKey: gateway.secretKey, environment: gateway.environment, tracker: payment.safepayTracker,
    });
    if (status.state !== 'TRACKER_ENDED') throw new AppError('Payment not confirmed by Safepay', 402, 'PAYMENT_FAILED');

    const result = await _activateBundlePayment(payment);
    tenantService.markSafepayVerified(tenantId).catch(() => {});
    return result;
  }

  let stripeClient = null;
  if (payment.provider === 'stripe') {
    const gateway = await tenantService.getActiveGateway(tenantId);
    stripeClient = gateway.provider === 'stripe' ? getTenantStripeClient(gateway.secretKey) : null;
  }

  const intent = await providerRetrieveIntent(stripeClient, payment.paymentIntentId);
  if (intent.status !== 'succeeded') throw new AppError('Payment not confirmed by Stripe', 402, 'PAYMENT_FAILED');

  return _activateBundlePayment(payment);
}

// ─── Activate: enroll student in every course they don't already own ────────
async function _activateBundlePayment(payment) {
  const courses = await Course.find({ _id: { $in: payment.courseIds } });
  const coursesById = new Map(courses.map(c => [c._id.toString(), c]));

  const perCoursePrice = (payment.amount / payment.courseIds.length) / 100;
  const enrollmentIds = [];
  const countedCourseIds = [];

  for (const courseId of payment.courseIds) {
    const existing = await Enrollment.findOne({ tenantId: payment.tenantId, courseId, userId: payment.userId });
    if (existing && existing.status === 'active') {
      // Already owned via a separate purchase — this payment grants nothing
      // new for this course, so it must NOT be tracked against this payment.
      // A later refund of this payment must never touch an enrollment (or
      // enrollmentCount) it didn't actually create.
      continue;
    }

    const course = coursesById.get(courseId.toString());
    if (existing) {
      existing.status     = 'active';
      existing.isTrial    = false;
      existing.enrolledAt = new Date();
      existing.pricePaid  = perCoursePrice;
      existing.couponCode = payment.couponCode;
      existing.expiresAt  = calcExpiresAt(course?.accessDurationDays);
      await existing.save();
      enrollmentIds.push(existing._id);
    } else {
      const enrollment = await Enrollment.create({
        tenantId: payment.tenantId, courseId, userId: payment.userId,
        pricePaid: perCoursePrice,
        couponCode: payment.couponCode,
        expiresAt: calcExpiresAt(course?.accessDurationDays),
      });
      await Course.updateOne({ _id: courseId, tenantId: payment.tenantId }, { $inc: { enrollmentCount: 1 } });
      enrollmentIds.push(enrollment._id);
      countedCourseIds.push(courseId);
    }
  }

  payment.status           = 'completed';
  payment.paidAt            = new Date();
  payment.enrollmentIds     = enrollmentIds;
  payment.countedCourseIds  = countedCourseIds;
  await payment.save();

  // Mirrors payment.service.js's _activatePayment — coupon usage is only
  // counted once a purchase actually completes, never on initiate/validate,
  // so abandoned checkouts don't burn a limited-use code. Was previously
  // dead code (applyBundleCoupon was never called from anywhere).
  if (payment.couponCode) {
    const couponSvc = require('../coupon/coupon.service');
    couponSvc.applyBundleCoupon(
      payment.tenantId, payment.couponCode, payment.courseIds,
      (payment.amount + payment.discountAmount) / 100
    ).catch(() => {});
  }

  const { emitDashboardUpdated } = require('../../services/socket/io');
  emitDashboardUpdated(payment.tenantId, { event: 'new_enrollment' });

  return { payment, enrollmentIds };
}

// ─── Refund bundle payment (admin) ───────────────────────────────────────────
async function refundBundlePayment(tenantId, paymentId, actingUser, { reason = '' } = {}) {
  const payment = await BundlePayment.findOne({ _id: paymentId, tenantId, status: 'completed' });
  if (!payment) throw new AppError('Completed payment not found', 404);

  // route is course:manage-gated (every instructor tenant-wide) — same
  // ownership gap as create/update/delete above, but here it would let an
  // instructor trigger a real Stripe refund and un-enrollment for a bundle
  // they had nothing to do with.
  if (actingUser.role === 'instructor') {
    const bundle = await CourseBundle.findOne({ _id: payment.bundleId, tenantId });
    if (bundle && bundle.createdBy?.toString() !== actingUser.sub.toString())
      throw new AppError('You can only refund bundles you created', 403);
  }

  if (payment.provider === 'safepay') {
    throw new AppError('This was a Safepay payment — process the refund manually in the Safepay dashboard, then contact support to reconcile the record.', 400);
  } else if (payment.provider === 'stripe') {
    const gateway = await tenantService.getActiveGateway(tenantId);
    const stripeClient = gateway.provider === 'stripe' ? getTenantStripeClient(gateway.secretKey) : null;
    await providerRefund(stripeClient, payment.paymentIntentId);
  } else {
    await providerRefund(null, payment.paymentIntentId); // mock
  }

  payment.status       = 'refunded';
  payment.refundedAt   = new Date();
  payment.refundedBy   = actingUser.sub;
  payment.refundReason = reason;
  await payment.save();

  // enrollmentIds only ever contains enrollments THIS payment created or
  // reactivated (never a pre-existing enrollment from a separate purchase
  // that happened to overlap with this bundle) — see _activateBundlePayment.
  await Enrollment.updateMany(
    { _id: { $in: payment.enrollmentIds } },
    { status: 'dropped', droppedAt: new Date() }
  );
  // Fall back to courseIds for payments completed before countedCourseIds
  // existed (legacy documents where the field is simply absent).
  const decrementCourseIds = payment.countedCourseIds?.length ? payment.countedCourseIds : payment.courseIds;
  await Course.updateMany(
    { _id: { $in: decrementCourseIds }, tenantId },
    { $inc: { enrollmentCount: -1 } }
  );

  return payment;
}

module.exports = {
  listBundles, listPublicBundles, getBundle, createBundle, updateBundle, deleteBundle,
  initiateBundlePayment, confirmBundlePayment, refundBundlePayment,
};
