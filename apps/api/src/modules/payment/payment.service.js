const { v4: uuidv4 }              = require('uuid');
const CoursePayment               = require('../../database/models/CoursePayment.model');
const Course                      = require('../../database/models/Course.model');
const Enrollment                  = require('../../database/models/Enrollment.model');
const User                        = require('../../database/models/User.model');
const AppError                    = require('../../utils/AppError');
const { getStripe, createOrGetCustomer } = require('../../services/stripe/stripe');
const paypalSvc                   = require('../../services/paypal/paypal');
const tenantRepo                  = require('../../database/repositories/tenant.repository');

// ─── Provider helpers ─────────────────────────────────────────────────────────

// Create a PaymentIntent.
// If stripeAccountId is provided, the PI is created on the connected account and
// application_fee_amount is collected by the platform automatically.
async function providerCreateIntent(amount, currency, metadata, stripeAccountId = null, customerId = null) {
  const stripe = getStripe();
  if (stripe) {
    const feePercent = parseFloat(process.env.STRIPE_PLATFORM_FEE_PERCENT || '0');
    const feeAmount  = (stripeAccountId && feePercent > 0)
      ? Math.max(1, Math.round(amount * feePercent / 100))
      : 0;

    const intentParams = {
      amount,
      currency,
      metadata,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: 'off_session', // save card for future purchases
      ...(customerId && { customer: customerId }),
      ...(feeAmount > 0 && { application_fee_amount: feeAmount }),
    };

    const stripeOptions = stripeAccountId ? { stripeAccount: stripeAccountId } : {};
    return stripe.paymentIntents.create(intentParams, stripeOptions);
  }

  // Mock fallback
  return {
    id:            `mock_pi_${uuidv4().replace(/-/g, '')}`,
    client_secret: `mock_cs_${uuidv4().replace(/-/g, '')}`,
    amount, currency,
    status: 'requires_payment_method',
  };
}

// Retrieve a PaymentIntent (for server-side verification after client confirms).
// Must pass stripeAccountId if the PI was created on a connected account.
async function providerRetrieveIntent(paymentIntentId, stripeAccountId = null) {
  const stripe = getStripe();
  if (stripe) {
    const stripeOptions = stripeAccountId ? { stripeAccount: stripeAccountId } : {};
    return stripe.paymentIntents.retrieve(paymentIntentId, {}, stripeOptions);
  }
  return { id: paymentIntentId, status: 'succeeded' }; // mock: always succeed
}

