const assignmentRepo = require('../../database/repositories/assignment.repository');
const submissionRepo = require('../../database/repositories/submission.repository');
const enrollmentRepo = require('../../database/repositories/enrollment.repository');
const courseRepo     = require('../../database/repositories/course.repository');
const userRepo       = require('../../database/repositories/user.repository');
const tenantRepo     = require('../../database/repositories/tenant.repository');
const { queueEmail } = require('../../jobs/email.job');
const assignmentGradedTpl  = require('../../services/email/templates/assignmentGraded');
const assignmentSubmittedTpl = require('../../services/email/templates/assignmentSubmitted');
const config   = require('../../config');
const AppError = require('../../utils/AppError');
const { deleteFile, getFileSizeBytes } = require('../../services/storage/storage.service');

// Best-effort storage reclaim, mirrors the pattern used throughout
// course.service.js — never let a cleanup failure break the actual mutation.
function reclaimFile(tenantId, oldUrl) {
  if (!oldUrl) return;
  const size = getFileSizeBytes(oldUrl);
  deleteFile(oldUrl);
  if (size > 0) setImmediate(() => {
    const lgSvc = require('../../services/limitGuard/limitGuard.service');
    lgSvc.decrementStorageUsed(tenantId, size).catch(() => {});
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function canManageAssignment(assignment, user) {
  if (['tenant_admin', 'super_admin'].includes(user.role)) return true;
  const instructorId = assignment.instructorId?._id?.toString() ?? assignment.instructorId?.toString();
  return instructorId === user.sub;
}

// ─── Assignment CRUD ──────────────────────────────────────────────────────────

async function listAssignments(tenantId, user, query) {
  const { courseId, status, search, page, limit } = query;
  const filter = {};

  if (user.role === 'instructor') filter.instructorId = user.sub;

  if (user.role === 'student') {
    // Students see published assignments for their enrolled courses only
    filter.status = 'published';
    if (courseId) {
      filter.courseId = courseId;
    } else {
      // 'completed' must stay included here — finishing a course must not
      // make its assignments (and any grades already recorded on them)
      // silently disappear from the student's own assignments list.
      const enrollments = await enrollmentRepo.findByUser(tenantId, user.sub, { status: { $in: ['active', 'completed'] } });
      const courseIds = enrollments.map((e) => e.courseId);
      filter.courseId = { $in: courseIds };
    }
  } else {
    if (status) filter.status = status;
    if (courseId) filter.courseId = courseId;
  }

  if (search) filter.title = { $regex: search, $options: 'i' };

  const [assignments, total] = await assignmentRepo.findAll(tenantId, filter, { page, limit });
  return {
    assignments,
    pagination: { total, page: Number(page || 1), limit: Number(limit || 20) },
  };
}

async function getAssignment(tenantId, id, user) {
  const assignment = await assignmentRepo.findById(tenantId, id);
  if (!assignment) throw new AppError('Assignment not found', 404);

  if (user.role === 'student') {
    if (assignment.status !== 'published') throw new AppError('Assignment not found', 404);
    // Verify student is enrolled in the course
    const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, assignment.courseId._id ?? assignment.courseId);
    if (!enrollment) throw new AppError('You are not enrolled in this course', 403);
  }

  // Attach this student's extension (if any) as a top-level field for easy consumption
  const assignmentObj = assignment.toObject ? assignment.toObject() : { ...assignment };
  if (user.role === 'student') {
    const ext = (assignment.extensions || []).find(e => e.studentId?.toString() === user.sub);
    assignmentObj.myExtension = ext ? { extendedDueDate: ext.extendedDueDate, note: ext.note } : null;
  }

  return assignmentObj;
}

async function createAssignment(tenantId, data, user) {
  // Instructors can only create for their own courses
  if (user.role === 'instructor') {
    const course = await courseRepo.findById(tenantId, data.courseId);
    if (!course) throw new AppError('Course not found', 404);
    const courseInstructorId = course.instructorId?._id?.toString() ?? course.instructorId?.toString();
    if (courseInstructorId !== user.sub)
      throw new AppError('You can only create assignments for your own courses', 403);
  }

  const rubric = Array.isArray(data.rubric) ? data.rubric.filter(r => r.criterion?.trim()) : [];
  // When a rubric is provided, totalMarks is the sum of maxPoints
  const totalMarks = rubric.length
    ? rubric.reduce((sum, r) => sum + Number(r.maxPoints || 0), 0)
    : (data.totalMarks || 100);

  const allowedFileTypes = Array.isArray(data.allowedFileTypes)
    ? data.allowedFileTypes.map(t => t.toLowerCase().replace(/^\./, '').trim()).filter(Boolean)
    : [];

  return assignmentRepo.create({
    tenantId,
    courseId:    data.courseId,
    lessonId:    data.lessonId   || null,
    instructorId: user.role === 'instructor' ? user.sub : (data.instructorId || user.sub),
    title:        data.title,
    description:  data.description  || null,
    instructions: data.instructions || null,
    attachmentUrl:data.attachmentUrl || null,
    dueDate:      data.dueDate      || null,
    totalMarks,
    rubric,
    allowedFileTypes,
    allowLateSubmission: data.allowLateSubmission || false,
    maxSubmissions: Number(data.maxSubmissions) || 0,
    status: 'draft',
    createdBy: user.sub,
    updatedBy: user.sub,
  });
}

async function updateAssignment(tenantId, id, data, user) {
  const assignment = await assignmentRepo.findById(tenantId, id);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);

  const allowed = ['title', 'description', 'instructions', 'attachmentUrl',
    'dueDate', 'allowLateSubmission', 'lessonId', 'maxSubmissions'];
  const update = { updatedBy: user.sub };
  for (const field of allowed) {
    if (data[field] !== undefined) update[field] = data[field];
  }

  if (data.attachmentUrl !== undefined && assignment.attachmentUrl && assignment.attachmentUrl !== data.attachmentUrl) {
    reclaimFile(tenantId, assignment.attachmentUrl);
  }

  if (Array.isArray(data.allowedFileTypes)) {
    update.allowedFileTypes = data.allowedFileTypes
      .map(t => t.toLowerCase().replace(/^\./, '').trim()).filter(Boolean);
  }

  // Rubric update: recalculate totalMarks from rubric sum when rubric is present
  if (Array.isArray(data.rubric)) {
    const rubric = data.rubric.filter(r => r.criterion?.trim());
    update.rubric = rubric;
    update.totalMarks = rubric.length
      ? rubric.reduce((sum, r) => sum + Number(r.maxPoints || 0), 0)
      : (data.totalMarks !== undefined ? Number(data.totalMarks) : assignment.totalMarks);
  } else if (data.totalMarks !== undefined) {
    update.totalMarks = Number(data.totalMarks);
  }

  return assignmentRepo.updateById(tenantId, id, update);
}

async function publishAssignment(tenantId, id, user) {
  const assignment = await assignmentRepo.findById(tenantId, id);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);

  const newStatus = assignment.status === 'published' ? 'draft' : 'published';
  const updated = await assignmentRepo.updateById(tenantId, id, { status: newStatus, updatedBy: user.sub });

  // Notify all enrolled students when newly published
  if (newStatus === 'published') {
    try {
      const courseId = assignment.courseId._id ?? assignment.courseId;
      const [enrollments] = await enrollmentRepo.findByCourse(tenantId, courseId, { status: 'active' }, { limit: 1000 });
      const studentIds = enrollments.map(e => (e.userId?._id ?? e.userId).toString()).filter(Boolean);
      if (studentIds.length > 0) {
        const notifySvc = require('../notification/notification.service');
        await notifySvc.notifyAssignmentPublished(
          tenantId, studentIds, assignment.title, courseId.toString(), id.toString()
        );
      }
    } catch (_) { /* non-critical — never break publish */ }
  }

  return updated;
}

