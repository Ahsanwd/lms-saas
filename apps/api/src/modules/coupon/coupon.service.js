const CourseCoupon = require('../../database/models/CourseCoupon.model');
const AppError = require('../../utils/AppError');

// ─── Validate a coupon code for a specific course ─────────────────────────────
async function validateCoupon(tenantId, code, courseId, coursePrice) {
  const coupon = await CourseCoupon.findOne({
    tenantId,
    code: code.trim().toUpperCase(),
    isActive: true,
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      { $or: [{ maxUses: 0 }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }] },
    ],
  });

  if (!coupon) throw new AppError('Invalid or expired coupon code', 404, 'COUPON_INVALID');

  // Check course applicability (empty = all courses)
  if (
    coupon.applicableCourses.length > 0 &&
    !coupon.applicableCourses.some(c => c.toString() === courseId.toString())
  ) {
    throw new AppError('This coupon is not valid for this course', 400, 'COUPON_NOT_APPLICABLE');
  }

  const discountAmount = coupon.discountType === 'percentage'
    ? Math.min((coursePrice * coupon.discountValue) / 100, coursePrice)
    : Math.min(coupon.discountValue, coursePrice);

  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalPrice: Math.max(0, Math.round((coursePrice - discountAmount) * 100) / 100),
  };
}

// ─── Apply coupon (called internally during enrollment) ───────────────────────
// Uses atomic findOneAndUpdate so concurrent enrollments cannot exceed maxUses.
async function applyCoupon(tenantId, code, courseId, coursePrice) {
  const result = await validateCoupon(tenantId, code, courseId, coursePrice);

  // Atomic: only increments if the coupon is still valid and under the usage limit.
  const updated = await CourseCoupon.findOneAndUpdate(
    {
      tenantId,
      code: result.code,
      isActive: true,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
        { $or: [{ maxUses: 0 }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }] },
      ],
    },
    { $inc: { usedCount: 1 } },
    { new: true }
  );

  if (!updated) throw new AppError('Coupon is no longer valid or has reached its usage limit', 400, 'COUPON_EXHAUSTED');

  return result;
}

// ─── List coupons ─────────────────────────────────────────────────────────────
async function listCoupons(tenantId, { search, isActive, page = 1, limit = 20 } = {}) {
  const filter = { tenantId };
  if (isActive !== undefined) filter.isActive = isActive === 'true' || isActive === true;
  if (search) filter.code = { $regex: search.toUpperCase(), $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const [coupons, total] = await Promise.all([
    CourseCoupon.find(filter)
      .populate('applicableCourses', 'title')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    CourseCoupon.countDocuments(filter),
  ]);

  return { coupons, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } };
}

// ─── Create coupon ────────────────────────────────────────────────────────────
async function createCoupon(tenantId, data, actingUser) {
  const { code, description, discountType, discountValue, applicableCourses, maxUses, expiresAt } = data;

  if (!code?.trim()) throw new AppError('Coupon code is required', 400);
  if (!['percentage', 'fixed'].includes(discountType)) throw new AppError('discountType must be percentage or fixed', 400);
  if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100))
    throw new AppError('Percentage discount must be between 1 and 100', 400);
  if (discountType === 'fixed' && discountValue <= 0)
    throw new AppError('Fixed discount must be greater than 0', 400);

  const existing = await CourseCoupon.findOne({ tenantId, code: code.trim().toUpperCase() });
  if (existing) throw new AppError('A coupon with this code already exists', 409);

  return CourseCoupon.create({
    tenantId,
    code: code.trim().toUpperCase(),
    description: description?.trim() || '',
    discountType,
    discountValue: Number(discountValue),
    applicableCourses: applicableCourses || [],
    maxUses: Number(maxUses) || 0,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    isActive: true,
    createdBy: actingUser.sub,
  });
}

// ─── Update coupon ────────────────────────────────────────────────────────────
async function updateCoupon(tenantId, couponId, data) {
  const coupon = await CourseCoupon.findOne({ _id: couponId, tenantId });
  if (!coupon) throw new AppError('Coupon not found', 404);

  const allowed = ['description', 'discountType', 'discountValue', 'applicableCourses', 'maxUses', 'expiresAt', 'isActive'];
  allowed.forEach(field => {
    if (data[field] !== undefined) coupon[field] = data[field];
  });

  return coupon.save();
}

// ─── Delete (deactivate) coupon ───────────────────────────────────────────────
async function deleteCoupon(tenantId, couponId) {
  const coupon = await CourseCoupon.findOne({ _id: couponId, tenantId });
  if (!coupon) throw new AppError('Coupon not found', 404);
  coupon.isActive = false;
  return coupon.save();
}

module.exports = { validateCoupon, applyCoupon, listCoupons, createCoupon, updateCoupon, deleteCoupon };
