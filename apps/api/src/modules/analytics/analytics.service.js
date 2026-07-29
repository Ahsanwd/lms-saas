const mongoose        = require('mongoose');
const User            = require('../../database/models/User.model');
const Course          = require('../../database/models/Course.model');
const Enrollment      = require('../../database/models/Enrollment.model');
const CourseProgress  = require('../../database/models/CourseProgress.model');
const LessonProgress  = require('../../database/models/LessonProgress.model');
const QuizAttempt     = require('../../database/models/QuizAttempt.model');
const CoursePayment   = require('../../database/models/CoursePayment.model');
const BundlePayment   = require('../../database/models/BundlePayment.model');
const { getCached, setCached } = require('../../services/redis');

const CACHE_TTL = 30 * 60; // 30 minutes

// ─── Date range helper ────────────────────────────────────────────────────────
// Accepts explicit from/to ISO strings OR legacy months/days fallback.
function resolveRange({ from, to, months, days }) {
  const until = to ? new Date(to) : new Date();
  if (from) {
    return { since: new Date(from), until };
  }
  const since = new Date(until);
  if (months) since.setMonth(since.getMonth() - Number(months));
  // getEngagementReport's dayCount is an inclusive count of both endpoints
  // (until - since, +1) — subtracting the full `days` here made a `days=7`
  // request span 8 calendar days (today plus 7 full days back) instead of 7.
  // Subtracting one fewer day makes the inclusive count come out to exactly
  // `days`, e.g. days=1 correctly means "just today".
  else if (days) since.setDate(since.getDate() - (Number(days) - 1));
  else since.setMonth(since.getMonth() - 12);
  return { since, until };
}

function cacheKey(tenantId, type, params) {
  const suffix = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
  return `analytics:${tenantId}:${type}:${suffix}`;
}