async function archiveAssignment(tenantId, id, user) {
  const assignment = await assignmentRepo.findById(tenantId, id);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);

  return assignmentRepo.updateById(tenantId, id, { status: 'archived', updatedBy: user.sub });
}

async function deleteAssignment(tenantId, id, user) {
  const assignment = await assignmentRepo.findById(tenantId, id);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);

  reclaimFile(tenantId, assignment.attachmentUrl);
  return assignmentRepo.softDelete(tenantId, id, user.sub);
}

// ─── Submissions ──────────────────────────────────────────────────────────────

async function listSubmissions(tenantId, assignmentId, user, query) {
  const assignment = await assignmentRepo.findById(tenantId, assignmentId);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);

  const { status, page, limit } = query;
  const filter = {};
  if (status) filter.status = status;

  const [submissions, total] = await submissionRepo.findAll(tenantId, assignmentId, filter, { page, limit });

  // Stats always reflect the full assignment counts (not the filtered/paginated page)
  const stats = {
    totalSubmissions: assignment.submissionCount,
    graded:           assignment.gradedCount,
  };

  return { submissions, stats, pagination: { total, page: Number(page || 1), limit: Number(limit || 50) } };
}

async function submitAssignment(tenantId, assignmentId, data, user, file) {
  const assignment = await assignmentRepo.findById(tenantId, assignmentId);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (assignment.status !== 'published') throw new AppError('Assignment is not published', 400);

  // Enrollment check
  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, assignment.courseId._id ?? assignment.courseId);
  if (!enrollment) throw new AppError('You are not enrolled in this course', 403);

  // Due date check — respect per-student extension if present
  const now = new Date();
  const extension = (assignment.extensions || []).find(
    (e) => e.studentId?.toString() === user.sub
  );
  const effectiveDueDate = extension ? new Date(extension.extendedDueDate) : (assignment.dueDate ? new Date(assignment.dueDate) : null);
  const isLate = effectiveDueDate && now > effectiveDueDate;
  if (isLate && !assignment.allowLateSubmission)
    throw new AppError('Submission deadline has passed', 400);

  // File type check
  if (file && assignment.allowedFileTypes?.length > 0) {
    const ext = (file.originalName || '').split('.').pop()?.toLowerCase() || '';
    if (!assignment.allowedFileTypes.includes(ext))
      throw new AppError(
        `File type ".${ext}" is not allowed. Accepted: ${assignment.allowedFileTypes.map(t => `.${t}`).join(', ')}`,
        400
      );
  }

  // Check if already graded — graded submissions cannot be re-submitted
  const existing = await submissionRepo.findByStudent(tenantId, assignmentId, user.sub);
  if (existing && existing.status === 'graded')
    throw new AppError('Your submission has already been graded and cannot be changed', 400);

  // Resubmission limit check
  const isResubmission = !!existing;
  if (isResubmission && assignment.maxSubmissions > 0) {
    const used = existing.attemptCount ?? 1;
    if (used >= assignment.maxSubmissions)
      throw new AppError(
        `You have used all ${assignment.maxSubmissions} allowed submission${assignment.maxSubmissions > 1 ? 's' : ''}`,
        400
      );
  }

  if (file && existing?.fileUrl && existing.fileUrl !== file.url) {
    reclaimFile(tenantId, existing.fileUrl);
  }

  const submissionData = {
    tenantId,
    assignmentId,
    studentId: user.sub,
    // Preserve existing text if student doesn't re-enter it on resubmission
    submissionText: data.submissionText || (existing?.submissionText ?? null),
    fileUrl: file ? file.url : (data.fileUrl || (existing?.fileUrl ?? null)),
    originalFileName: file ? file.originalName : (existing?.originalFileName ?? null),
    submittedAt: now,
    status: isLate ? 'late' : 'submitted',
  };

  // Increment attemptCount on every re-submission ($inc is atomic, avoids race conditions)
  const submission = await submissionRepo.upsert(
    tenantId, assignmentId, user.sub, submissionData,
    isResubmission ? { attemptCount: 1 } : null
  );

  // Increment counter only on first submission
  if (!existing) {
    await assignmentRepo.incrementCounter(tenantId, assignmentId, 'submissionCount');
  }

  // Email instructor: new submission received
  try {
    const instructor = await userRepo.findByIdRaw(
      assignment.instructorId?._id ?? assignment.instructorId
    );
    if (instructor?.email) {
      const course = assignment.courseId;
      const { tenantName: tName, branding } = await tenantRepo.getBranding(tenantId);
      const tpl = assignmentSubmittedTpl({
        instructorName: instructor.firstName || instructor.name || 'Instructor',
        studentName:    `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || 'A student',
        studentEmail:   user.email || '',
        assignmentTitle: assignment.title,
        courseName:     typeof course === 'object' ? course.title : '',
        submittedAt:    now.toLocaleString(),
        tenantName:     tName,
        branding,
        appUrl:         config.app.url,
        assignmentId:   assignmentId.toString(),
      });
      await queueEmail({ to: instructor.email, ...tpl });
    }
  } catch (_) { /* email errors must never break submission */ }

  return submission;
}

async function getMySubmission(tenantId, assignmentId, user) {
  const assignment = await assignmentRepo.findById(tenantId, assignmentId);
  if (!assignment) throw new AppError('Assignment not found', 404);

  // Same gate as getAssignment() — without it, a student could pull a draft
  // assignment's title/instructions/rubric, or one for a course they aren't
  // enrolled in, just by knowing/guessing its id.
  if (user.role === 'student') {
    if (assignment.status !== 'published') throw new AppError('Assignment not found', 404);
    const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, assignment.courseId._id ?? assignment.courseId);
    if (!enrollment) throw new AppError('You are not enrolled in this course', 403);
  }

  const submission = await submissionRepo.findByStudent(tenantId, assignmentId, user.sub);
  return { assignment, submission: submission || null };
}

async function gradeSubmission(tenantId, submissionId, data, user) {
  const submission = await submissionRepo.findById(tenantId, submissionId);
  if (!submission) throw new AppError('Submission not found', 404);

  const assignment = await assignmentRepo.findById(tenantId, submission.assignmentId._id ?? submission.assignmentId);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);

  let finalMarks;
  let rubricScores = null;

  if (Array.isArray(data.rubricScores) && data.rubricScores.length > 0) {
    // Rubric grading path — validate against the assignment's own saved
    // rubric, never the maxPoints/criterion names the client sent. Without
    // this, a tampered request could invent a fake criterion (or an
    // inflated maxPoints for a real one) and award full marks while
    // bypassing the actual rubric structure entirely.
    if (!Array.isArray(assignment.rubric) || assignment.rubric.length === 0) {
      throw new AppError('This assignment has no rubric configured', 400);
    }
    const rubricMaxByName = new Map(assignment.rubric.map(r => [r.criterion, r.maxPoints]));
    if (data.rubricScores.length !== assignment.rubric.length) {
      throw new AppError('All rubric criteria must be scored', 400);
    }
    for (const r of data.rubricScores) {
      const realMax = rubricMaxByName.get(r.criterion);
      if (realMax === undefined)
        throw new AppError(`Unknown rubric criterion "${r.criterion}"`, 400);
      if (Number(r.awardedPoints) < 0)
        throw new AppError(`awardedPoints cannot be negative for "${r.criterion}"`, 400);
      if (Number(r.awardedPoints) > realMax)
        throw new AppError(`awardedPoints (${r.awardedPoints}) exceeds "${r.criterion}"'s maxPoints (${realMax})`, 400);
    }
    finalMarks = data.rubricScores.reduce((sum, r) => sum + Number(r.awardedPoints), 0);
    rubricScores = data.rubricScores.map(r => ({
      criterion:     r.criterion,
      maxPoints:     rubricMaxByName.get(r.criterion), // real value, never client-supplied
      awardedPoints: Number(r.awardedPoints),
    }));
  } else {
    // Simple marks grading path
    if (data.marks === undefined || isNaN(Number(data.marks)))
      throw new AppError('marks is required', 400);
    finalMarks = Number(data.marks);
  }

  if (finalMarks > assignment.totalMarks)
    throw new AppError(`Marks cannot exceed totalMarks (${assignment.totalMarks})`, 400);

  const wasGraded = submission.status === 'graded';
  const gradeUpdate = {
    marks:    finalMarks,
    feedback: data.feedback || null,
    gradedBy: user.sub,
    gradedAt: new Date(),
    status:   'graded',
  };
  if (rubricScores) gradeUpdate.rubricScores = rubricScores;

  const updated = await submissionRepo.updateById(tenantId, submissionId, gradeUpdate);

  // Increment gradedCount on first grading
  if (!wasGraded) {
    await assignmentRepo.incrementCounter(tenantId, assignment._id, 'gradedCount');
  }

  // Email student: assignment graded
  try {
    const student = await userRepo.findByIdRaw(
      submission.studentId?._id ?? submission.studentId
    );
    if (student?.email) {
      const course = assignment.courseId;
      const { tenantName: tName, branding } = await tenantRepo.getBranding(tenantId);
      const tpl = assignmentGradedTpl({
        studentName:     student.firstName || student.name || 'Student',
        assignmentTitle: assignment.title,
        courseName:      typeof course === 'object' ? course.title : '',
        marks:           finalMarks,
        totalMarks:      assignment.totalMarks,
        feedback:        data.feedback || '',
        tenantName:      tName,
        branding,
        appUrl:          config.app.url,
      });
      await queueEmail({ to: student.email, ...tpl });
    }
  } catch (_) { /* email errors must never break grading */ }

  // In-app notification
  try {
    const studentId = (submission.studentId?._id ?? submission.studentId).toString();
    const notifySvc = require('../notification/notification.service');
    const courseId = typeof assignment.courseId === 'object'
      ? assignment.courseId._id?.toString()
      : assignment.courseId?.toString();
    await notifySvc.notifyAssignmentGraded(
      tenantId, studentId, assignment.title,
      `${finalMarks}/${assignment.totalMarks}`, courseId
    );
  } catch (_) { /* non-critical */ }

  return updated;
}

// ─── Deadline Extensions ──────────────────────────────────────────────────────

async function grantExtension(tenantId, assignmentId, studentId, extendedDueDate, note, user) {
  const assignment = await assignmentRepo.findById(tenantId, assignmentId);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);
  if (!extendedDueDate) throw new AppError('extendedDueDate is required', 400);

  const newDate = new Date(extendedDueDate);
  if (isNaN(newDate.getTime())) throw new AppError('Invalid extendedDueDate', 400);

  // Upsert: replace existing extension for this student if present
  const Assignment = require('../../database/models/Assignment.model');
  await Assignment.updateOne(
    { _id: assignmentId, tenantId, deletedAt: null },
    { $pull: { extensions: { studentId } } }
  );
  await Assignment.updateOne(
    { _id: assignmentId, tenantId, deletedAt: null },
    {
      $push: {
        extensions: {
          studentId,
          extendedDueDate: newDate,
          note: note || null,
          grantedBy: user.sub,
          grantedAt: new Date(),
        },
      },
    }
  );
  return assignmentRepo.findById(tenantId, assignmentId);
}

