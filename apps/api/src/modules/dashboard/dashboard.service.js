const mongoose = require('mongoose');

const User = require('../../database/models/User.model');
const Course = require('../../database/models/Course.model');
const Enrollment = require('../../database/models/Enrollment.model');
const CourseProgress = require('../../database/models/CourseProgress.model');
const LessonProgress = require('../../database/models/LessonProgress.model');
const Quiz = require('../../database/models/Quiz.model');
const QuizAttempt = require('../../database/models/QuizAttempt.model');
const Tenant = require('../../database/models/Tenant.model');
const Invoice = require('../../database/models/Invoice.model');
const Subscription = require('../../database/models/Subscription.model');

const toId = (id) => mongoose.Types.ObjectId.createFromHexString(id.toString());

// ─── Super Admin Dashboard ────────────────────────────────────────────────────
async function getSuperAdminDashboard() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    tenantStatusCounts,
    recentTenants,
    userRoleCounts,
    revenueStats,
    monthlyRevenue,
    expiringSubscriptions,
    recentInvoices,
    planDistribution,
    tenantGrowth,
    totalCourses,
  ] = await Promise.all([
    // Tenant breakdown by status
    Tenant.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // 5 most recently created tenants
    Tenant.find({ deletedAt: null })
      .populate('plan', 'name slug')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name subdomain status createdAt plan'),

    // User count by role across all tenants
    User.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),

    // Overall revenue (all paid invoices)
    Invoice.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),

    // Revenue by month for the last 12 months
    Invoice.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) } } },
      { $group: { _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } }, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),

    // Subscriptions expiring in 7 days (auto-renew off)
    Subscription.find({ status: 'active', currentPeriodEnd: { $lte: sevenDaysAhead }, autoRenew: false })
      .populate('tenantId', 'name subdomain contactEmail')
      .populate('planId', 'name')
      .limit(10),

    // 5 most recent unpaid invoices
    Invoice.find({ status: 'unpaid' })
      .populate('tenantId', 'name subdomain')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('invoiceNumber total dueDate status tenantId'),

    // Plan distribution
    Subscription.aggregate([
      { $match: { status: { $in: ['active', 'trial'] } } },
      { $group: { _id: '$planId', count: { $sum: 1 } } },
      { $lookup: { from: 'plans', localField: '_id', foreignField: '_id', as: 'plan' } },
      { $unwind: '$plan' },
      { $project: { planName: '$plan.name', count: 1 } },
    ]),

    // Tenant growth last 12 months (new tenants per month)
    Tenant.aggregate([
      { $match: { deletedAt: null, createdAt: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),

    // Total courses across all tenants
    Course.countDocuments({ deletedAt: null }),
  ]);

  const tenantCounts = tenantStatusCounts.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {});
  const userCounts   = userRoleCounts.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {});

  // Derive this month's revenue total from the per-month breakdown array
  const thisMonthEntry = monthlyRevenue.find(
    (m) => m._id.year === now.getFullYear() && m._id.month === now.getMonth() + 1
  );
  const thisMonthRevenue = thisMonthEntry?.revenue || 0;

  return {
    tenants: {
      total:     Object.values(tenantCounts).reduce((a, b) => a + b, 0),
      active:    tenantCounts.active    || 0,
      suspended: tenantCounts.suspended || 0,
      trial:     tenantCounts.trial     || 0,
      recent:    recentTenants,
    },
    users: {
      total:        Object.values(userCounts).reduce((a, b) => a + b, 0),
      students:     userCounts.student      || 0,
      instructors:  userCounts.instructor   || 0,
      tenantAdmins: userCounts.tenant_admin || 0,
    },
    courses: {
      total: totalCourses,
    },
    revenue: {
      total:          revenueStats[0]?.total || 0,
      invoiceCount:   revenueStats[0]?.count || 0,
      monthly:        thisMonthRevenue,        // current month's revenue (number, not array)
      monthlyHistory: monthlyRevenue,          // array kept for future chart use
    },
    alerts: {
      expiringSubscriptions,
      unpaidInvoices: recentInvoices,
    },
    planDistribution,
    tenantGrowth,
  };
}

