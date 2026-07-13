const Cohort         = require('../../database/models/Cohort.model');
const CohortMember   = require('../../database/models/CohortMember.model');
const Enrollment     = require('../../database/models/Enrollment.model');
const CourseProgress = require('../../database/models/CourseProgress.model');
const Course         = require('../../database/models/Course.model');
const User           = require('../../database/models/User.model');
const AppError       = require('../../utils/AppError');

function calcExpiresAt(accessDurationDays) {
  if (!accessDurationDays || accessDurationDays <= 0) return null;
  return new Date(Date.now() + accessDurationDays * 24 * 60 * 60 * 1000);
}

// ─── List all cohorts for a tenant (with optional courseId/status filter) ──────
async function listAllCohorts(tenantId, { courseId, status } = {}) {
  const filter = { tenantId };
  if (courseId) filter.courseId = courseId;
  if (status)   filter.status = status;

  const cohorts = await Cohort.find(filter)
    .sort({ createdAt: -1 })
    .populate('courseId', 'title thumbnail')
    .populate('createdBy', 'firstName lastName')
    .lean();

  const enriched = await Promise.all(cohorts.map(async (c) => {
    const [total, graduated] = await Promise.all([
      CohortMember.countDocuments({ tenantId, cohortId: c._id }),
      CohortMember.countDocuments({ tenantId, cohortId: c._id, status: 'graduated' }),
    ]);
    return {
      ...c,
      memberCount:     total,
      graduatedCount:  graduated,
      graduationRate:  total > 0 ? Math.round((graduated / total) * 100) : 0,
    };
  }));

  return enriched;
}

