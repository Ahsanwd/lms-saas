const { v4: uuidv4 }              = require('uuid');
const CoursePayment               = require('../../database/models/CoursePayment.model');
const Course                      = require('../../database/models/Course.model');
const Enrollment                  = require('../../database/models/Enrollment.model');
const User                        = require('../../database/models/User.model');
const AppError                    = require('../../utils/AppError');
const { getTenantStripeClient, createOrGetCustomer } = require('../../services/stripe/stripe');
const paypalService                = require('../../services/paypal/paypal');
const tenantRepo                  = require('../../database/repositories/tenant.repository');
const tenantService                = require('../tenant/tenant.service');

// ─── Stripe provider helpers ───────────────────────────────────────────────────
// `stripeClient` is null in mock mode (no gateway configured for this tenant yet) —
// every call falls back to a fabricated mock response so the rest of the checkout
// flow works identically for demo/unconfigured tenants.

async function providerCreateIntent(stripeClient, amount, currency, metadata, customerId = null) {
  if (stripeClient) {
    const intentParams = {
      amount,
      currency,
      metadata,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: 'off_session', // save card for future purchases
      ...(customerId && { customer: customerId }),
    };
    return stripeClient.paymentIntents.create(intentParams);
  }

  // Mock fallback
  return {
    id:            `mock_pi_${uuidv4().replace(/-/g, '')}`,
    client_secret: `mock_cs_${uuidv4().replace(/-/g, '')}`,
    amount, currency,
    status: 'requires_payment_method',
  };
}

async function providerRetrieveIntent(stripeClient, paymentIntentId) {
  if (stripeClient) return stripeClient.paymentIntents.retrieve(paymentIntentId);
  return { id: paymentIntentId, status: 'succeeded' }; // mock: always succeed
}

async function providerRefund(stripeClient, paymentIntentId, amountCents = null) {
  if (stripeClient) {
    const params = { payment_intent: paymentIntentId };
    if (amountCents) params.amount = amountCents; // partial refund
    return stripeClient.refunds.create(params);
  }
  return { id: `mock_re_${uuidv4().replace(/-/g, '')}`, payment_intent: paymentIntentId, status: 'succeeded' };
}