// ─── Tenant Admin Dashboard ───────────────────────────────────────────────────
async function getTenantAdminDashboard(tenantId) {
  const tid = toId(tenantId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    userCounts,
    courseCounts,
    enrollmentCounts,
    avgProgress,
    popularCourses,
    recentEnrollments,
    newUsersThisMonth,
    quizStats,
    subscription,
    storageInfo,
    completionRate,
  ] = await Promise.all([
    // Users by role
    User.aggregate([
      { $match: { tenantId: tid, deletedAt: null } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),

    // Courses by status
    Course.aggregate([
      { $match: { tenantId: tid, deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Enrollments by status
    Enrollment.aggregate([
      { $match: { tenantId: tid } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Average course completion percentage
    CourseProgress.aggregate([
      { $match: { tenantId: tid } },
      { $group: { _id: null, avgPercentage: { $avg: '$percentage' } } },
    ]),

    // Top 5 courses by enrollment
    Course.find({ tenantId: tid, status: 'published', deletedAt: null })
      .sort({ enrollmentCount: -1 })
      .limit(5)
      .select('title thumbnail enrollmentCount rating totalLessons level'),

    // 10 most recent enrollments
    Enrollment.find({ tenantId: tid })
      .populate('userId', 'firstName lastName email avatar')
      .populate('courseId', 'title thumbnail')
      .sort({ enrolledAt: -1 })
      .limit(10),

    // New users this month
    User.countDocuments({ tenantId: tid, createdAt: { $gte: thirtyDaysAgo }, deletedAt: null }),

    // Quiz attempt stats
    QuizAttempt.aggregate([
      { $match: { tenantId: tid, status: { $in: ['auto_graded', 'manually_graded'] } } },
      { $group: { _id: null, total: { $sum: 1 }, avgScore: { $avg: '$percentage' }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
    ]),

    // Current subscription
    Subscription.findOne({ tenantId: tid }).populate('planId', 'name slug limits price'),

    // Tenant storage
    Tenant.findById(tenantId).select('storageUsedBytes plan'),

    // Completion rate
    Enrollment.aggregate([
      { $match: { tenantId: tid } },
      { $group: { _id: null, total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
    ]),
  ]);

  const users = userCounts.reduce((a, c) => { a[c._id] = c.count; return a; }, {});
  const courses = courseCounts.reduce((a, c) => { a[c._id] = c.count; return a; }, {});
  const enrollments = enrollmentCounts.reduce((a, c) => { a[c._id] = c.count; return a; }, {});
  const comp = completionRate[0] || { total: 0, completed: 0 };

  return {
    users: {
      total: Object.values(users).reduce((a, b) => a + b, 0),
      students: users.student || 0,
      instructors: users.instructor || 0,
      newThisMonth: newUsersThisMonth,
    },
    courses: {
      published: courses.published || 0,
      draft: courses.draft || 0,
      archived: courses.archived || 0,
      total: Object.values(courses).reduce((a, b) => a + b, 0),
    },
    enrollments: {
      active: enrollments.active || 0,
      completed: enrollments.completed || 0,
      dropped: enrollments.dropped || 0,
      completionRate: comp.total > 0 ? Math.round((comp.completed / comp.total) * 100) : 0,
    },
    progress: {
      averageCompletion: Math.round(avgProgress[0]?.avgPercentage || 0),
    },
    quizzes: {
      totalAttempts: quizStats[0]?.total || 0,
      averageScore: Math.round(quizStats[0]?.avgScore || 0),
      passRate: quizStats[0]?.total > 0
        ? Math.round((quizStats[0].passed / quizStats[0].total) * 100) : 0,
    },
    subscription,
    popularCourses,
    recentEnrollments,
  };
}

// ─── Instructor Dashboard ─────────────────────────────────────────────────────
async function getInstructorDashboard(tenantId, instructorId) {
  const tid = toId(tenantId);
  const iid = toId(instructorId);

  // Get instructor's course IDs first
  const myCourses = await Course.find({ tenantId: tid, instructorId: iid, deletedAt: null }).select('_id title thumbnail status enrollmentCount totalLessons rating');
  const myCourseIds = myCourses.map(c => c._id);

  const [
    courseCounts,
    enrollmentCounts,
    avgCompletion,
    pendingGrades,
    recentEnrollments,
    quizPerformance,
    topCourses,
    studentGrowth,
  ] = await Promise.all([
    // My course counts by status
    Course.aggregate([
      { $match: { tenantId: tid, instructorId: iid, deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Enrollments in my courses
    Enrollment.aggregate([
      { $match: { tenantId: tid, courseId: { $in: myCourseIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Average completion across my courses
    CourseProgress.aggregate([
      { $match: { tenantId: tid, courseId: { $in: myCourseIds } } },
      { $group: { _id: null, avg: { $avg: '$percentage' } } },
    ]),

    // Pending manual quiz grades
    QuizAttempt.find({ tenantId: tid, status: 'pending_manual' })
      .populate({ path: 'quizId', match: { instructorId: iid }, select: 'title courseId' })
      .populate('userId', 'firstName lastName email')
      .sort({ submittedAt: -1 })
      .limit(10),

    // Recent enrollments in my courses
    Enrollment.find({ tenantId: tid, courseId: { $in: myCourseIds } })
      .populate('userId', 'firstName lastName email avatar')
      .populate('courseId', 'title thumbnail')
      .sort({ enrolledAt: -1 })
      .limit(10),

    // Quiz performance across my courses
    QuizAttempt.aggregate([
      { $match: { tenantId: tid, courseId: { $in: myCourseIds }, status: { $in: ['auto_graded', 'manually_graded'] } } },
      { $group: { _id: null, total: { $sum: 1 }, avgScore: { $avg: '$percentage' }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
    ]),

    // Top 5 courses by enrollment
    Course.find({ tenantId: tid, instructorId: iid, deletedAt: null })
      .sort({ enrollmentCount: -1 })
      .limit(5)
      .select('title thumbnail enrollmentCount rating status'),

    // Student growth (new enrollments per month, last 6 months)
    Enrollment.aggregate([
      { $match: { tenantId: tid, courseId: { $in: myCourseIds }, enrolledAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { year: { $year: '$enrolledAt' }, month: { $month: '$enrolledAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  const courses = courseCounts.reduce((a, c) => { a[c._id] = c.count; return a; }, {});
  const enrollments = enrollmentCounts.reduce((a, c) => { a[c._id] = c.count; return a; }, {});
  const filteredPending = pendingGrades.filter(a => a.quizId !== null);

  return {
    courses: {
      total: myCourses.length,
      published: courses.published || 0,
      draft: courses.draft || 0,
    },
    students: {
      total: enrollments.active || 0,
      completed: enrollments.completed || 0,
      averageCompletion: Math.round(avgCompletion[0]?.avg || 0),
      growth: studentGrowth,
    },
    quizzes: {
      totalAttempts: quizPerformance[0]?.total || 0,
      averageScore: Math.round(quizPerformance[0]?.avgScore || 0),
      passRate: quizPerformance[0]?.total > 0
        ? Math.round((quizPerformance[0].passed / quizPerformance[0].total) * 100) : 0,
      pendingGrades: filteredPending.length,
      pendingList: filteredPending.slice(0, 5),
    },
    topCourses,
    recentEnrollments,
  };
}

// ─── Student Dashboard ────────────────────────────────────────────────────────
async function getStudentDashboard(tenantId, userId) {
  const tid = toId(tenantId);
  const uid = toId(userId);

  const [
    enrollmentCounts,
    recentProgress,
    quizStats,
    certificates,
    recentActivity,
    inProgressCourses,
  ] = await Promise.all([
    // My enrollments by status
    Enrollment.aggregate([
      { $match: { tenantId: tid, userId: uid } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Course progress for all my courses
    CourseProgress.find({ tenantId: tid, userId: uid })
      .populate('courseId', 'title thumbnail totalLessons level instructorId')
      .sort({ lastAccessedAt: -1 })
      .limit(10),

    // My quiz performance
    QuizAttempt.aggregate([
      { $match: { tenantId: tid, userId: uid, status: { $in: ['auto_graded', 'manually_graded'] } } },
      { $group: { _id: null, total: { $sum: 1 }, avgScore: { $avg: '$percentage' }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
    ]),

    // Certificates earned
    Enrollment.countDocuments({ tenantId: tid, userId: uid, certificateIssued: true }),

    // Recent lesson activity
    LessonProgress.find({ tenantId: tid, userId: uid })
      .populate('lessonId', 'title type durationSeconds')
      .populate('courseId', 'title thumbnail')
      .sort({ lastAccessedAt: -1 })
      .limit(5),

    // In-progress courses with percentage
    CourseProgress.find({ tenantId: tid, userId: uid, percentage: { $gt: 0, $lt: 100 } })
      .populate('courseId', 'title thumbnail totalLessons level')
      .sort({ lastAccessedAt: -1 })
      .limit(6),
  ]);

  const enrollments = enrollmentCounts.reduce((a, c) => { a[c._id] = c.count; return a; }, {});

  return {
    enrollments: {
      active: enrollments.active || 0,
      completed: enrollments.completed || 0,
      total: Object.values(enrollments).reduce((a, b) => a + b, 0),
    },
    certificates: certificates || 0,
    quizzes: {
      totalAttempts: quizStats[0]?.total || 0,
      averageScore: Math.round(quizStats[0]?.avgScore || 0),
      passRate: quizStats[0]?.total > 0
        ? Math.round((quizStats[0].passed / quizStats[0].total) * 100) : 0,
    },
    inProgressCourses,
    recentActivity,
    recentProgress,
  };
}

// ─── Student Activity Log ─────────────────────────────────────────────────────
async function getMyActivity(tenantId, userId, { page = 1, limit = 20 } = {}) {
  const tid = toId(tenantId);
  const uid = toId(userId);
  const skip = (page - 1) * limit;

  const [lessonActivity, totalCount] = await Promise.all([
    LessonProgress.find({ tenantId: tid, userId: uid })
      .populate('lessonId', 'title type durationSeconds')
      .populate('courseId', 'title thumbnail')
      .sort({ lastAccessedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LessonProgress.countDocuments({ tenantId: tid, userId: uid }),
  ]);

  // Also get quiz attempts
  const quizActivity = await QuizAttempt.find({ tenantId: tid, userId: uid })
    .populate('quizId', 'title courseId')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // Merge + sort by date
  const events = [
    ...lessonActivity.map(l => ({
      type: l.status === 'completed' ? 'lesson_completed' : 'lesson_viewed',
      title: l.lessonId?.title ?? 'Unknown lesson',
      lessonType: l.lessonId?.type ?? 'video',
      courseTitle: l.courseId?.title ?? '',
      courseThumbnail: l.courseId?.thumbnail ?? null,
      courseId: l.courseId?._id ?? null,
      watchedSeconds: l.watchedDurationSeconds ?? 0,
      status: l.status,
      date: l.lastAccessedAt,
    })),
    ...quizActivity.map(q => ({
      type: q.passed ? 'quiz_passed' : 'quiz_attempted',
      title: q.quizId?.title ?? 'Quiz',
      courseTitle: '',
      courseId: q.quizId?.courseId ?? null,
      score: q.percentage,
      passed: q.passed,
      status: q.status,
      date: q.createdAt,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  // Total watch time across all lessons
  const watchTimeAgg = await LessonProgress.aggregate([
    { $match: { tenantId: tid, userId: uid } },
    { $group: { _id: null, totalSeconds: { $sum: '$watchedDurationSeconds' } } },
  ]);

  return {
    events,
    totalCount,
    totalWatchSeconds: watchTimeAgg[0]?.totalSeconds ?? 0,
    page: Number(page),
    pages: Math.ceil(totalCount / limit),
  };
}

// ─── Onboarding Checklist for new Tenant Admins ───────────────────────────────
async function getOnboardingChecklist(tenantId) {
  const tid = toId(tenantId);

  const [courseCount, studentCount, instructorCount, tenant] = await Promise.all([
    Course.countDocuments({ tenantId: tid, deletedAt: null }),
    User.countDocuments({ tenantId: tid, role: 'student', deletedAt: null }),
    User.countDocuments({ tenantId: tid, role: 'instructor', deletedAt: null }),
    Tenant.findById(tenantId).select('emailSettings settings.logo settings.primaryColor').lean(),
  ]);

  const hasCourses     = courseCount     > 0;
  const hasStudents    = studentCount    > 0;
  const hasInstructor  = instructorCount > 0;
  const hasSmtp        = !!(tenant?.emailSettings?.smtp?.host);
  const hasBranding    = !!(tenant?.settings?.logo || (tenant?.settings?.primaryColor && tenant?.settings?.primaryColor !== '#3B82F6'));

  return {
    hasBranding,
    hasSmtp,
    hasCourses,
    hasInstructor,
    hasStudents,
    isComplete: hasBranding && hasSmtp && hasCourses && hasInstructor && hasStudents,
  };
}

// ─── Student Activity for admin/instructor per course ─────────────────────────
async function getStudentActivityForCourse(tenantId, courseId, studentId, { page = 1, limit = 20 } = {}) {
  const tid = toId(tenantId);
  const cid = toId(courseId);
  const uid = toId(studentId);
  const skip = (page - 1) * limit;

  const [lessonActivity, total] = await Promise.all([
    LessonProgress.find({ tenantId: tid, courseId: cid, userId: uid })
      .populate('lessonId', 'title type durationSeconds')
      .sort({ lastAccessedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LessonProgress.countDocuments({ tenantId: tid, courseId: cid, userId: uid }),
  ]);

  const watchAgg = await LessonProgress.aggregate([
    { $match: { tenantId: tid, courseId: cid, userId: uid } },
    { $group: { _id: null, totalSeconds: { $sum: '$watchedDurationSeconds' }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
  ]);

  return {
    activity: lessonActivity.filter(l => l.lessonId).map(l => ({
      lessonId: l.lessonId._id,
      title: l.lessonId.title ?? 'Lesson',
      type: l.lessonId.type ?? 'video',
      status: l.status,
      watchedSeconds: l.watchedDurationSeconds ?? 0,
      completedAt: l.completedAt,
      lastAccessedAt: l.lastAccessedAt,
    })),
    total,
    totalWatchSeconds: watchAgg[0]?.totalSeconds ?? 0,
    completedCount: watchAgg[0]?.completed ?? 0,
    page: Number(page),
    pages: Math.ceil(total / limit),
  };
}

// ─── Cron Health Logs (super admin) ──────────────────────────────────────────
async function getCronLogs({ limit = 20, page = 1 } = {}) {
  const CronLog = require('../../database/models/CronLog.model');
  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    CronLog.find().sort({ startedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    CronLog.countDocuments(),
  ]);
  return { logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

module.exports = {
  getSuperAdminDashboard,
  getTenantAdminDashboard,
  getInstructorDashboard,
  getStudentDashboard,
  getMyActivity,
  getStudentActivityForCourse,
  getOnboardingChecklist,
  getCronLogs,
};
