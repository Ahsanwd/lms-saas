const EnrollmentRequest = require('../../database/models/EnrollmentRequest.model');
const Course            = require('../../database/models/Course.model');
const Enrollment        = require('../../database/models/Enrollment.model');
const AppError          = require('../../utils/AppError');

// ─── Student: submit a request ─────────────────────────────────────────────────
async function submitRequest(tenantId, courseId, userId, { message = '' } = {}) {
  const course = await Course.findOne({ _id: courseId, tenantId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404);
  if (course.enrollmentType !== 'approval')
    throw new AppError('This course does not require approval', 400);

  const alreadyEnrolled = await Enrollment.findOne({ tenantId, courseId, userId, status: 'active' });
  if (alreadyEnrolled) throw new AppError('You are already enrolled in this course', 400);

  const existing = await EnrollmentRequest.findOne({ tenantId, courseId, userId });
  if (existing) {
    if (existing.status === 'pending') throw new AppError('You already have a pending request', 400);
    if (existing.status === 'approved') {
      // Check the enrollment still exists and is active — if it was removed, allow re-submit
      const activeEnrollment = await Enrollment.findOne({ tenantId, courseId, userId, status: 'active' });
      if (activeEnrollment) throw new AppError('You are already enrolled in this course', 400);
      // Enrollment was removed — fall through to re-submit
    }
    // Rejected or approved-but-unenrolled — allow re-submit
    existing.status = 'pending';
    existing.message = message;
    existing.reviewNote = '';
    existing.reviewedBy = null;
    existing.reviewedAt = null;
    await existing.save();
    return existing;
  }

  return EnrollmentRequest.create({ tenantId, courseId, userId, message });
}

// ─── Student: get own request status ──────────────────────────────────────────
async function getMyRequest(tenantId, courseId, userId) {
  return EnrollmentRequest.findOne({ tenantId, courseId, userId });
}

// ─── Admin/Instructor: list requests for a course ─────────────────────────────
async function listRequests(tenantId, courseId, { status, page = 1, limit = 20 } = {}) {
  const filter = { tenantId, courseId };
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [requests, total] = await Promise.all([
    EnrollmentRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'firstName lastName email avatar')
      .populate('reviewedBy', 'firstName lastName'),
    EnrollmentRequest.countDocuments(filter),
  ]);
  return { requests, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── Admin/Instructor: approve ─────────────────────────────────────────────────
async function approveRequest(tenantId, requestId, actingUserId, { reviewNote = '' } = {}) {
  const req = await EnrollmentRequest.findOne({ _id: requestId, tenantId });
  if (!req) throw new AppError('Request not found', 404);
  if (req.status !== 'pending') throw new AppError('Request is not pending', 400);

  req.status = 'approved';
  req.reviewNote = reviewNote;
  req.reviewedBy = actingUserId;
  req.reviewedAt = new Date();
  await req.save();

  // Create enrollment
  const existing = await Enrollment.findOne({ tenantId, courseId: req.courseId, userId: req.userId });
  if (!existing) {
    await Enrollment.create({
      tenantId, courseId: req.courseId, userId: req.userId,
      pricePaid: 0, discountAmount: 0, couponCode: null,
    });
    await Course.updateOne({ _id: req.courseId, tenantId }, { $inc: { enrollmentCount: 1 } });
  } else if (!['active', 'completed'].includes(existing.status)) {
    // 'completed' must be excluded here too — this only excluded 'active',
    // so approving a request for someone who'd already finished the course
    // silently reactivated them (same bug confirmed live via
    // course.service.js's adminEnrollUser).
    await Enrollment.updateOne({ _id: existing._id }, {
      status: 'active', enrolledAt: new Date(), droppedAt: null,
    });
    await Course.updateOne({ _id: req.courseId, tenantId }, { $inc: { enrollmentCount: 1 } });
  }

  // Notify student
  const course = await Course.findById(req.courseId).select('title');
  const notifySvc = require('../notification/notification.service');
  notifySvc.notifyEnrollmentApproved(tenantId, req.userId.toString(), course?.title ?? 'the course', req.courseId.toString(), reviewNote).catch(() => {});

  return req;
}

// ─── Admin/Instructor: reject ──────────────────────────────────────────────────
async function rejectRequest(tenantId, requestId, actingUserId, { reviewNote = '' } = {}) {
  const req = await EnrollmentRequest.findOne({ _id: requestId, tenantId });
  if (!req) throw new AppError('Request not found', 404);
  if (req.status !== 'pending') throw new AppError('Request is not pending', 400);

  req.status = 'rejected';
  req.reviewNote = reviewNote;
  req.reviewedBy = actingUserId;
  req.reviewedAt = new Date();
  await req.save();

  // Notify student
  const course = await Course.findById(req.courseId).select('title');
  const notifySvc = require('../notification/notification.service');
  notifySvc.notifyEnrollmentRejected(tenantId, req.userId.toString(), course?.title ?? 'the course', reviewNote).catch(() => {});

  return req;
}

module.exports = { submitRequest, getMyRequest, listRequests, approveRequest, rejectRequest };
