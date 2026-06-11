const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const ctrl = require('./waitlist.controller');

/**
 * @swagger
 * /courses/{courseId}/waitlist:
 *   post:
 *     tags: [Waitlist]
 *     summary: Join the waitlist for a full course
 *     description: >
 *       Only allowed when the course has `waitlistEnabled: true` and is at capacity.
 *       When a seat opens (someone drops), the top of the queue is auto-enrolled
 *       and notified automatically.
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       201:
 *         description: Added to waitlist
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
 *                         entry: { $ref: '#/components/schemas/WaitlistEntry' }
 *       400:
 *         description: Already enrolled, already waitlisted, or waitlist not enabled
 *
 *   get:
 *     tags: [Waitlist]
 *     summary: List all waiting students for a course (admin/instructor)
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Ordered waitlist
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
 *                         entries: { type: array, items: { $ref: '#/components/schemas/WaitlistEntry' } }
 *                         total:   { type: integer }
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 *   delete:
 *     tags: [Waitlist]
 *     summary: Leave the waitlist (current user)
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Removed from waitlist — positions repacked automatically
 *
 * /courses/{courseId}/waitlist/my:
 *   get:
 *     tags: [Waitlist]
 *     summary: Get current user's waitlist position
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Position info, or null if not on waitlist
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         position: { type: integer, example: 3 }
 *                         total:    { type: integer, example: 10 }
 *                         joinedAt: { $ref: '#/components/schemas/Timestamp' }
 *
 * /courses/{courseId}/waitlist/{userId}:
 *   delete:
 *     tags: [Waitlist]
 *     summary: Admin removes a specific user from the waitlist
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: User removed — positions repacked
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: User is not on the waitlist
 */

router.use(authenticate);

// Student routes
router.post('/',         ctrl.join);
router.delete('/',       ctrl.leave);
router.get('/my',        ctrl.myPosition);

// Admin / instructor — view full waitlist
router.get('/', requirePermission('course:manage'), ctrl.list);

// Admin — remove a specific user from waitlist
router.delete('/:userId', requirePermission('course:manage'), ctrl.adminRemove);

module.exports = router;