async function providerRefund(paymentIntentId, stripeAccountId = null, amountCents = null) {
  const stripe = getStripe();
  if (stripe) {
    const params = { payment_intent: paymentIntentId };
    if (amountCents) params.amount = amountCents; // partial refund
    const stripeOptions = stripeAccountId ? { stripeAccount: stripeAccountId } : {};
    return stripe.refunds.create(params, stripeOptions);
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
// provider: 'stripe' (default) | 'paypal'
// Returns different fields per provider:
//   stripe  → { paymentId, clientSecret, stripeAccountId, amount, currency, courseName }
//   paypal  → { paymentId, paypalOrderId, amount, currency, courseName }
async function initiatePayment(tenantId, courseId, userId, { couponCode, provider = 'stripe' } = {}) {
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

  if (couponCode) {
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

  // ── PayPal branch ──────────────────────────────────────────────────────────
  if (provider === 'paypal') {
    const order = await paypalSvc.createOrder(
      finalAmount, currency,
      `${courseId}_${userId}`
    );
    const resolvedProvider = paypalSvc.isConfigured() ? 'paypal' : 'mock';
    const payment = await CoursePayment.create({
      tenantId, courseId, userId,
      amount:        finalAmount,
      currency,
      discountAmount,
      couponCode:    appliedCoupon,
      paypalOrderId: order.id,
      provider:      resolvedProvider,
      receiptNumber: receiptNumber(),
      status:        'pending',
    });
    return {
      paymentId:    payment._id,
      paypalOrderId: order.id,
      amount:       finalAmount / 100,
      currency,
      courseName:   course.title,
      provider:     resolvedProvider,
    };
  }

  // ── Stripe branch (default) ───────────────────────────────────────────────
  let stripeAccountId = null;
  try {
    const connectSvc = require('../stripeConnect/stripeConnect.service');
    stripeAccountId  = await connectSvc.getConnectedAccountId(tenantId);
  } catch { /* no connect record — fall back to platform account */ }

  // Create or retrieve the Stripe customer for this user (enables saved cards)
  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const stripeCustomerId = await createOrGetCustomer(
    userId, user?.email ?? '', userName, user?.stripeCustomerId ?? null
  );

  const resolvedStripeProvider = getStripe() ? 'stripe' : 'mock';
  const intent = await providerCreateIntent(
    finalAmount, currency,
    { courseId: courseId.toString(), userId: userId.toString(), tenantId: tenantId.toString() },
    stripeAccountId,
    stripeCustomerId
  );

  const payment = await CoursePayment.create({
    tenantId, courseId, userId,
    amount:          finalAmount,
    currency,
    discountAmount,
    couponCode:      appliedCoupon,
    paymentIntentId: intent.id,
    stripeAccountId: stripeAccountId || null,
    provider:        resolvedStripeProvider,
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
    stripeAccountId:  stripeAccountId || null,
    provider:         resolvedStripeProvider,
  };
}

// ─── Confirm payment (step 2 — after client confirms card) ────────────────────
async function confirmPayment(tenantId, paymentId, userId) {
  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, userId, status: 'pending' });
  if (!payment) throw new AppError('Payment not found or already processed', 404);

  const intent = await providerRetrieveIntent(payment.paymentIntentId, payment.stripeAccountId);
  if (intent.status !== 'succeeded') throw new AppError('Payment not confirmed by Stripe', 402, 'PAYMENT_FAILED');

  return _activatePayment(payment);
}

// ─── Webhook confirm (called from webhook handler — no userId check) ──────────
async function confirmPaymentByIntentId(paymentIntentId) {
  const payment = await CoursePayment.findOne({ paymentIntentId, status: 'pending' });
  if (!payment) return null;
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

  const { emitDashboardUpdated } = require('../../services/socket/io');
  emitDashboardUpdated(payment.tenantId, { event: 'new_enrollment' });

  return { payment, enrollment };
}

// ─── Refund (admin) ───────────────────────────────────────────────────────────
async function refundPayment(tenantId, paymentId, actingUserId, { reason = '', amount = null } = {}) {
  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, status: 'completed' });
  if (!payment) throw new AppError('Completed payment not found', 404);

  const refundCents = amount ? Math.round(Number(amount)) : null; // null = full refund
  const isPartial   = refundCents !== null && refundCents < payment.amount;

  if (payment.provider === 'paypal') {
    if (!payment.paypalCaptureId) throw new AppError('PayPal capture ID missing — refund must be processed manually in PayPal dashboard', 400);
    await paypalSvc.refundCapture(payment.paypalCaptureId, refundCents || 0, payment.currency);
  } else {
    await providerRefund(payment.paymentIntentId, payment.stripeAccountId, refundCents);
  }

  // Partial refunds don't unenroll; only full refunds remove course access
  if (isPartial) {
    payment.status       = 'refunded';
    payment.refundedAt   = new Date();
    payment.refundedBy   = actingUserId;
    payment.refundReason = reason;
    await payment.save();
    return payment;
  }

  payment.status       = 'refunded';
  payment.refundedAt   = new Date();
  payment.refundedBy   = actingUserId;
  payment.refundReason = reason;
  await payment.save();

  await Enrollment.updateOne({ _id: payment.enrollmentId }, { status: 'dropped', droppedAt: new Date() });
  await Course.updateOne({ _id: payment.courseId, tenantId }, { $inc: { enrollmentCount: -1 } });

  return payment;
}