function receiptNumber() {
  return `RCP-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

function calcExpiresAt(days) {
  if (!days || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ─── Initiate payment ─────────────────────────────────────────────────────────
// Returns either a Stripe shape ({ clientSecret, publishableKey }) or a manual-
// payment shape ({ accounts, instructions }) depending on which gateway the
// tenant has configured.
async function initiatePayment(tenantId, courseId, userId, { couponCode, linkToken } = {}) {
  const [course, tenant, user] = await Promise.all([
    Course.findOne({ _id: courseId, tenantId, deletedAt: null }),
    tenantRepo.findById(tenantId),
    User.findOne({ _id: userId, tenantId, deletedAt: null }).select('+stripeCustomerId'),
  ]);

  if (!course) throw new AppError('Course not found', 404);
  if (course.isFree) throw new AppError('Course is free — no payment needed', 400);
  if (course.status !== 'published') throw new AppError('Course is not available', 400);

  const existing = await Enrollment.findOne({ tenantId, courseId, userId, status: 'active', isTrial: false });
  if (existing) throw new AppError('Already enrolled in this course', 409);

  const currency = (tenant?.settings?.currency || 'usd').toLowerCase();

  let finalAmount   = Math.round((course.price || 0) * 100); // cents
  let discountAmount = 0;
  let appliedCoupon  = null;
  let enrollmentLinkDoc = null;

  // Enrollment-link custom price — re-verified here (never trusted from
  // what the client displayed) against the link record itself. Mutually
  // exclusive with a coupon: a link's own price already *is* the deal.
  if (linkToken) {
    const linkRepo = require('../../database/repositories/enrollmentLink.repository');
    enrollmentLinkDoc = await linkRepo.findByToken(linkToken);
    if (!enrollmentLinkDoc || !enrollmentLinkDoc.isActive || enrollmentLinkDoc.tenantId?.toString() !== tenantId.toString())
      throw new AppError('This enrollment link is no longer valid', 410);
    if (enrollmentLinkDoc.expiresAt && new Date() > new Date(enrollmentLinkDoc.expiresAt))
      throw new AppError('This enrollment link has expired', 410);
    if (enrollmentLinkDoc.maxUses > 0 && enrollmentLinkDoc.uses >= enrollmentLinkDoc.maxUses)
      throw new AppError('This enrollment link has reached its maximum number of uses', 410);
    const linkedCourseIds = enrollmentLinkDoc.courseIds.map((c) => (c._id || c).toString());
    if (!linkedCourseIds.includes(courseId.toString()))
      throw new AppError('This link does not include this course', 400);
    if (enrollmentLinkDoc.priceOverride != null) {
      finalAmount = Math.round(enrollmentLinkDoc.priceOverride * 100);
    }
  } else if (couponCode) {
    try {
      const couponSvc = require('../coupon/coupon.service');
      const disc = await couponSvc.validateCoupon(tenantId, couponCode, courseId, course.price);
      discountAmount = Math.round(disc.discountAmount * 100);
      finalAmount    = Math.round(disc.finalPrice * 100);
      appliedCoupon  = disc.code;
    } catch {
      throw new AppError('Invalid or inapplicable coupon code', 400, 'COUPON_INVALID');
    }
  }

  const gateway = await tenantService.getActiveGateway(tenantId);

  // ── Manual: tenant's own bank/JazzCash/EasyPaisa accounts, student uploads proof ──
  if (gateway.provider === 'manual') {
    const payment = await CoursePayment.create({
      tenantId, courseId, userId,
      amount:        finalAmount,
      currency,
      discountAmount,
      couponCode:    appliedCoupon,
      enrollmentLinkId: enrollmentLinkDoc?._id || null,
      provider:      'manual',
      receiptNumber: receiptNumber(),
      status:        'pending', // awaiting proof upload
    });

    return {
      paymentId:    payment._id,
      provider:     'manual',
      amount:       finalAmount,
      currency,
      courseName:   course.title,
      accounts:     gateway.accounts,
      instructions: gateway.instructions,
    };
  }

  // ── Wise: tenant's own account details, student uploads proof ────────────────
  // Same review workflow as Manual (see uploadPaymentProof/approveManualPayment
  // below, which accept both providers) — Wise has no usable one-off-checkout
  // API to integrate against.
  if (gateway.provider === 'wise') {
    const payment = await CoursePayment.create({
      tenantId, courseId, userId,
      amount:        finalAmount,
      currency,
      discountAmount,
      couponCode:    appliedCoupon,
      enrollmentLinkId: enrollmentLinkDoc?._id || null,
      provider:      'wise',
      receiptNumber: receiptNumber(),
      status:        'pending', // awaiting proof upload
    });

    return {
      paymentId:    payment._id,
      provider:     'wise',
      amount:       finalAmount,
      currency,
      courseName:   course.title,
      account:      gateway.account,
      instructions: gateway.instructions,
    };
  }

  // ── PayPal (tenant's own Business app) ────────────────────────────────────────
  if (gateway.provider === 'paypal') {
    const order = await paypalService.createOrder(
      gateway.clientId, gateway.clientSecret, gateway.mode,
      finalAmount, currency,
      { paymentId: uuidv4() } // custom_id — the real CoursePayment _id isn't known until after create() below
    );

    const payment = await CoursePayment.create({
      tenantId, courseId, userId,
      amount:        finalAmount,
      currency,
      discountAmount,
      couponCode:    appliedCoupon,
      enrollmentLinkId: enrollmentLinkDoc?._id || null,
      paypalOrderId: order.id,
      provider:      'paypal',
      receiptNumber: receiptNumber(),
      status:        'pending',
    });

    return {
      paymentId:      payment._id,
      provider:       'paypal',
      paypalOrderId:  order.id,
      paypalClientId: gateway.clientId,
      amount:         finalAmount,
      currency,
      courseName:     course.title,
    };
  }

  // ── Stripe (tenant's own key) or mock fallback ───────────────────────────────
  const stripeClient = gateway.provider === 'stripe' ? getTenantStripeClient(gateway.secretKey) : null;

  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const stripeCustomerId = stripeClient
    ? await createOrGetCustomer(stripeClient, userId, user?.email ?? '', userName, user?.stripeCustomerId ?? null)
    : null;

  const resolvedProvider = stripeClient ? 'stripe' : 'mock';
  const intent = await providerCreateIntent(
    stripeClient, finalAmount, currency,
    { courseId: courseId.toString(), userId: userId.toString(), tenantId: tenantId.toString() },
    stripeCustomerId
  );

  const payment = await CoursePayment.create({
    tenantId, courseId, userId,
    amount:          finalAmount,
    currency,
    discountAmount,
    couponCode:      appliedCoupon,
    enrollmentLinkId: enrollmentLinkDoc?._id || null,
    paymentIntentId: intent.id,
    provider:        resolvedProvider,
    receiptNumber:   receiptNumber(),
    status:          'pending',
  });

  return {
    paymentId:        payment._id,
    paymentIntentId:  intent.id,
    clientSecret:     intent.client_secret,
    amount:           finalAmount,
    currency,
    courseName:       course.title,
    provider:         resolvedProvider,
    publishableKey:   stripeClient ? gateway.publishableKey : null,
  };
}

// ─── Confirm payment (step 2 — after client confirms card) ───────────────────
// Manual payments never use this path — they only reach 'completed' via admin
// approval (see approveManualPayment below).
async function confirmPayment(tenantId, paymentId, userId) {
  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, userId, status: 'pending' });
  if (!payment) throw new AppError('Payment not found or already processed', 404);
  return _confirmAndActivate(payment);
}

// ─── Webhook confirm (platform-Stripe webhook only — see modules/webhook/stripe.webhook.js).
// Tenant-owned Stripe accounts (BYO key) live outside the platform Stripe account, so no
// webhook event ever arrives for them; this path only ever matters for mock-mode intents.
async function confirmPaymentByIntentId(paymentIntentId) {
  const payment = await CoursePayment.findOne({ paymentIntentId, status: 'pending' });
  if (!payment) return null;
  return _confirmAndActivate(payment);
}

// ─── PayPal: capture the order after the student approves it client-side
// (the JS SDK's onApprove callback) — this is PayPal's equivalent of
// confirmPayment above, just a different provider-specific flow.
async function capturePaypalOrder(tenantId, paymentId, userId) {
  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, userId, provider: 'paypal', status: 'pending' });
  if (!payment) throw new AppError('Payment not found or already processed', 404);

  const gateway = await tenantService.getActiveGateway(tenantId);
  if (gateway.provider !== 'paypal') throw new AppError('PayPal is not configured for this school', 400);

  const captured = await paypalService.captureOrder(gateway.clientId, gateway.clientSecret, gateway.mode, payment.paypalOrderId);
  const capture = captured?.purchase_units?.[0]?.payments?.captures?.[0];
  if (captured.status !== 'COMPLETED' || !capture || capture.status !== 'COMPLETED')
    throw new AppError('PayPal payment not completed', 402, 'PAYMENT_FAILED');

  payment.paypalCaptureId = capture.id;
  await payment.save();

  return _activatePayment(payment);
}

// ─── Shared confirm — branches by provider, then activates enrollment ────────
async function _confirmAndActivate(payment) {
  let stripeClient = null;
  if (payment.provider === 'stripe') {
    const gateway = await tenantService.getActiveGateway(payment.tenantId);
    stripeClient = gateway.provider === 'stripe' ? getTenantStripeClient(gateway.secretKey) : null;
  }

  const intent = await providerRetrieveIntent(stripeClient, payment.paymentIntentId);
  if (intent.status !== 'succeeded') throw new AppError('Payment not confirmed by Stripe', 402, 'PAYMENT_FAILED');

  return _activatePayment(payment);
}

// ─── Shared enrollment activation ────────────────────────────────────────────
async function _activatePayment(payment) {
  const course = await Course.findById(payment.courseId);

  if (payment.couponCode) {
    const couponSvc = require('../coupon/coupon.service');
    await couponSvc.applyCoupon(
      payment.tenantId, payment.couponCode,
      payment.courseId.toString(),
      (payment.amount + payment.discountAmount) / 100
    ).catch(() => {});
  }

  const existing = await Enrollment.findOne({
    tenantId: payment.tenantId, courseId: payment.courseId, userId: payment.userId,
  });
  let enrollment;
  if (existing) {
    existing.status         = 'active';
    existing.isTrial        = false;
    existing.enrolledAt     = new Date();
    existing.pricePaid      = payment.amount / 100;
    existing.discountAmount = payment.discountAmount / 100;
    existing.couponCode     = payment.couponCode;
    existing.expiresAt      = calcExpiresAt(course?.accessDurationDays);
    await existing.save();
    enrollment = existing;
  } else {
    enrollment = await Enrollment.create({
      tenantId:      payment.tenantId,
      courseId:      payment.courseId,
      userId:        payment.userId,
      pricePaid:     payment.amount / 100,
      discountAmount: payment.discountAmount / 100,
      couponCode:    payment.couponCode,
      expiresAt:     calcExpiresAt(course?.accessDurationDays),
    });
    await Course.updateOne({ _id: payment.courseId, tenantId: payment.tenantId }, { $inc: { enrollmentCount: 1 } });
  }

  payment.status       = 'completed';
  payment.paidAt       = new Date();
  payment.enrollmentId = enrollment._id;
  await payment.save();

  if (payment.enrollmentLinkId) {
    const linkRepo = require('../../database/repositories/enrollmentLink.repository');
    linkRepo.incrementUses(payment.enrollmentLinkId).catch(() => {});
  }

  const { emitDashboardUpdated } = require('../../services/socket/io');
  emitDashboardUpdated(payment.tenantId, { event: 'new_enrollment' });

  return { payment, enrollment };
}

// ─── Manual payment: student uploads proof screenshot ─────────────────────────
// Allowed from 'pending' (first submission) or 'rejected' (resubmission after
// admin rejected an earlier proof) — resubmitting clears the prior review so
// the record goes back into the admin's review queue clean.
async function uploadPaymentProof(tenantId, paymentId, userId, proofUrl) {
  const payment = await CoursePayment.findOne({
    _id: paymentId, tenantId, userId, provider: { $in: ['manual', 'wise'] }, status: { $in: ['pending', 'rejected'] },
  });
  if (!payment) throw new AppError('Payment not found or not awaiting proof submission', 404);

  payment.proofImageUrl   = proofUrl;
  payment.proofUploadedAt = new Date();
  payment.status          = 'awaiting_review';
  payment.reviewNote      = null;
  payment.reviewedBy      = null;
  payment.reviewedAt      = null;
  await payment.save();

  // In-app notification to every tenant admin so a new proof doesn't sit
  // unnoticed in the review queue — intentionally no email (see
  // notifyPaymentProofSubmitted's comment).
  const [course, student] = await Promise.all([
    Course.findById(payment.courseId).select('title'),
    User.findOne({ _id: userId, tenantId }).select('firstName lastName'),
  ]);
  const admins = await User.find({ tenantId, role: 'tenant_admin', deletedAt: null }).select('_id').lean();
  if (admins.length > 0) {
    require('../notification/notification.service').notifyPaymentProofSubmitted(
      tenantId, admins.map((a) => a._id),
      student ? `${student.firstName} ${student.lastName}`.trim() : 'A student',
      course?.title ?? 'a course',
      '/admin/payment-proofs'
    ).catch(() => {});
  }

  return payment;
}

// ─── Manual payment: admin approves — enrolls the student + notifies ─────────
async function approveManualPayment(tenantId, paymentId, actingUser, { reviewNote = '' } = {}) {
  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, provider: { $in: ['manual', 'wise'] }, status: 'awaiting_review' });
  if (!payment) throw new AppError('Pending manual payment not found', 404);

  if (actingUser.role === 'instructor') {
    const course = await Course.findOne({ _id: payment.courseId, tenantId }).select('instructorId');
    if (course && course.instructorId?.toString() !== actingUser.sub.toString())
      throw new AppError('You can only review payments for your own courses', 403);
  }

  payment.reviewedBy = actingUser.sub;
  payment.reviewedAt = new Date();
  payment.reviewNote = reviewNote;
  await payment.save();

  const result = await _activatePayment(payment);

  const course = await Course.findById(payment.courseId).select('title');
  require('../notification/notification.service')
    .notifyPaymentApproved(tenantId, payment.userId.toString(), course?.title ?? 'the course', `/courses/${payment.courseId}/learn`)
    .catch(() => {});

  return result;
}

// ─── Manual payment: admin rejects — student can re-upload on the same record ─
async function rejectManualPayment(tenantId, paymentId, actingUser, { reviewNote = '' } = {}) {
  if (!reviewNote?.trim()) throw new AppError('A reason is required when rejecting a payment', 400);

  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, provider: { $in: ['manual', 'wise'] }, status: 'awaiting_review' });
  if (!payment) throw new AppError('Pending manual payment not found', 404);

  if (actingUser.role === 'instructor') {
    const course = await Course.findOne({ _id: payment.courseId, tenantId }).select('instructorId');
    if (course && course.instructorId?.toString() !== actingUser.sub.toString())
      throw new AppError('You can only review payments for your own courses', 403);
  }

  payment.status      = 'rejected';
  payment.reviewedBy  = actingUser.sub;
  payment.reviewedAt  = new Date();
  payment.reviewNote  = reviewNote.trim();
  await payment.save();

  const course = await Course.findById(payment.courseId).select('title');
  require('../notification/notification.service')
    .notifyPaymentRejected(tenantId, payment.userId.toString(), course?.title ?? 'the course', reviewNote.trim())
    .catch(() => {});

  return payment;
}

// ─── Manual payment: admin review queue ───────────────────────────────────────
async function listPendingManualPayments(tenantId, actingUser, { status = 'awaiting_review', page = 1, limit = 20 } = {}) {
  const filter = { tenantId, provider: { $in: ['manual', 'wise'] } };
  if (status) filter.status = status;
  if (actingUser.role === 'instructor') {
    filter.courseId = { $in: await Course.distinct('_id', { tenantId, instructorId: actingUser.sub }) };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    CoursePayment.find(filter)
      .sort({ proofUploadedAt: -1, createdAt: -1 })
      .skip(skip).limit(Number(limit))
      .populate('userId', 'firstName lastName email')
      .populate('courseId', 'title thumbnail'),
    CoursePayment.countDocuments(filter),
  ]);
  return { payments, total, page: Number(page), limit: Number(limit) };
}

// ─── Refund (admin) ───────────────────────────────────────────────────────────
async function refundPayment(tenantId, paymentId, actingUser, { reason = '', amount = null } = {}) {
  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, status: 'completed' });
  if (!payment) throw new AppError('Completed payment not found', 404);

  // route is course:manage-gated (every instructor tenant-wide, same gap
  // fixed in bundle.service.js's refundBundlePayment) — without this an
  // instructor could trigger a real Stripe refund + un-enrollment for any
  // course in the tenant, not just their own.
  if (actingUser.role === 'instructor') {
    const course = await Course.findOne({ _id: payment.courseId, tenantId }).select('instructorId');
    if (course && course.instructorId?.toString() !== actingUser.sub.toString())
      throw new AppError('You can only refund payments for your own courses', 403);
  }

  const refundCents = amount ? Math.round(Number(amount)) : null; // null = full refund
  const isPartial   = refundCents !== null && refundCents < payment.amount;

  if (payment.provider === 'paypal') {
    if (!payment.paypalCaptureId)
      throw new AppError('This PayPal payment has no capture ID on record — refund manually in the PayPal dashboard.', 400);
    const gateway = await tenantService.getActiveGateway(tenantId);
    if (gateway.provider !== 'paypal')
      throw new AppError('PayPal is not currently configured for this school — refund manually in the PayPal dashboard.', 400);
    await paypalService.refundCapture(gateway.clientId, gateway.clientSecret, gateway.mode, payment.paypalCaptureId, refundCents, payment.currency);
  } else if (payment.provider === 'wise') {
    // No gateway to auto-refund, same precedent as Manual below.
    throw new AppError('This was a manually verified Wise payment — there is no gateway to auto-refund. Unenroll the student and settle any refund with them directly.', 400);
  } else if (payment.provider === 'safepay') {
    // Legacy — Safepay is no longer integrated. No automated refund path was
    // ever confirmed working for it; admin reconciles manually.
    throw new AppError('This was a Safepay payment — process the refund manually and contact support to reconcile the record.', 400);
  } else if (payment.provider === 'manual') {
    // This was a manually verified bank/JazzCash/EasyPaisa payment — there's no
    // gateway to auto-refund. Admin unenrolls the student and settles any
    // refund with them directly (same "record the fact, don't move money we
    // can't verify" precedent as the Safepay/PayPal branches above).
    throw new AppError('This was a manually verified payment — there is no gateway to auto-refund. Unenroll the student and settle any refund with them directly.', 400);
  } else if (payment.provider === 'stripe') {
    const gateway = await tenantService.getActiveGateway(tenantId);
    const stripeClient = gateway.provider === 'stripe' ? getTenantStripeClient(gateway.secretKey) : null;
    await providerRefund(stripeClient, payment.paymentIntentId, refundCents);
  } else {
    await providerRefund(null, payment.paymentIntentId, refundCents); // mock
  }

  // Partial refunds don't unenroll; only full refunds remove course access
  if (isPartial) {
    payment.status       = 'refunded';
    payment.refundedAt   = new Date();
    payment.refundedBy   = actingUser.sub;
    payment.refundReason = reason;
    await payment.save();
    return payment;
  }

  payment.status       = 'refunded';
  payment.refundedAt   = new Date();
  payment.refundedBy   = actingUser.sub;
  payment.refundReason = reason;
  await payment.save();

  await Enrollment.updateOne({ _id: payment.enrollmentId }, { status: 'dropped', droppedAt: new Date() });
  await Course.updateOne({ _id: payment.courseId, tenantId }, { $inc: { enrollmentCount: -1 } });

  return payment;
}

// ─── History ──────────────────────────────────────────────────────────────────
async function getMyPayments(tenantId, userId, query = {}) {
  const { page = 1, limit = 20, provider, dateFrom, dateTo, status } = query;
  const filter = { tenantId, userId };
  if (provider) filter.provider = provider;
  if (status)   filter.status   = status;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    CoursePayment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('courseId', 'title thumbnail'),
    CoursePayment.countDocuments(filter),
  ]);
  return { payments, total, page: Number(page), limit: Number(limit) };
}

async function getCoursePayments(tenantId, courseId, query = {}, actingUser) {
  // Same course:manage gap as refundPayment above — without this an
  // instructor could read another instructor's students' payment records
  // (names, emails, amounts) for a course they don't teach.
  if (actingUser?.role === 'instructor') {
    const course = await Course.findOne({ _id: courseId, tenantId }).select('instructorId');
    if (course && course.instructorId?.toString() !== actingUser.sub.toString())
      throw new AppError('You can only view payments for your own courses', 403);
  }

  const { page = 1, limit = 20 } = query;
  const skip = (page - 1) * limit;
  const [payments, total] = await Promise.all([
    CoursePayment.find({ tenantId, courseId })
      .sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .populate('userId', 'firstName lastName email'),
    CoursePayment.countDocuments({ tenantId, courseId }),
  ]);
  return { payments, total, page: Number(page), limit: Number(limit) };
}

// ─── Saved payment methods ────────────────────────────────────────────────────
// Only available for tenants on the Stripe gateway — manual/mock have no
// saved-card concept in this integration.

async function getPaymentMethods(userId, tenantId) {
  const gateway = await tenantService.getActiveGateway(tenantId);
  const stripeClient = gateway.provider === 'stripe' ? getTenantStripeClient(gateway.secretKey) : null;
  const user = await User.findOne({ _id: userId, tenantId, deletedAt: null }).select('+stripeCustomerId');
  if (!user?.stripeCustomerId || !stripeClient) return [];

  try {
    const list = await stripeClient.paymentMethods.list({ customer: user.stripeCustomerId, type: 'card' });
    return list.data.map(pm => ({
      id:       pm.id,
      brand:    pm.card.brand,
      last4:    pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear:  pm.card.exp_year,
    }));
  } catch { return []; }
}

async function createSetupIntent(userId, tenantId) {
  const gateway = await tenantService.getActiveGateway(tenantId);
  const stripeClient = gateway.provider === 'stripe' ? getTenantStripeClient(gateway.secretKey) : null;
  if (!stripeClient) return { clientSecret: null }; // mock mode / non-Stripe gateway

  const user = await User.findOne({ _id: userId, tenantId, deletedAt: null }).select('+stripeCustomerId');
  if (!user) throw new AppError('User not found', 404);

  const customerId = await createOrGetCustomer(
    stripeClient, userId, user.email, `${user.firstName} ${user.lastName}`.trim(), user.stripeCustomerId
  );

  const si = await stripeClient.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
  });
  return { clientSecret: si.client_secret };
}

async function deletePaymentMethod(userId, tenantId, methodId) {
  const gateway = await tenantService.getActiveGateway(tenantId);
  const stripeClient = gateway.provider === 'stripe' ? getTenantStripeClient(gateway.secretKey) : null;
  if (!stripeClient) throw new AppError('Not available in mock mode', 400);

  const user = await User.findOne({ _id: userId, tenantId, deletedAt: null }).select('+stripeCustomerId');
  if (!user?.stripeCustomerId) throw new AppError('No saved payment methods', 404);

  // Verify the method belongs to this customer before detaching
  const pm = await stripeClient.paymentMethods.retrieve(methodId);
  if (pm.customer !== user.stripeCustomerId) throw new AppError('Payment method not found', 404);

  await stripeClient.paymentMethods.detach(methodId);
  return { deleted: true };
}

// ─── PDF Receipt ─────────────────────────────────────────────────────────────
// Streams a PDF to the response. Caller must set headers before invoking.
async function generateReceiptPdf(tenantId, paymentId, userId, res) {
  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, userId })
    .populate('courseId', 'title');
  if (!payment) throw new AppError('Payment not found', 404);

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.receiptNumber || payment._id}.pdf"`);
  doc.pipe(res);

  const appName = process.env.APP_NAME || 'LMS Platform';
  const paid    = payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const amtFmt  = (cents, cur) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: (cur || 'usd').toUpperCase() }).format(cents / 100);

  // Header band
  doc.rect(0, 0, doc.page.width, 90).fill('#1e3a5f');
  doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text(appName, 50, 30);
  doc.fontSize(11).font('Helvetica').text('Payment Receipt', 50, 58);
  doc.fillColor('#000000');

  // Receipt meta
  doc.moveDown(3);
  doc.fontSize(10).font('Helvetica').fillColor('#6b7280').text('Receipt Number', 50, 115);
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827').text(payment.receiptNumber || payment._id.toString(), 50, 130);

  doc.fontSize(10).font('Helvetica').fillColor('#6b7280').text('Date', 320, 115);
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827').text(paid, 320, 130);

  // Divider
  doc.moveTo(50, 165).lineTo(545, 165).strokeColor('#e5e7eb').lineWidth(1).stroke();

  // Line items
  let y = 185;
  doc.fontSize(10).font('Helvetica').fillColor('#6b7280').text('Description', 50, y);
  doc.text('Amount', 450, y, { align: 'right', width: 95 });
  doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  y += 28;

  const courseTitle = payment.courseId?.title ?? 'Course Purchase';
  doc.fontSize(11).font('Helvetica').fillColor('#111827').text(courseTitle, 50, y, { width: 350 });
  doc.text(amtFmt(payment.amount + (payment.discountAmount || 0), payment.currency), 450, y, { align: 'right', width: 95 });
  y += 20;

  if (payment.discountAmount && payment.discountAmount > 0) {
    doc.fontSize(10).fillColor('#059669')
       .text(`Discount${payment.couponCode ? ` (${payment.couponCode})` : ''}`, 50, y, { width: 350 });
    doc.text(`−${amtFmt(payment.discountAmount, payment.currency)}`, 450, y, { align: 'right', width: 95 });
    y += 20;
  }

  // Total band
  y += 8;
  doc.rect(50, y, 495, 36).fill('#f9fafb');
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827')
     .text('Total Paid', 60, y + 11)
     .text(amtFmt(payment.amount, payment.currency), 450, y + 11, { align: 'right', width: 85 });
  y += 52;

  // Payment method + status
  doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
     .text(`Payment Method: ${payment.provider.charAt(0).toUpperCase() + payment.provider.slice(1)}   |   Status: ${payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}`, 50, y);

  // Footer — footerY+10 must clear the page's own bottom margin (page.height
  // - 50) with room for the actual text line, or PDFKit's overflow check
  // spawns a spurious near-blank 2nd page for every receipt. The old -60/+10
  // put the text at exactly page.height-50 — zero clearance. Confirmed live:
  // every generated receipt PDF came back as 2 pages, the second one empty
  // except for this footer line.
  const footerY = doc.page.height - 80;
  doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  doc.fontSize(9).fillColor('#9ca3af')
     .text(`Generated by ${appName} on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 50, footerY + 10, { align: 'center', width: 495 });

  doc.end();
}

module.exports = {
  initiatePayment, confirmPayment, confirmPaymentByIntentId, capturePaypalOrder,
  refundPayment, getMyPayments, getCoursePayments,
  getPaymentMethods, createSetupIntent, deletePaymentMethod,
  generateReceiptPdf,
  uploadPaymentProof, approveManualPayment, rejectManualPayment, listPendingManualPayments,
};
