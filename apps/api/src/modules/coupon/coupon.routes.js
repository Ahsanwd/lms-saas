const router = require('express').Router();
const ctrl = require('./coupon.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');

/**
 * @swagger
 * /coupons:
 *   get:
 *     tags: [Coupons]
 *     summary: List all coupons for this tenant
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Filter by code prefix
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Coupon list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         coupons: { type: array, items: { $ref: '#/components/schemas/Coupon' } }
 *                         pagination: { $ref: '#/components/schemas/Pagination' }
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 *   post:
 *     tags: [Coupons]
 *     summary: Create a new coupon
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCouponRequest' }
 *     responses:
 *       201:
 *         description: Coupon created
 *       409:
 *         description: Code already exists
 *
 * /coupons/validate:
 *   post:
 *     tags: [Coupons]
 *     summary: Validate a coupon code for a course (pre-enrollment check)
 *     description: >
 *       Called before the student confirms purchase. Returns the discount amount
 *       and final price. Does NOT increment usedCount.
 *       Returns 404 if the coupon is invalid, expired, exhausted, or not
 *       applicable to this course.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, courseId]
 *             properties:
 *               code:     { type: string, example: 'SUMMER30' }
 *               courseId: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Coupon is valid — discount details returned
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         code:           { type: string }
 *                         discountType:   { type: string, enum: [percentage, fixed] }
 *                         discountValue:  { type: number }
 *                         discountAmount: { type: number, example: 15.00 }
 *                         finalPrice:     { type: number, example: 34.99 }
 *       404:
 *         description: Invalid, expired, exhausted, or inapplicable coupon
 *
 * /coupons/{id}:
 *   patch:
 *     tags: [Coupons]
 *     summary: Update a coupon (description, maxUses, expiresAt, isActive)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:  { type: string }
 *               maxUses:      { type: integer }
 *               expiresAt:    { type: string, format: date, nullable: true }
 *               isActive:     { type: boolean }
 *     responses:
 *       200:
 *         description: Coupon updated
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     tags: [Coupons]
 *     summary: Deactivate a coupon (soft delete — sets isActive=false)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Coupon deactivated
 */

router.use(authenticate);

// Any authenticated user can validate a coupon before enrolling
router.post('/validate', ctrl.validate);
router.post('/validate-bundle', ctrl.validateBundle);

// Admin / instructor management
router.get('/',     requirePermission('course:manage'), ctrl.list);
router.post('/',    requirePermission('course:manage'), ctrl.create);
router.patch('/:id', requirePermission('course:manage'), ctrl.update);
router.delete('/:id', requirePermission('course:manage'), ctrl.remove);

module.exports = router;
