const crypto = require('crypto');
const courseApplicationRepo = require('../../database/repositories/courseApplication.repository');
const courseRepo = require('../../database/repositories/course.repository');
const userRepo = require('../../database/repositories/user.repository');
const userService = require('../user/user.service');
const courseService = require('../course/course.service');
const AppError = require('../../utils/AppError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD_LENGTH = 200;

// Never a shared backend password generator existed before this — mirrors the
// intent of the frontend's users/page.tsx generatePassword() helper, just
// server-side since approval has no client-supplied password field.
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from(crypto.randomBytes(12)).map((b) => chars[b % chars.length]).join('');
}

// Public — no auth. Recipient course is resolved server-side from the tenant-
// scoped courseId only after confirming it's actually published for this tenant.
async function submit(tenantId, pageId, data, meta) {
  const { name, email, phone, gender, courseId } = data;

  if (!name || !name.trim()) throw new AppError('Name is required', 400);
  if (!email || !EMAIL_RE.test(email)) throw new AppError('A valid email is required', 400);
  if (!courseId) throw new AppError('Please choose a course', 400);
  if (name.length > MAX_FIELD_LENGTH) throw new AppError('Name is too long', 400);
  if (phone && String(phone).length > MAX_FIELD_LENGTH) throw new AppError('Phone is too long', 400);
  if (gender && !['male', 'female', 'other'].includes(gender)) throw new AppError('Invalid gender value', 400);

  const course = await courseRepo.findById(tenantId, courseId);
  if (!course || course.status !== 'published') throw new AppError('Course not found', 404);

  const application = await courseApplicationRepo.create({
    tenantId, pageId: pageId || null, courseId,
    name: name.trim(), email, phone: phone || null, gender: gender || null,
    ip: meta?.ip || null,
  });

  // In-app notification to every tenant admin — same pattern as contact
  // form submissions, so a new application is actually visible somewhere
  // besides the list page itself.
  const User = require('../../database/models/User.model');
  const admins = await User.find({ tenantId, role: 'tenant_admin', deletedAt: null }).select('_id').lean();
  if (admins.length > 0) {
    const notifySvc = require('../notification/notification.service');
    notifySvc.createBulk(tenantId, admins.map((a) => a._id), {
      type: 'course_application',
      title: 'New course application',
      message: `${name.trim()} applied for "${course.title}"`,
      link: '/course-applications',
    }).catch(() => {});
  }

  return application;
}

function listApplications(tenantId, query) {
  return courseApplicationRepo.findAll(tenantId, query);
}

function getPendingCount(tenantId) {
  return courseApplicationRepo.countPending(tenantId);
}

async function approveApplication(tenantId, applicationId, actingUser) {
  const application = await courseApplicationRepo.findById(tenantId, applicationId);
  if (!application) throw new AppError('Application not found', 404);
  if (application.status !== 'pending') throw new AppError('Application is not pending', 400);

  let user = await userRepo.findByEmail(tenantId, application.email);
  if (!user) {
    const [firstName, ...rest] = application.name.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;
    user = await userService.createUser(tenantId, {
      firstName, lastName, email: application.email, password: generatePassword(), role: 'student',
    });
  }

  let enrollment = null;
  try {
    enrollment = await courseService.adminEnrollUser(tenantId, application.courseId, user._id, actingUser);
  } catch (err) {
    if (err.statusCode !== 409) throw err;
  }

  return courseApplicationRepo.updateById(tenantId, applicationId, {
    status: 'approved',
    resultingUserId: user._id,
    resultingEnrollmentId: enrollment?._id || null,
    reviewedBy: actingUser.sub,
    reviewedAt: new Date(),
  });
}

async function rejectApplication(tenantId, applicationId, actingUser, { reviewNote = '' } = {}) {
  const application = await courseApplicationRepo.findById(tenantId, applicationId);
  if (!application) throw new AppError('Application not found', 404);
  if (application.status !== 'pending') throw new AppError('Application is not pending', 400);

  return courseApplicationRepo.updateById(tenantId, applicationId, {
    status: 'rejected',
    reviewNote,
    reviewedBy: actingUser.sub,
    reviewedAt: new Date(),
  });
}

module.exports = { submit, listApplications, getPendingCount, approveApplication, rejectApplication };
