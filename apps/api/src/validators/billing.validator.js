const AppError = require('../utils/AppError');

function validateCreateSubscription({ tenantId, planId, billingCycle, periodStart, periodEnd }) {
  if (!tenantId) throw new AppError('tenantId is required', 400);
  if (!planId) throw new AppError('planId is required', 400);
  if (!['monthly', 'yearly', 'manual'].includes(billingCycle))
    throw new AppError('billingCycle must be monthly, yearly, or manual', 400);
  if (!periodStart || !periodEnd) throw new AppError('periodStart and periodEnd are required', 400);
  if (new Date(periodEnd) <= new Date(periodStart))
    throw new AppError('periodEnd must be after periodStart', 400);
}

function validateCreateInvoice({ tenantId, planId, subtotal, dueDate, periodStart, periodEnd }) {
  if (!tenantId) throw new AppError('tenantId is required', 400);
  if (!planId) throw new AppError('planId is required', 400);
  if (subtotal === undefined || isNaN(subtotal) || subtotal < 0)
    throw new AppError('subtotal must be a non-negative number', 400);
  if (!dueDate) throw new AppError('dueDate is required', 400);
  if (!periodStart || !periodEnd) throw new AppError('periodStart and periodEnd are required', 400);
}

function validateCreateCoupon({ code, discountType, discountValue }) {
  if (!code?.trim()) throw new AppError('Coupon code is required', 400);
  if (!/^[A-Z0-9_-]+$/i.test(code))
    throw new AppError('Coupon code may only contain letters, numbers, hyphens and underscores', 400);
  if (!['percentage', 'fixed'].includes(discountType))
    throw new AppError('discountType must be percentage or fixed', 400);
  if (discountValue === undefined || isNaN(discountValue) || discountValue <= 0)
    throw new AppError('discountValue must be a positive number', 400);
  if (discountType === 'percentage' && discountValue > 100)
    throw new AppError('Percentage discount cannot exceed 100', 400);
}

module.exports = { validateCreateSubscription, validateCreateInvoice, validateCreateCoupon };
