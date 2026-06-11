const subscriptionRepo = require('../../database/repositories/subscription.repository');
const invoiceRepo = require('../../database/repositories/invoice.repository');
const couponRepo = require('../../database/repositories/coupon.repository');
const planRepo = require('../../database/repositories/plan.repository');
const tenantRepo = require('../../database/repositories/tenant.repository');
const { generateInvoiceNumber } = require('../../utils/invoiceNumber');
const AppError = require('../../utils/AppError');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function applyDiscount(subtotal, coupon) {
  if (!coupon) return { discountAmount: 0, total: subtotal };
  const discount = coupon.discountType === 'percentage'
    ? Math.round((subtotal * coupon.discountValue) / 100)
    : Math.min(coupon.discountValue, subtotal);
  return { discountAmount: discount, total: Math.max(0, subtotal - discount) };
}

function getPeriodEnd(start, cycle) {
  const d = new Date(start);
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

// ─── Subscriptions ────────────────────────────────────────────────────────────
async function listSubscriptions(query) {
  const { status, page, limit } = query;
  const filter = status ? { status } : {};
  const [subscriptions, total] = await subscriptionRepo.findAll(filter, { page, limit });
  return { subscriptions, pagination: { total, page: Number(page || 1), limit: Number(limit || 20) } };
}

async function createSubscription({ tenantId, planId, billingCycle, periodStart, periodEnd, isOnTrial, trialEnd, notes }, userId) {
  const existing = await subscriptionRepo.findByTenant(tenantId);
  if (existing) throw new AppError('Tenant already has a subscription. Use upgrade/downgrade instead.', 409);

  const plan = await planRepo.findById(planId);
  if (!plan) throw new AppError('Plan not found', 404);

  const sub = await subscriptionRepo.create({
    tenantId,
    planId,
    billingCycle,
    currentPeriodStart: new Date(periodStart),
    currentPeriodEnd: new Date(periodEnd),
    isOnTrial: isOnTrial || false,
    trialStart: isOnTrial ? new Date(periodStart) : null,
    trialEnd: isOnTrial ? new Date(trialEnd || periodEnd) : null,
    status: isOnTrial ? 'trial' : 'active',
    notes,
    createdBy: userId,
  });

  // Sync tenant plan fields
  await tenantRepo.updateById(tenantId, {
    plan: planId,
    planExpiresAt: new Date(periodEnd),
    isOnTrial: isOnTrial || false,
    trialEndsAt: isOnTrial ? new Date(trialEnd || periodEnd) : null,
    status: 'active',
  });

  return sub;
}

async function upgradePlan(subscriptionId, { planId, billingCycle, generateInvoiceFlag, couponCode }, userId) {
  const sub = await subscriptionRepo.findById(subscriptionId);
  if (!sub) throw new AppError('Subscription not found', 404);

  const newPlan = await planRepo.findById(planId);
  if (!newPlan) throw new AppError('Plan not found', 404);

  const now = new Date();
  const periodEnd = getPeriodEnd(now, billingCycle || sub.billingCycle);

  await subscriptionRepo.updateById(subscriptionId, {
    previousPlanId: sub.planId,
    planId,
    billingCycle: billingCycle || sub.billingCycle,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    status: 'active',
    isOnTrial: false,
    planChangedAt: now,
    updatedBy: userId,
  });

  await tenantRepo.updateById(sub.tenantId, {
    plan: planId,
    planExpiresAt: periodEnd,
    isOnTrial: false,
  });

  if (generateInvoiceFlag) {
    const price = billingCycle === 'yearly' ? newPlan.price.yearly : newPlan.price.monthly;
    return _createInvoiceInternal({
      tenantId: sub.tenantId,
      subscriptionId,
      planId,
      subtotal: price,
      billingCycle: billingCycle || sub.billingCycle,
      periodStart: now,
      periodEnd,
      couponCode,
      description: `Upgrade to ${newPlan.name}`,
    }, userId);
  }
}

async function downgradePlan(subscriptionId, { planId, effectiveDate }, userId) {
  const sub = await subscriptionRepo.findById(subscriptionId);
  if (!sub) throw new AppError('Subscription not found', 404);

  const newPlan = await planRepo.findById(planId);
  if (!newPlan) throw new AppError('Plan not found', 404);

  // Downgrade takes effect at end of current period
  const effective = effectiveDate ? new Date(effectiveDate) : sub.currentPeriodEnd;

  await subscriptionRepo.updateById(subscriptionId, {
    previousPlanId: sub.planId,
    planId,
    currentPeriodStart: effective,
    currentPeriodEnd: getPeriodEnd(effective, sub.billingCycle),
    planChangedAt: new Date(),
    updatedBy: userId,
  });

  await tenantRepo.updateById(sub.tenantId, {
    plan: planId,
    planExpiresAt: getPeriodEnd(effective, sub.billingCycle),
  });

  return { message: `Downgrade to ${newPlan.name} effective ${effective.toDateString()}` };
}

async function cancelSubscription(subscriptionId, { reason }, userId) {
  const sub = await subscriptionRepo.findById(subscriptionId);
  if (!sub) throw new AppError('Subscription not found', 404);
  if (sub.status === 'cancelled') throw new AppError('Already cancelled', 400);

  await subscriptionRepo.updateById(subscriptionId, {
    status: 'cancelled',
    cancelledAt: new Date(),
    cancelReason: reason || null,
    autoRenew: false,
    updatedBy: userId,
  });

  await tenantRepo.updateById(sub.tenantId, { status: 'suspended' });
}

async function renewSubscription(subscriptionId, { billingCycle }, userId) {
  const sub = await subscriptionRepo.findById(subscriptionId);
  if (!sub) throw new AppError('Subscription not found', 404);

  const cycle = billingCycle || sub.billingCycle;
  const now = new Date();
  const periodEnd = getPeriodEnd(now, cycle);

  await subscriptionRepo.updateById(subscriptionId, {
    status: 'active',
    billingCycle: cycle,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelledAt: null,
    cancelReason: null,
    updatedBy: userId,
  });

  await tenantRepo.updateById(sub.tenantId, {
    status: 'active',
    planExpiresAt: periodEnd,
  });
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
async function _createInvoiceInternal({ tenantId, subscriptionId, planId, subtotal, billingCycle, periodStart, periodEnd, couponCode, description, notes, dueDate, taxRate }, userId) {
  let coupon = null;
  if (couponCode) {
    coupon = await couponRepo.findByCode(couponCode);
    if (!coupon || !coupon.isActive) throw new AppError('Invalid coupon code', 400);
  }

  const { discountAmount } = applyDiscount(subtotal, coupon);
  const taxRatePct  = Number(taxRate) || 0;
  const taxableBase = Math.max(0, subtotal - discountAmount);
  const taxAmount   = taxRatePct > 0 ? Math.round((taxableBase * taxRatePct) / 100 * 100) / 100 : 0;
  const total       = Math.max(0, taxableBase + taxAmount);
  const due         = dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invoice = await invoiceRepo.create({
    tenantId,
    subscriptionId: subscriptionId || null,
    planId,
    invoiceNumber: generateInvoiceNumber(),
    billingCycle,
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    subtotal,
    discountAmount,
    taxRate: taxRatePct,
    taxAmount,
    total,
    couponId: coupon?._id || null,
    couponCode: coupon?.code || null,
    dueDate: due,
    description,
    notes,
  });

  if (coupon) {
    await couponRepo.incrementUsage(coupon._id, tenantId);
  }

  return invoice;
}

async function createInvoice(data, userId) {
  const { tenantId, planId, subtotal, billingCycle, periodStart, periodEnd, couponCode, dueDate, notes, description, taxRate } = data;

  const sub = await subscriptionRepo.findByTenant(tenantId);
  return _createInvoiceInternal({
    tenantId,
    subscriptionId: sub?._id,
    planId,
    subtotal,
    billingCycle: billingCycle || 'manual',
    periodStart,
    periodEnd,
    couponCode,
    description,
    notes,
    dueDate,
    taxRate,
  }, userId);
}

async function getInvoiceById(invoiceId) {
  return invoiceRepo.findById(invoiceId);
}

async function listInvoices(query) {
  const { tenantId, status, page, limit } = query;
  const filter = {};
  if (tenantId) filter.tenantId = tenantId;
  if (status) filter.status = status;
  const [invoices, total] = await invoiceRepo.findAll(filter, { page, limit });
  return { invoices, pagination: { total, page: Number(page || 1), limit: Number(limit || 20) } };
}

async function markInvoicePaid(invoiceId, { notes }, userId) {
  const invoice = await invoiceRepo.findById(invoiceId);
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (invoice.status === 'paid') throw new AppError('Invoice already paid', 400);
  if (invoice.status === 'cancelled') throw new AppError('Cannot pay a cancelled invoice', 400);

  const updated = await invoiceRepo.updateStatus(invoiceId, {
    status: 'paid',
    paidAt: new Date(),
    paidBy: userId,
    notes: notes || invoice.notes,
  });

  // Activate tenant if it was suspended due to non-payment
  await tenantRepo.updateById(invoice.tenantId._id || invoice.tenantId, { status: 'active' });

  return updated;
}

async function cancelInvoice(invoiceId, userId) {
  const invoice = await invoiceRepo.findById(invoiceId);
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (['paid', 'cancelled'].includes(invoice.status))
    throw new AppError(`Cannot cancel a ${invoice.status} invoice`, 400);

  return invoiceRepo.updateStatus(invoiceId, { status: 'cancelled' });
}

// ─── Coupons ──────────────────────────────────────────────────────────────────
async function listCoupons(query) {
  const { isActive, page, limit } = query;
  const filter = isActive !== undefined ? { isActive: isActive === 'true' } : {};
  const [coupons, total] = await couponRepo.findAll(filter, { page, limit });
  return { coupons, pagination: { total, page: Number(page || 1), limit: Number(limit || 20) } };
}

async function createCoupon(data, userId) {
  const existing = await couponRepo.findByCode(data.code);
  if (existing) throw new AppError('Coupon code already exists', 409);

  return couponRepo.create({
    code: data.code.toUpperCase().trim(),
    description: data.description || null,
    discountType: data.discountType,
    discountValue: data.discountValue,
    applicablePlans: data.applicablePlans || [],
    maxUses: data.maxUses || 0,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    onePerTenant: data.onePerTenant !== false,
    isActive: true,
    createdBy: userId,
  });
}

async function updateCoupon(id, data, userId) {
  const coupon = await couponRepo.findById(id);
  if (!coupon) throw new AppError('Coupon not found', 404);

  const allowed = ['description', 'isActive', 'maxUses', 'expiresAt', 'applicablePlans', 'onePerTenant'];
  const update = { updatedBy: userId };
  for (const f of allowed) { if (data[f] !== undefined) update[f] = data[f]; }

  return couponRepo.updateById(id, update);
}

async function deleteCoupon(id, userId) {
  const coupon = await couponRepo.findById(id);
  if (!coupon) throw new AppError('Coupon not found', 404);
  if (coupon.usedCount > 0) throw new AppError('Cannot delete a coupon that has been used. Deactivate it instead.', 400);
  return couponRepo.softDelete(id, userId);
}

// ─── Revenue Analytics ────────────────────────────────────────────────────────
async function getRevenueStats(query) {
  const { months = 12 } = query;
  const [overall, monthly] = await Promise.all([
    invoiceRepo.getRevenueStats(),
    invoiceRepo.getMonthlyRevenue(Number(months)),
  ]);

  // Use countDocuments directly so the count isn't capped by the default page limit
  const Subscription = require('../../database/models/Subscription.model');
  const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });

  return {
    overall: overall[0] || { totalRevenue: 0, totalInvoices: 0, avgInvoice: 0 },
    monthlyRevenue: monthly,
    activeSubscriptions,
  };
}

module.exports = {
  listSubscriptions, createSubscription, upgradePlan, downgradePlan,
  cancelSubscription, renewSubscription,
  getInvoiceById, listInvoices, createInvoice, markInvoicePaid, cancelInvoice,
  listCoupons, createCoupon, updateCoupon, deleteCoupon,
  getRevenueStats,
};