// ─── Get single cohort with summary counts ────────────────────────────────────
async function getOneCohort(tenantId, cohortId) {
  const cohort = await Cohort.findOne({ _id: cohortId, tenantId })
    .populate('courseId', 'title thumbnail')
    .populate('createdBy', 'firstName lastName')
    .lean();
  if (!cohort) throw new AppError('Cohort not found', 404);

  const [total, graduated] = await Promise.all([
    CohortMember.countDocuments({ tenantId, cohortId }),
    CohortMember.countDocuments({ tenantId, cohortId, status: 'graduated' }),
  ]);

  return {
    ...cohort,
    memberCount:    total,
    graduatedCount: graduated,
    graduationRate: total > 0 ? Math.round((graduated / total) * 100) : 0,
  };
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────
async function createCohort(tenantId, courseId, data, actingUser) {
  const course = await Course.findOne({ _id: courseId, tenantId, deletedAt: null });
  if (!course) throw new AppError('Course not found', 404);

  const { name, description, startDate, endDate, maxSize } = data;
  if (!name?.trim()) throw new AppError('Cohort name is required', 400);

  return Cohort.create({
    tenantId, courseId,
    name:        name.trim(),
    description: description?.trim() || '',
    startDate:   startDate ? new Date(startDate) : null,
    endDate:     endDate   ? new Date(endDate)   : null,
    maxSize:     Number(maxSize) || 0,
    createdBy:   actingUser.sub,
  });
}

async function listCohorts(tenantId, courseId) {
  return Cohort.find({ tenantId, courseId })
    .sort({ createdAt: -1 })
    .populate('createdBy', 'firstName lastName');
}

async function updateCohort(tenantId, cohortId, data) {
  const cohort = await Cohort.findOne({ _id: cohortId, tenantId });
  if (!cohort) throw new AppError('Cohort not found', 404);

  const allowed = ['name', 'description', 'startDate', 'endDate', 'maxSize', 'status'];
  allowed.forEach(f => { if (data[f] !== undefined) cohort[f] = data[f]; });
  return cohort.save();
}

async function deleteCohort(tenantId, cohortId) {
  const cohort = await Cohort.findOne({ _id: cohortId, tenantId });
  if (!cohort) throw new AppError('Cohort not found', 404);
  await cohort.deleteOne();
  await CohortMember.deleteMany({ tenantId, cohortId });
  return { ok: true };
}

// ─── Bulk-enroll into cohort ───────────────────────────────────────────────────
async function bulkEnroll(tenantId, cohortId, userIds) {
  const cohort = await Cohort.findOne({ _id: cohortId, tenantId }).populate('courseId');
  if (!cohort) throw new AppError('Cohort not found', 404);

  const course = cohort.courseId;

  if (cohort.maxSize > 0) {
    const currentCount = await CohortMember.countDocuments({ tenantId, cohortId, status: { $in: ['enrolled', 'graduated'] } });
    if (currentCount + userIds.length > cohort.maxSize)
      throw new AppError(`Cohort capacity (${cohort.maxSize}) would be exceeded`, 400, 'COHORT_FULL');
  }

  const expiresAt = calcExpiresAt(course.accessDurationDays);
  const results = { enrolled: [], skipped: [] };

  for (const userId of userIds) {
    // Enrollment record
    const existing = await Enrollment.findOne({ tenantId, courseId: course._id, userId });
    if (existing) {
      if (existing.status === 'active') {
        results.skipped.push({ userId, reason: 'Already enrolled' });
      } else {
        await Enrollment.updateOne({ _id: existing._id }, { status: 'active', enrolledAt: new Date(), droppedAt: null, expiresAt });
        results.enrolled.push(userId);
      }
    } else {
      await Enrollment.create({ tenantId, courseId: course._id, userId, pricePaid: 0, discountAmount: 0, couponCode: null, expiresAt });
      await Course.updateOne({ _id: course._id, tenantId }, { $inc: { enrollmentCount: 1 } });
      results.enrolled.push(userId);
    }

    // CohortMember record (idempotent)
    const memberExists = await CohortMember.findOne({ tenantId, cohortId, userId });
    if (!memberExists) {
      await CohortMember.create({ tenantId, cohortId, courseId: course._id, userId, enrolledAt: new Date() });
    }
  }

  return results;
}

// ─── Students list with progress ──────────────────────────────────────────────
async function getCohortStudents(tenantId, cohortId) {
  const cohort = await Cohort.findOne({ _id: cohortId, tenantId })
    .populate('courseId', 'title totalLessons')
    .lean();
  if (!cohort) throw new AppError('Cohort not found', 404);

  const members = await CohortMember.find({ tenantId, cohortId })
    .populate('userId', 'firstName lastName email avatar')
    .lean();

  const userIds = members.map(m => (m.userId?._id ?? m.userId));
  const progresses = await CourseProgress.find({
    tenantId,
    courseId: cohort.courseId._id ?? cohort.courseId,
    userId: { $in: userIds },
  }).lean();

  const progressMap = {};
  for (const p of progresses) progressMap[p.userId.toString()] = p;

  const students = members.map(m => {
    const uid = (m.userId?._id ?? m.userId).toString();
    const p = progressMap[uid];
    return {
      ...m,
      progress:         p?.percentage        ?? 0,
      completedLessons: p?.completedLessons  ?? 0,
      totalLessons:     p?.totalLessons      ?? 0,
      lastAccessedAt:   p?.lastAccessedAt    ?? null,
    };
  });

  return { cohort, students };
}

// ─── Graduate a single student ────────────────────────────────────────────────
async function graduateStudent(tenantId, cohortId, userId, actingUser) {
  const member = await CohortMember.findOne({ tenantId, cohortId, userId });
  if (!member) throw new AppError('Student is not in this cohort', 404);
  if (member.status === 'graduated') throw new AppError('Student is already graduated', 400);

  member.status      = 'graduated';
  member.graduatedAt = new Date();
  member.graduatedBy = actingUser.sub;
  await member.save();

  return member;
}

// ─── Graduate all members who have completed 100% ─────────────────────────────
async function graduateAll(tenantId, cohortId, actingUser) {
  const cohort = await Cohort.findOne({ _id: cohortId, tenantId });
  if (!cohort) throw new AppError('Cohort not found', 404);

  const enrolledMembers = await CohortMember.find({ tenantId, cohortId, status: 'enrolled' }).lean();
  if (enrolledMembers.length === 0) return { graduated: 0 };

  const userIds = enrolledMembers.map(m => m.userId);
  const completedProgresses = await CourseProgress.find({
    tenantId,
    courseId: cohort.courseId,
    userId: { $in: userIds },
    percentage: 100,
  }).lean();

  const completedSet = new Set(completedProgresses.map(p => p.userId.toString()));

  const now = new Date();
  let count = 0;
  for (const member of enrolledMembers) {
    if (completedSet.has(member.userId.toString())) {
      await CohortMember.updateOne(
        { _id: member._id },
        { status: 'graduated', graduatedAt: now, graduatedBy: actingUser.sub }
      );
      count++;
    }
  }

  return { graduated: count };
}

// ─── Cohort report ────────────────────────────────────────────────────────────
async function getCohortReport(tenantId, cohortId) {
  const cohort = await Cohort.findOne({ _id: cohortId, tenantId })
    .populate('courseId', 'title thumbnail')
    .lean();
  if (!cohort) throw new AppError('Cohort not found', 404);

  const members = await CohortMember.find({ tenantId, cohortId }).lean();
  const total = members.length;

  if (total === 0) {
    return {
      cohort,
      summary:      { total: 0, graduated: 0, enrolled: 0, dropped: 0, avgProgress: 0, graduationRate: 0, dropoutRate: 0 },
      distribution: { '0-25': 0, '26-50': 0, '51-75': 0, '76-99': 0, '100': 0 },
      topPerformers: [],
    };
  }

  const userIds = members.map(m => m.userId);
  const progresses = await CourseProgress.find({
    tenantId,
    courseId: cohort.courseId._id ?? cohort.courseId,
    userId: { $in: userIds },
  }).lean();

  const progressMap = {};
  for (const p of progresses) progressMap[p.userId.toString()] = p.percentage;

  const graduated = members.filter(m => m.status === 'graduated').length;
  const dropped   = members.filter(m => m.status === 'dropped').length;
  const enrolled  = members.filter(m => m.status === 'enrolled').length;

  const percentages   = members.map(m => progressMap[m.userId.toString()] ?? 0);
  const totalProgress = percentages.reduce((a, b) => a + b, 0);
  const avgProgress   = Math.round(totalProgress / total);

  const distribution = { '0-25': 0, '26-50': 0, '51-75': 0, '76-99': 0, '100': 0 };
  for (const pct of percentages) {
    if (pct === 100)      distribution['100']++;
    else if (pct >= 76)   distribution['76-99']++;
    else if (pct >= 51)   distribution['51-75']++;
    else if (pct >= 26)   distribution['26-50']++;
    else                  distribution['0-25']++;
  }

  const graduationRate = Math.round((graduated / total) * 100);
  const dropoutRate    = Math.round((dropped   / total) * 100);

  // Top performers: graduated first, then by progress desc
  const ranked = members
    .map(m => ({
      userId:   m.userId,
      status:   m.status,
      progress: progressMap[m.userId.toString()] ?? 0,
    }))
    .sort((a, b) => {
      if (a.status === 'graduated' && b.status !== 'graduated') return -1;
      if (b.status === 'graduated' && a.status !== 'graduated') return 1;
      return b.progress - a.progress;
    })
    .slice(0, 10);

  const topUserIds = ranked.map(r => r.userId);
  const topUsers   = await User.find({ _id: { $in: topUserIds } })
    .select('firstName lastName email avatar')
    .lean();

  const userMap = {};
  for (const u of topUsers) userMap[u._id.toString()] = u;

  const topPerformers = ranked.map(r => ({
    ...r,
    user: userMap[r.userId.toString()] ?? null,
  }));

  return {
    cohort,
    summary: { total, graduated, enrolled, dropped, avgProgress, graduationRate, dropoutRate },
    distribution,
    topPerformers,
  };
}

module.exports = {
  listAllCohorts, getOneCohort,
  createCohort, listCohorts, updateCohort, deleteCohort,
  bulkEnroll, getCohortStudents,
  graduateStudent, graduateAll, getCohortReport,
};
