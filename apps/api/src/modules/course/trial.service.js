const Course     = require('../../database/models/Course.model');
const Enrollment = require('../../database/models/Enrollment.model');
const AppError   = require('../../utils/AppError');

async function startTrial(tenantId, courseId, userId) {
  const course = await Course.findOne({ _id: courseId, tenantId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404);
  if (!course.trialEnabled) throw new AppError('Trial is not available for this course', 400, 'TRIAL_DISABLED');
  if (course.isFree) throw new AppError('Course is already free — no trial needed', 400);

  const existing = await Enrollment.findOne({ tenantId, courseId, userId });
  if (existing) {
    // 'completed' was never checked here — same reactivation bug found
    // repeatedly elsewhere this session (course.service.js's adminEnrollUser/
    // bulkEnrollCsv, cohort/group bulk-enroll, enrollmentRequest). Without
    // this, a student who already finished (and possibly holds a
    // certificate for) a course could call startTrial and silently flip
    // their completed enrollment back to active/isTrial:true.
    if (existing.status === 'completed')
      throw new AppError('You have already completed this course', 400);
    if (existing.status === 'active' && !existing.isTrial)
      throw new AppError('You are already enrolled in this course', 400);
    if (existing.isTrial && existing.status === 'active')
      throw new AppError('You already have an active trial', 400);
  }

  const trialEndsAt = new Date(Date.now() + course.trialDurationDays * 24 * 60 * 60 * 1000);

  if (existing) {
    existing.status = 'active';
    existing.isTrial = true;
    existing.trialEndsAt = trialEndsAt;
    existing.enrolledAt = new Date();
    existing.droppedAt = null;
    await existing.save();
    return existing;
  }

  const enrollment = await Enrollment.create({
    tenantId, courseId, userId,
    isTrial: true, trialEndsAt,
    pricePaid: 0, discountAmount: 0, couponCode: null,
  });

  await Course.updateOne({ _id: courseId, tenantId }, { $inc: { enrollmentCount: 1 } });
  return enrollment;
}

async function upgradeTrial(tenantId, courseId, userId) {
  const enrollment = await Enrollment.findOne({ tenantId, courseId, userId, isTrial: true, status: 'active' });
  if (!enrollment) throw new AppError('No active trial found', 404);

  enrollment.isTrial = false;
  enrollment.trialEndsAt = null;
  enrollment.upgradedAt = new Date();
  await enrollment.save();
  return enrollment;
}

async function getTrialStatus(tenantId, courseId, userId) {
  const enrollment = await Enrollment.findOne({ tenantId, courseId, userId });
  if (!enrollment) return null;
  const now = new Date();
  const trialExpired = enrollment.isTrial && enrollment.trialEndsAt && enrollment.trialEndsAt < now;
  const daysLeft = enrollment.isTrial && enrollment.trialEndsAt
    ? Math.max(0, Math.ceil((enrollment.trialEndsAt - now) / (1000 * 60 * 60 * 24)))
    : null;
  return { isTrial: enrollment.isTrial, trialExpired, trialEndsAt: enrollment.trialEndsAt, daysLeft };
}

module.exports = { startTrial, upgradeTrial, getTrialStatus };
