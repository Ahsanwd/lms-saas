const Waitlist    = require('../../database/models/Waitlist.model');
const Course      = require('../../database/models/Course.model');
const Enrollment  = require('../../database/models/Enrollment.model');
const AppError    = require('../../utils/AppError');

// ─── Join waitlist ─────────────────────────────────────────────────────────────
async function joinWaitlist(tenantId, courseId, userId) {
  const course = await Course.findOne({ _id: courseId, tenantId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404, 'NOT_FOUND');
  if (!course.waitlistEnabled) throw new AppError('Waitlist is not enabled for this course', 400, 'WAITLIST_DISABLED');

  // Joining is only meaningful once the course is actually full — this check
  // was missing entirely (contradicting the route's own API docs, which
  // already document "only allowed ... and is at capacity"), so anyone could
  // join the waitlist for a course with open seats instead of just enrolling
  // directly via enroll(), which has this same capacity check. An unlimited-
  // capacity course (capacity: 0) can never be "full", so it must never
  // allow joining the waitlist at all — not skip the check.
  if (course.capacity <= 0) throw new AppError('This course has no enrollment limit — enroll directly instead of joining the waitlist', 400, 'SEATS_AVAILABLE');
  const activeCount = await Enrollment.countDocuments({ tenantId, courseId, status: 'active' });
  if (activeCount < course.capacity) throw new AppError('This course has open seats — enroll directly instead of joining the waitlist', 400, 'SEATS_AVAILABLE');

  // Not already actively enrolled (dropped/expired enrollments don't block waitlist)
  const alreadyEnrolled = await Enrollment.findOne({ tenantId, courseId, userId, status: 'active' });
  if (alreadyEnrolled) throw new AppError('You are already enrolled in this course', 400, 'ALREADY_ENROLLED');

  // Not already waiting
  const existing = await Waitlist.findOne({ tenantId, courseId, userId });
  if (existing) {
    if (existing.status === 'waiting') throw new AppError('You are already on the waitlist', 400, 'ALREADY_WAITLISTED');
    // Re-join after cancel
    if (existing.status === 'cancelled') {
      const next = await nextPosition(tenantId, courseId);
      existing.status = 'waiting';
      existing.position = next;
      existing.cancelledAt = null;
      existing.joinedAt = new Date();
      await existing.save();
      return existing;
    }
  }

  const position = await nextPosition(tenantId, courseId);
  const entry = await Waitlist.create({ tenantId, courseId, userId, position });
  return entry;
}

// ─── Leave waitlist ────────────────────────────────────────────────────────────
async function leaveWaitlist(tenantId, courseId, userId) {
  const entry = await Waitlist.findOne({ tenantId, courseId, userId, status: 'waiting' });
  if (!entry) throw new AppError('You are not on the waitlist', 404, 'NOT_FOUND');

  entry.status = 'cancelled';
  entry.cancelledAt = new Date();
  await entry.save();

  // Repack positions for remaining entries
  await repackPositions(tenantId, courseId);
  return { ok: true };
}

// ─── Get user's waitlist position for a course ─────────────────────────────────
async function getMyPosition(tenantId, courseId, userId) {
  const entry = await Waitlist.findOne({ tenantId, courseId, userId, status: 'waiting' });
  if (!entry) return null;
  const total = await Waitlist.countDocuments({ tenantId, courseId, status: 'waiting' });
  return { position: entry.position, total, joinedAt: entry.joinedAt };
}

// ─── List waitlist for a course (admin/instructor) ─────────────────────────────
async function listWaitlist(tenantId, courseId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    Waitlist.find({ tenantId, courseId, status: 'waiting' })
      .sort({ position: 1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'firstName lastName email avatar'),
    Waitlist.countDocuments({ tenantId, courseId, status: 'waiting' }),
  ]);
  return { entries, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── Auto-promote top of waitlist when a seat opens ───────────────────────────
// Called by course.service after a drop or manual unenroll
async function promoteNext(tenantId, courseId) {
  const course = await Course.findOne({ _id: courseId, tenantId });
  if (!course || !course.waitlistEnabled) return null;

  // Check if there's still capacity — against a live count, not the cached
  // course.enrollmentCount. Confirmed live that this counter can drift from
  // the real number of active enrollments (a pre-existing inconsistency
  // found in real data during this same test session), which silently
  // stopped promotion from ever firing even after a seat had genuinely
  // opened up — the exact "auto-enroll the top of the queue" promise this
  // function exists to keep. enroll() already does this correctly via a
  // live count; this brings promoteNext in line with it.
  if (course.capacity > 0) {
    const activeCount = await Enrollment.countDocuments({ tenantId, courseId, status: 'active' });
    if (activeCount >= course.capacity) return null;
  }

  const next = await Waitlist.findOne({ tenantId, courseId, status: 'waiting' })
    .sort({ position: 1 });
  if (!next) return null;

  // Mark promoted
  next.status = 'promoted';
  next.promotedAt = new Date();
  await next.save();

  // Auto-enroll
  await Enrollment.create({
    tenantId,
    courseId,
    userId: next.userId,
    pricePaid: 0,      // waitlist promotions are seat grants, price handled separately
    discountAmount: 0,
    couponCode: null,
  });

  // Update enrollment counter
  await Course.updateOne({ _id: courseId, tenantId }, { $inc: { enrollmentCount: 1 } });

  // Notify student
  const notifySvc = require('../notification/notification.service');
  notifySvc.notifyWaitlistPromoted(tenantId, next.userId.toString(), course.title, courseId.toString()).catch(() => {});

  // Repack positions
  await repackPositions(tenantId, courseId);

  return next;
}

// ─── Admin remove a user from waitlist ────────────────────────────────────────
async function adminRemove(tenantId, courseId, userId) {
  const entry = await Waitlist.findOne({ tenantId, courseId, userId, status: 'waiting' });
  if (!entry) throw new AppError('User is not on the waitlist', 404, 'NOT_FOUND');

  entry.status = 'cancelled';
  entry.cancelledAt = new Date();
  await entry.save();

  await repackPositions(tenantId, courseId);
  return { ok: true };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function nextPosition(tenantId, courseId) {
  const last = await Waitlist.findOne({ tenantId, courseId, status: 'waiting' })
    .sort({ position: -1 });
  return last ? last.position + 1 : 1;
}

async function repackPositions(tenantId, courseId) {
  const entries = await Waitlist.find({ tenantId, courseId, status: 'waiting' })
    .sort({ position: 1 });
  const ops = entries.reduce((acc, e, i) => {
    if (e.position !== i + 1) acc.push(Waitlist.updateOne({ _id: e._id }, { position: i + 1 }));
    return acc;
  }, []);
  if (ops.length) await Promise.all(ops);
}

module.exports = { joinWaitlist, leaveWaitlist, getMyPosition, listWaitlist, promoteNext, adminRemove };
