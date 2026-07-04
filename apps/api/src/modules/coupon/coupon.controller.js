const couponService = require('./coupon.service');
const R = require('../../utils/response');

async function list(req, res, next) {
  try {
    const result = await couponService.listCoupons(req.tenant.tenantId, req.query);
    R.success(res, result);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const coupon = await couponService.createCoupon(req.tenant.tenantId, req.body, req.user);
    R.created(res, { coupon }, 'Coupon created');
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const coupon = await couponService.updateCoupon(req.tenant.tenantId, req.params.id, req.body);
    R.success(res, { coupon }, 'Coupon updated');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await couponService.deleteCoupon(req.tenant.tenantId, req.params.id);
    R.success(res, {}, 'Coupon deactivated');
  } catch (err) { next(err); }
}

// POST /coupons/validate — student calls this before enrolling
async function validate(req, res, next) {
  try {
    const { code, courseId, coursePrice } = req.body;
    if (!code || !courseId || coursePrice == null)
      return R.error(res, 'code, courseId, and coursePrice are required', 400);
    const result = await couponService.validateCoupon(req.tenant.tenantId, code, courseId, Number(coursePrice));
    R.success(res, result);
  } catch (err) { next(err); }
}

// POST /coupons/validate-bundle — student calls this before buying a bundle.
// Resolves the bundle's real courseIds/price server-side — never trusts a
// client-supplied price.
async function validateBundle(req, res, next) {
  try {
    const { code, bundleId } = req.body;
    if (!code || !bundleId) return R.error(res, 'code and bundleId are required', 400);

    const CourseBundle = require('../../database/models/CourseBundle.model');
    const bundle = await CourseBundle.findOne({ _id: bundleId, tenantId: req.tenant.tenantId, status: 'published' });
    if (!bundle) return R.error(res, 'Bundle not found', 404);

    const result = await couponService.validateBundleCoupon(req.tenant.tenantId, code, bundle.courseIds, bundle.price);
    R.success(res, result);
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove, validate, validateBundle };