// ─── PayPal capture (step 2 — called after buyer approves on PayPal) ─────────
async function capturePaypalPayment(tenantId, paymentId, userId) {
  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, userId, status: 'pending' });
  if (!payment) throw new AppError('Payment not found or already processed', 404);
  if (!payment.paypalOrderId) throw new AppError('Not a PayPal payment', 400);

  if (payment.provider === 'paypal') {
    const capture = await paypalSvc.captureOrder(payment.paypalOrderId);
    const captureObj = capture.purchase_units?.[0]?.payments?.captures?.[0];
    if (capture.status !== 'COMPLETED' && captureObj?.status !== 'COMPLETED') {
      throw new AppError(`PayPal capture not completed: ${capture.status}`, 402, 'PAYMENT_FAILED');
    }
    // Store capture ID so refunds can target the specific capture resource
    if (captureObj?.id) {
      payment.paypalCaptureId = captureObj.id;
    }
  }
  // mock provider — no real capture needed

  return _activatePayment(payment);
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

async function getCoursePayments(tenantId, courseId, query = {}) {
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

async function getPaymentMethods(userId, tenantId) {
  const stripe = getStripe();
  const user   = await User.findOne({ _id: userId, tenantId, deletedAt: null }).select('+stripeCustomerId');
  if (!user?.stripeCustomerId || !stripe) return [];

  try {
    const list = await stripe.paymentMethods.list({ customer: user.stripeCustomerId, type: 'card' });
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
  const stripe = getStripe();
  if (!stripe) return { clientSecret: null }; // mock mode

  const user = await User.findOne({ _id: userId, tenantId, deletedAt: null }).select('+stripeCustomerId');
  if (!user) throw new AppError('User not found', 404);

  const customerId = await createOrGetCustomer(
    userId, user.email, `${user.firstName} ${user.lastName}`.trim(), user.stripeCustomerId
  );

  const si = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
  });
  return { clientSecret: si.client_secret };
}

async function deletePaymentMethod(userId, tenantId, methodId) {
  const stripe = getStripe();
  if (!stripe) throw new AppError('Not available in mock mode', 400);

  const user = await User.findOne({ _id: userId, tenantId, deletedAt: null }).select('+stripeCustomerId');
  if (!user?.stripeCustomerId) throw new AppError('No saved payment methods', 404);

  // Verify the method belongs to this customer before detaching
  const pm = await stripe.paymentMethods.retrieve(methodId);
  if (pm.customer !== user.stripeCustomerId) throw new AppError('Payment method not found', 404);

  await stripe.paymentMethods.detach(methodId);
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

  // Footer
  const footerY = doc.page.height - 60;
  doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  doc.fontSize(9).fillColor('#9ca3af')
     .text(`Generated by ${appName} on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 50, footerY + 10, { align: 'center', width: 495 });

  doc.end();
}

// ─── PayPal subscription (tenant membership billing) ─────────────────────────
// Creates a PayPal billing plan + subscription for a tenant plan upgrade.
// Returns { subscriptionId, approveUrl } — frontend redirects user to approveUrl.
async function initiatePaypalSubscription(tenantId, userId, { planName, amountCents, currency = 'usd', billingCycle = 'monthly' } = {}) {
  const user = await User.findOne({ _id: userId, tenantId, deletedAt: null });
  if (!user) throw new AppError('User not found', 404);

  const intervalUnit = billingCycle === 'yearly' ? 'YEAR' : 'MONTH';
  const plan = await paypalSvc.createBillingPlan(planName, amountCents, currency, intervalUnit);

  const subscriberName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const subscription   = await paypalSvc.createSubscription(plan.id, user.email, subscriberName);

  const approveLink = subscription.links?.find(l => l.rel === 'approve');
  return {
    subscriptionId: subscription.id,
    paypalPlanId:   plan.id,
    approveUrl:     approveLink?.href ?? null,
    status:         subscription.status,
  };
}

async function cancelPaypalSubscription(tenantId, userId, subscriptionId, reason = '') {
  // Verify the user belongs to this tenant before cancelling
  const user = await User.findOne({ _id: userId, tenantId, deletedAt: null });
  if (!user) throw new AppError('User not found', 404);
  return paypalSvc.cancelSubscription(subscriptionId, reason || 'Cancelled by user');
}

module.exports = {
  initiatePayment, confirmPayment, confirmPaymentByIntentId,
  capturePaypalPayment,
  refundPayment, getMyPayments, getCoursePayments,
  getPaymentMethods, createSetupIntent, deletePaymentMethod,
  generateReceiptPdf,
  initiatePaypalSubscription, cancelPaypalSubscription,
};
