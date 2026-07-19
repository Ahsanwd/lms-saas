const CourseCoupon = require('../../database/models/CourseCoupon.model');
const Course = require('../../database/models/Course.model');
const AppError = require('../../utils/AppError');

// requirePermission('course:manage') passes for every instructor tenant-wide
// (same gap already fixed in bundle.service.js) — an instructor may only
// scope a coupon to their OWN courses, never tenant-wide (empty
// applicableCourses = "all courses", which would reach other instructors'
// courses too).
async function _assertInstructorCanUseCourses(tenantId, applicableCourses, actingUser) {
  if (actingUser?.role !== 'instructor') return;
  if (!applicableCourses || applicableCourses.length === 0)
    throw new AppError('Instructors must scope a coupon to specific courses they teach', 403);
  const courses = await Course.find({ _id: { $in: applicableCourses }, tenantId, deletedAt: null });
  const notOwned = courses.filter(c => c.instructorId?.toString() !== actingUser.sub.toString());
  if (notOwned.length > 0 || courses.length !== applicableCourses.length)
    throw new AppError('You can only apply coupons to your own courses', 403);
}

// Same ownership rule as bundle.service.js's _assertCanManageBundle.
function _assertCanManageCoupon(coupon, actingUser) {
  if (actingUser.role === 'instructor' && coupon.createdBy?.toString() !== actingUser.sub.toString())
    throw new AppError('You can only manage coupons you created', 403);
}

function _assertDiscountValid(discountType, discountValue) {
  if (!['percentage', 'fixed'].includes(discountType)) throw new AppError('discountType must be percentage or fixed', 400);
  if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100))
    throw new AppError('Percentage discount must be between 1 and 100', 400);
  if (discountType === 'fixed' && discountValue <= 0)
    throw new AppError('Fixed discount must be greater than 0', 400);
}

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

// ─── Validate a coupon code for a bundle (multiple courses, one price) ────────
async function validateBundleCoupon(tenantId, code, courseIds, bundlePrice) {
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

  // Applicable to the bundle only if every course in it is covered
  // (empty applicableCourses = tenant-wide, trivially covers any bundle).
  if (coupon.applicableCourses.length > 0) {
    const applicableSet = new Set(coupon.applicableCourses.map(c => c.toString()));
    const allCovered = courseIds.every(id => applicableSet.has(id.toString()));
    if (!allCovered) throw new AppError('This coupon is not valid for all courses in this bundle', 400, 'COUPON_NOT_APPLICABLE');
  }

  const discountAmount = coupon.discountType === 'percentage'
    ? Math.min((bundlePrice * coupon.discountValue) / 100, bundlePrice)
    : Math.min(coupon.discountValue, bundlePrice);

  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalPrice: Math.max(0, Math.round((bundlePrice - discountAmount) * 100) / 100),
  };
}

// ─── Apply bundle coupon (called internally during bundle checkout) ──────────
async function applyBundleCoupon(tenantId, code, courseIds, bundlePrice) {
  const result = await validateBundleCoupon(tenantId, code, courseIds, bundlePrice);

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
  _assertDiscountValid(discountType, discountValue);
  await _assertInstructorCanUseCourses(tenantId, applicableCourses, actingUser);

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
async function updateCoupon(tenantId, couponId, data, actingUser) {
  const coupon = await CourseCoupon.findOne({ _id: couponId, tenantId });
  if (!coupon) throw new AppError('Coupon not found', 404);
  _assertCanManageCoupon(coupon, actingUser);

  if (data.applicableCourses !== undefined)
    await _assertInstructorCanUseCourses(tenantId, data.applicableCourses, actingUser);

  const allowed = ['description', 'discountType', 'discountValue', 'applicableCourses', 'maxUses', 'expiresAt', 'isActive'];
  allowed.forEach(field => {
    if (data[field] !== undefined) coupon[field] = data[field];
  });
  // Re-validate the final state — discountType/discountValue previously had
  // no bounds check here at all (create's percentage 1-100 / fixed > 0 rules
  // only ever ran on creation), so a PATCH could set e.g. a 500% discount.
  _assertDiscountValid(coupon.discountType, coupon.discountValue);

  return coupon.save();
}

// ─── Delete (deactivate) coupon ───────────────────────────────────────────────
async function deleteCoupon(tenantId, couponId, actingUser) {
  const coupon = await CourseCoupon.findOne({ _id: couponId, tenantId });
  if (!coupon) throw new AppError('Coupon not found', 404);
  _assertCanManageCoupon(coupon, actingUser);
  coupon.isActive = false;
  return coupon.save();
}

module.exports = {
  validateCoupon, applyCoupon,
  validateBundleCoupon, applyBundleCoupon,
  listCoupons, createCoupon, updateCoupon, deleteCoupon,
};
