const crypto         = require('crypto');
const AppError       = require('../../utils/AppError');
const linkRepo       = require('../../database/repositories/enrollmentLink.repository');
const courseRepo     = require('../../database/repositories/course.repository');
const enrollmentRepo = require('../../database/repositories/enrollment.repository');
const tenantRepo     = require('../../database/repositories/tenant.repository');
const Enrollment     = require('../../database/models/Enrollment.model');

// ─── Create Link ──────────────────────────────────────────────────────────────
async function createLink(tenantId, createdBy, role, { title, courseIds, maxUses, expiresAt }) {
  if (!courseIds || courseIds.length === 0)
    throw new AppError('At least one course is required', 400);
  if (courseIds.length > 20)
    throw new AppError('Maximum 20 courses per link', 400);

  // Instructors can only link their own courses
  const courses = await Promise.all(
    courseIds.map(id => courseRepo.findById(tenantId, id))
  );

  for (const c of courses) {
    if (!c) throw new AppError('One or more courses not found', 404);
    if (c.status !== 'published') throw new AppError(`"${c.title}" is not published`, 400);
    if (role === 'instructor' && c.instructorId?.toString() !== createdBy.toString())
      throw new AppError(`You can only share your own courses`, 403);
  }

  const token = crypto.randomBytes(10).toString('hex'); // 20-char hex

  return linkRepo.create({
    tenantId,
    createdBy,
    title: title?.trim() || null,
    courseIds,
    token,
    maxUses: Number(maxUses) || 0,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });
}

// ─── List Links ───────────────────────────────────────────────────────────────
async function listLinks(tenantId, role, userId, { page, limit } = {}) {
  const createdBy = role === 'instructor' ? userId : undefined;
  const [links, total] = await linkRepo.findByTenant(tenantId, { createdBy, page, limit });
  return { links, pagination: { total, page: Number(page) || 1 } };
}

// ─── Delete Link ──────────────────────────────────────────────────────────────
async function deleteLink(tenantId, role, userId, linkId) {
  const link = await linkRepo.findById(tenantId, linkId);
  if (!link) throw new AppError('Link not found', 404);
  if (role === 'instructor' && link.createdBy?.toString() !== userId.toString())
    throw new AppError('Not allowed', 403);
  await linkRepo.deleteById(linkId);
}

// ─── Get Public Link Info (no auth required) ─────────────────────────────────
async function getPublicLink(tenantId, token) {
  const link = await linkRepo.findByToken(token);
  if (!link) throw new AppError('Link not found or has expired', 404);
  if (!link.isActive) throw new AppError('This link has been deactivated', 410);
  if (link.tenantId?.toString() !== tenantId?.toString())
    throw new AppError('Link not found', 404);
  if (link.expiresAt && new Date() > new Date(link.expiresAt))
    throw new AppError('This link has expired', 410);
  if (link.maxUses > 0 && link.uses >= link.maxUses)
    throw new AppError('This link has reached its maximum number of uses', 410);

  // populate('courseIds', ...) runs the Course model's own soft-delete
  // filter, so a course removed after the link was created comes back as
  // null in that array slot (Mongoose populate convention) rather than
  // being dropped — filter it out before it reaches the frontend, which
  // renders each entry's `._id`/`.title` unconditionally.
  const courses = link.courseIds.filter(Boolean);
  if (courses.length === 0) throw new AppError('The courses in this link are no longer available', 410);

  const tenant = await tenantRepo.findById(tenantId);
  return {
    token: link.token,
    title: link.title,
    courses,
    isBundle: courses.length > 1,
    tenantName: tenant?.name,
    expiresAt: link.expiresAt,
    maxUses: link.maxUses,
    uses: link.uses,
  };
}

// ─── Join (enroll via link, requires auth) ───────────────────────────────────
async function joinViaLink(tenantId, token, user) {
  const link = await linkRepo.findByToken(token);
  if (!link) throw new AppError('Link not found', 404);
  if (!link.isActive) throw new AppError('This link has been deactivated', 410);
  if (link.tenantId?.toString() !== tenantId?.toString())
    throw new AppError('Link not found', 404);
  if (link.expiresAt && new Date() > new Date(link.expiresAt))
    throw new AppError('This link has expired', 410);
  if (link.maxUses > 0 && link.uses >= link.maxUses)
    throw new AppError('This link has reached its maximum number of uses', 410);

  const results = [];

  for (const course of link.courseIds) {
    // Same soft-deleted-course-populates-to-null case as getPublicLink —
    // skip rather than crash on `.` id access.
    if (!course) continue;
    const courseId = course._id || course;

    // Skip if already actively enrolled
    const existing = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, courseId);
    if (existing?.status === 'active') {
      results.push({ courseId, status: 'already_enrolled' });
      continue;
    }

    const courseDoc = await courseRepo.findById(tenantId, courseId);
    if (!courseDoc || courseDoc.status !== 'published') {
      results.push({ courseId, status: 'skipped' });
      continue;
    }

    // Capacity check
    if (courseDoc.capacity > 0) {
      const activeCount = await enrollmentRepo.countActive(tenantId, courseId);
      if (activeCount >= courseDoc.capacity) {
        results.push({ courseId, status: 'full' });
        continue;
      }
    }

    if (existing) {
      // Re-enroll (dropped/completed)
      await enrollmentRepo.updateByUserAndCourse(tenantId, user.sub, courseId, {
        status: 'active', enrolledAt: new Date(), droppedAt: null, completedAt: null, pricePaid: 0,
      });
    } else {
      await Enrollment.create({
        tenantId, courseId, userId: user.sub,
        status: 'active', pricePaid: 0,
        enrolledAt: new Date(),
      });
      await courseRepo.incrementCounter(tenantId, courseId, { enrollmentCount: 1 });
    }

    results.push({ courseId, status: 'enrolled' });
  }

  const enrolled = results.filter(r => r.status === 'enrolled').map(r => r.courseId);

  // Only count this as a "use" (of maxUses/"spots remaining") if it actually
  // resulted in a new enrollment — otherwise a repeat visit from someone
  // already enrolled would silently burn through the cap for no reason.
  if (enrolled.length > 0) await linkRepo.incrementUses(link._id);

  const firstCourseId = link.courseIds[0]?._id || link.courseIds[0];

  return { results, enrolled, redirectCourseId: firstCourseId };
}

module.exports = { createLink, listLinks, deleteLink, getPublicLink, joinViaLink };