async function revokeExtension(tenantId, assignmentId, studentId, user) {
  const assignment = await assignmentRepo.findById(tenantId, assignmentId);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);

  const Assignment = require('../../database/models/Assignment.model');
  await Assignment.updateOne(
    { _id: assignmentId, tenantId, deletedAt: null },
    { $pull: { extensions: { studentId } } }
  );
  return assignmentRepo.findById(tenantId, assignmentId);
}

// Returns enrolled students who have NOT submitted yet
async function getNotSubmitted(tenantId, assignmentId, user) {
  const assignment = await assignmentRepo.findById(tenantId, assignmentId);
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);

  const courseId = assignment.courseId._id ?? assignment.courseId;

  // All enrolled students for this course, active or completed — course
  // completion is driven purely by lesson-watch percentage, decoupled from
  // whether this specific assignment was ever submitted, so a student who
  // finished the course's lessons can still genuinely be missing this
  // submission and belongs on the instructor's reminder list.
  const [allStudents] = await enrollmentRepo.findByCourse(tenantId, courseId, { status: { $in: ['active', 'completed'] } }, { limit: 1000 });

  // All submissions for this assignment
  const [submissions] = await submissionRepo.findAll(tenantId, assignmentId, {}, { limit: 1000 });
  const submittedIds = new Set(submissions.map((s) => s.studentId?._id?.toString() ?? s.studentId?.toString()));

  // Students with no submission
  const notSubmitted = allStudents
    .filter((e) => {
      const uid = e.userId?._id?.toString() ?? e.userId?.toString();
      return !submittedIds.has(uid);
    })
    .map((e) => ({
      _id:       e.userId?._id ?? e.userId,
      firstName: e.userId?.name?.split(' ')[0] ?? e.userId?.firstName ?? '',
      lastName:  e.userId?.name?.split(' ').slice(1).join(' ') ?? e.userId?.lastName ?? '',
      email:     e.userId?.email ?? '',
      enrolledAt: e.enrolledAt,
    }));

  return { notSubmitted, total: notSubmitted.length };
}