// ─── 1. Student Report ────────────────────────────────────────────────────────
async function getStudentReport(tenantId, { search = '', page = 1, limit = 20 } = {}) {
  const tid = new mongoose.Types.ObjectId(tenantId);
  const filter = { tenantId: tid, role: 'student', deletedAt: null };
  if (search.trim()) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName:  { $regex: search, $options: 'i' } },
      { email:     { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [students, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .select('firstName lastName email createdAt lastLoginAt').lean(),
    User.countDocuments(filter),
  ]);

  if (students.length === 0) return { students: [], total: 0, page: Number(page), limit: Number(limit) };

  const studentIds = students.map(s => s._id);

  const [enrollStats, progressStats] = await Promise.all([
    Enrollment.aggregate([
      { $match: { tenantId: tid, userId: { $in: studentIds } } },
      { $group: {
        _id: '$userId',
        total:     { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      }},
    ]),
    // $sum, not $avg — CourseProgress only has a document for courses the
    // student actually opened, so $avg silently excluded every enrolled-but-
    // never-started course from the denominator instead of counting it as
    // 0%. A student enrolled in 4 courses with progress in just 1 (at 100%)
    // showed "100% avg completion" — the exact opposite of an accurate
    // signal. Summing here and dividing by enr.total below (all enrollments,
    // including dropped) gives the true per-student average.
    CourseProgress.aggregate([
      { $match: { tenantId: tid, userId: { $in: studentIds } } },
      { $group: {
        _id:             '$userId',
        totalPercentage: { $sum: '$percentage' },
        lastActivityAt:  { $max: '$lastAccessedAt' },
      }},
    ]),
  ]);

  const enrollMap   = Object.fromEntries(enrollStats.map(e => [e._id.toString(), e]));
  const progressMap = Object.fromEntries(progressStats.map(p => [p._id.toString(), p]));

  const result = students.map(s => {
    const id   = s._id.toString();
    const enr  = enrollMap[id]   ?? { total: 0, completed: 0 };
    const prog = progressMap[id] ?? { totalPercentage: 0, lastActivityAt: null };
    return {
      ...s,
      enrollmentCount: enr.total,
      completedCount:  enr.completed,
      avgCompletion:   enr.total > 0 ? Math.round((prog.totalPercentage ?? 0) / enr.total) : 0,
      lastActivityAt:  prog.lastActivityAt,
    };
  });

  return { students: result, total, page: Number(page), limit: Number(limit) };
}

// ─── 2. Revenue Report ────────────────────────────────────────────────────────
async function getRevenueReport(tenantId, { months = 12, from, to } = {}) {
  const key = cacheKey(tenantId, 'revenue', { months, from, to });
  const cached = await getCached(key);
  if (cached) return cached;

  const tid = new mongoose.Types.ObjectId(tenantId);
  const { since, until } = resolveRange({ from, to, months });
  const dateFilter = { $gte: since, $lte: until };

  const [
    totals, monthly, byCourse, byProvider,
    bundleTotals, bundleMonthly, byBundle, bundleByProvider,
  ] = await Promise.all([
    CoursePayment.aggregate([
      { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    CoursePayment.aggregate([
      { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
      { $group: {
        _id:     { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        revenue: { $sum: '$amount' },
        count:   { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    CoursePayment.aggregate([
      { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
      { $group: { _id: '$courseId', revenue: { $sum: '$amount' }, sales: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
      { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
    ]),
    CoursePayment.aggregate([
      { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
      { $group: { _id: '$provider', revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    // ── Bundle payments — merged into totals/monthly/byProvider below, and
    // also broken out separately as byBundle (bundle sales aren't attributable
    // to a single course, so they can't just be folded into byCourse). ──────
    BundlePayment.aggregate([
      { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    BundlePayment.aggregate([
      { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
      { $group: {
        _id:     { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        revenue: { $sum: '$amount' },
        count:   { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    BundlePayment.aggregate([
      { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
      { $group: { _id: '$bundleId', revenue: { $sum: '$amount' }, sales: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'coursebundles', localField: '_id', foreignField: '_id', as: 'bundle' } },
      { $unwind: { path: '$bundle', preserveNullAndEmptyArrays: true } },
    ]),
    BundlePayment.aggregate([
      { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
      { $group: { _id: '$provider', revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  // ── Merge course + bundle revenue into the combined totals/monthly/byProvider ──
  const totalRevenue = (totals[0]?.total ?? 0) + (bundleTotals[0]?.total ?? 0);
  const totalSales   = (totals[0]?.count ?? 0) + (bundleTotals[0]?.count ?? 0);

  const monthlyMap = new Map();
  for (const m of monthly) monthlyMap.set(`${m._id.year}-${m._id.month}`, { _id: m._id, revenue: m.revenue, count: m.count });
  for (const m of bundleMonthly) {
    const key = `${m._id.year}-${m._id.month}`;
    const existing = monthlyMap.get(key);
    if (existing) { existing.revenue += m.revenue; existing.count += m.count; }
    else monthlyMap.set(key, { _id: m._id, revenue: m.revenue, count: m.count });
  }
  const mergedMonthly = Array.from(monthlyMap.values())
    .sort((a, b) => a._id.year - b._id.year || a._id.month - b._id.month);

  const providerMap = new Map();
  for (const p of byProvider) providerMap.set(p._id, { _id: p._id, revenue: p.revenue, count: p.count });
  for (const p of bundleByProvider) {
    const existing = providerMap.get(p._id);
    if (existing) { existing.revenue += p.revenue; existing.count += p.count; }
    else providerMap.set(p._id, { _id: p._id, revenue: p.revenue, count: p.count });
  }
  const mergedByProvider = Array.from(providerMap.values());

  const result = {
    totalRevenue,
    totalSales,
    avgOrderValue: totalSales ? Math.round(totalRevenue / totalSales) : 0,
    monthly: mergedMonthly,
    byCourse: byCourse.map(c => ({
      courseId: c._id,
      title:    c.course?.title ?? 'Unknown Course',
      revenue:  c.revenue,
      sales:    c.sales,
    })),
    byBundle: byBundle.map(b => ({
      bundleId: b._id,
      title:    b.bundle?.title ?? 'Unknown Bundle',
      revenue:  b.revenue,
      sales:    b.sales,
    })),
    byProvider: mergedByProvider,
    range: { from: since.toISOString(), to: until.toISOString() },
  };

  await setCached(key, result, CACHE_TTL);
  return result;
}

// ─── 3. Course Report ─────────────────────────────────────────────────────────
async function getCourseReport(tenantId, { instructorId, page = 1, limit = 20 } = {}) {
  const tid = new mongoose.Types.ObjectId(tenantId);
  const filter = { tenantId: tid, deletedAt: null };
  if (instructorId) filter.instructorId = new mongoose.Types.ObjectId(instructorId);

  const skip = (Number(page) - 1) * Number(limit);
  const [courses, total] = await Promise.all([
    Course.find(filter).sort({ enrollmentCount: -1 }).skip(skip).limit(Number(limit))
      .select('title status enrollmentCount price isFree instructorId').lean(),
    Course.countDocuments(filter),
  ]);

  if (courses.length === 0) return { courses: [], total: 0, page: Number(page), limit: Number(limit) };

  const courseIds = courses.map(c => c._id);

  const [completionStats, quizStats, revenueStats] = await Promise.all([
    Enrollment.aggregate([
      { $match: { tenantId: tid, courseId: { $in: courseIds } } },
      { $group: {
        _id:       '$courseId',
        total:     { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      }},
    ]),
    QuizAttempt.aggregate([
      { $match: { tenantId: tid, courseId: { $in: courseIds }, status: { $in: ['auto_graded', 'manually_graded'] } } },
      { $group: {
        _id:      '$courseId',
        avgScore: { $avg: '$percentage' },
        attempts: { $sum: 1 },
        passed:   { $sum: { $cond: ['$passed', 1, 0] } },
      }},
    ]),
    CoursePayment.aggregate([
      { $match: { tenantId: tid, courseId: { $in: courseIds }, status: 'completed' } },
      { $group: { _id: '$courseId', revenue: { $sum: '$amount' } } },
    ]),
  ]);

  const compMap    = Object.fromEntries(completionStats.map(e => [e._id.toString(), e]));
  const quizMap    = Object.fromEntries(quizStats.map(q => [q._id.toString(), q]));
  const revenueMap = Object.fromEntries(revenueStats.map(r => [r._id.toString(), r]));

  const result = courses.map(c => {
    const id   = c._id.toString();
    const comp = compMap[id]    ?? { total: 0, completed: 0 };
    const quiz = quizMap[id]    ?? { avgScore: 0, attempts: 0, passed: 0 };
    const rev  = revenueMap[id] ?? { revenue: 0 };
    return {
      ...c,
      enrollments:    comp.total,
      completions:    comp.completed,
      completionRate: comp.total > 0 ? Math.round((comp.completed / comp.total) * 100) : 0,
      avgQuizScore:   Math.round(quiz.avgScore ?? 0),
      quizAttempts:   quiz.attempts,
      revenue:        rev.revenue,
    };
  });

  return { courses: result, total, page: Number(page), limit: Number(limit) };
}

// ─── 4. Instructor Earnings ───────────────────────────────────────────────────
async function getInstructorEarnings(tenantId, { months = 12, from, to } = {}) {
  const key = cacheKey(tenantId, 'instructor-earnings', { months, from, to });
  const cached = await getCached(key);
  if (cached) return cached;

  const tid = new mongoose.Types.ObjectId(tenantId);
  const { since, until } = resolveRange({ from, to, months });
  const dateFilter = { $gte: since, $lte: until };

  const instructors = await User.find({ tenantId: tid, role: 'instructor', deletedAt: null })
    .select('firstName lastName email').lean();

  if (instructors.length === 0) {
    const empty = { instructors: [], range: { from: since.toISOString(), to: until.toISOString() } };
    await setCached(key, empty, CACHE_TTL);
    return empty;
  }

  const instructorIds = instructors.map(i => i._id);

  const [courseStats, revenueStats] = await Promise.all([
    Course.aggregate([
      { $match: { tenantId: tid, instructorId: { $in: instructorIds }, deletedAt: null } },
      { $group: {
        _id:              '$instructorId',
        courseCount:      { $sum: 1 },
        totalEnrollments: { $sum: '$enrollmentCount' },
        publishedCourses: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
      }},
    ]),
    CoursePayment.aggregate([
      { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
      { $lookup: { from: 'courses', localField: 'courseId', foreignField: '_id', as: 'course' } },
      { $unwind: '$course' },
      { $match: { 'course.instructorId': { $in: instructorIds } } },
      { $group: {
        _id:     '$course.instructorId',
        revenue: { $sum: '$amount' },
        sales:   { $sum: 1 },
      }},
    ]),
  ]);

  const courseMap  = Object.fromEntries(courseStats.map(c => [c._id.toString(), c]));
  const revenueMap = Object.fromEntries(revenueStats.map(r => [r._id.toString(), r]));

  const result = {
    instructors: instructors.map(i => {
      const id = i._id.toString();
      const cs = courseMap[id]  ?? { courseCount: 0, totalEnrollments: 0, publishedCourses: 0 };
      const rv = revenueMap[id] ?? { revenue: 0, sales: 0 };
      return { ...i, ...cs, revenue: rv.revenue, sales: rv.sales };
    }).sort((a, b) => b.revenue - a.revenue),
    range: { from: since.toISOString(), to: until.toISOString() },
  };

  await setCached(key, result, CACHE_TTL);
  return result;
}

// ─── 5. Engagement Report ─────────────────────────────────────────────────────
async function getEngagementReport(tenantId, { days = 30, from, to } = {}) {
  const key = cacheKey(tenantId, 'engagement', { days, from, to });
  const cached = await getCached(key);
  if (cached) return cached;

  const tid = new mongoose.Types.ObjectId(tenantId);
  const { since, until } = resolveRange({ from, to, days });
  const dateFilter = { $gte: since, $lte: until };

  const dayCount = Math.round((until - since) / (24 * 60 * 60 * 1000)) + 1;

  const [dailyActive, activeCourses, watchTime] = await Promise.all([
    LessonProgress.aggregate([
      { $match: { tenantId: tid, updatedAt: dateFilter } },
      { $group: { _id: {
        date: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
        user: '$userId',
      }}},
      { $group: { _id: '$_id.date', activeUsers: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    LessonProgress.aggregate([
      { $match: { tenantId: tid, updatedAt: dateFilter } },
      { $group: { _id: '$courseId', activityCount: { $sum: 1 } } },
      { $sort: { activityCount: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
      { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
    ]),
    LessonProgress.aggregate([
      { $match: { tenantId: tid, updatedAt: dateFilter } },
      { $group: { _id: null, totalSeconds: { $sum: '$watchedDurationSeconds' } } },
    ]),
  ]);

  // Fill in missing days with 0
  const activeMap = Object.fromEntries(dailyActive.map(d => [d._id, d.activeUsers]));
  const allDays = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    allDays.push({ date: dateKey, activeUsers: activeMap[dateKey] ?? 0 });
  }

  const result = {
    dailyActiveUsers: allDays,
    activeCourses: activeCourses.map(a => ({
      courseId:      a._id,
      title:         a.course?.title ?? 'Unknown',
      activityCount: a.activityCount,
    })),
    totalWatchSeconds: watchTime[0]?.totalSeconds ?? 0,
    days: dayCount,
    range: { from: since.toISOString(), to: until.toISOString() },
  };

  await setCached(key, result, CACHE_TTL);
  return result;
}

module.exports = {
  getStudentReport,
  getRevenueReport,
  getCourseReport,
  getInstructorEarnings,
  getEngagementReport,
};