async function addComment(tenantId, assignmentId, submissionId, text, user) {
  const submission = await submissionRepo.findById(tenantId, submissionId);
  if (!submission) throw new AppError('Submission not found', 404);

  // The permission check below only verifies the caller manages the
  // assignment this submission actually belongs to — never trust the URL's
  // :assignmentId alone, or an instructor could pass a colleague's
  // submissionId under their own assignmentId and both read and comment on
  // a submission (marks, feedback, other comments) they don't own.
  const submissionAssignmentId = (submission.assignmentId?._id ?? submission.assignmentId)?.toString();
  if (submissionAssignmentId !== assignmentId) throw new AppError('Submission not found', 404);

  const assignment = await assignmentRepo.findById(tenantId, submissionAssignmentId);
  if (!assignment) throw new AppError('Assignment not found', 404);

  // Only the submitting student or a manager (instructor/admin) may comment
  const isStudent = user.role === 'student';
  const isOwner   = submission.studentId?._id?.toString() === user.sub || submission.studentId?.toString() === user.sub;
  if (isStudent && !isOwner) throw new AppError('Forbidden', 403);
  if (!isStudent && !canManageAssignment(assignment, user)) throw new AppError('Forbidden', 403);

  const comment = { userId: user.sub, text: text.trim(), createdAt: new Date() };
  return submissionRepo.addComment(tenantId, submissionId, comment);
}

// Bulk fetch submission status for a student across multiple assignments (for list page)
async function getMySubmissions(tenantId, userId, assignmentIds) {
  const ids = (Array.isArray(assignmentIds) ? assignmentIds : assignmentIds.split(','))
    .filter(Boolean)
    .slice(0, 50); // cap at 50 for safety

  const submissions = await submissionRepo.findByStudentBulk(tenantId, userId, ids);

  // Return a map: { [assignmentId]: { status, marks, submittedAt } }
  const map = {};
  for (const s of submissions) {
    const aid = s.assignmentId?.toString();
    if (aid) map[aid] = { status: s.status, marks: s.marks, submittedAt: s.submittedAt };
  }
  return map;
}

module.exports = {
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  publishAssignment,
  archiveAssignment,
  deleteAssignment,
  listSubmissions,
  submitAssignment,
  getMySubmission,
  gradeSubmission,
  getNotSubmitted,
  getMySubmissions,
  addComment,
  grantExtension,
  revokeExtension,
};
