const mongoose    = require('mongoose');
const Course      = require('../../database/models/Course.model');
const User        = require('../../database/models/User.model');
const Quiz        = require('../../database/models/Quiz.model');
const Assignment  = require('../../database/models/Assignment.model');

async function globalSearch(tenantId, { q = '', type = 'all', limit = 10 } = {}, role = null) {
  if (!q || q.trim().length < 2) return { courses: [], users: [], quizzes: [], assignments: [] };

  const tid   = new mongoose.Types.ObjectId(tenantId);
  const regex = { $regex: q.trim(), $options: 'i' };
  const n     = Math.min(Number(limit), 30);

  const all              = !type || type === 'all';
  const searchCourses    = all || type === 'courses';
  // User search had no role check at all, so any student could enumerate
  // every other student's/instructor's name and email tenant-wide with a
  // 2-character query. Restricted to instructor/tenant_admin — they
  // already hold user:read broadly (config/permissions.js), matching a
  // real need to look students up; a student has no equivalent reason to
  // browse a directory of everyone else in the tenant.
  const canSearchUsers   = role === 'instructor' || role === 'tenant_admin';
  const searchUsers      = (all || type === 'users') && canSearchUsers;
  const searchQuizzes    = all || type === 'quizzes';
  const searchAssignments = all || type === 'assignments';

  const [courses, users, quizzes, assignments] = await Promise.all([
    searchCourses
      ? Course.find({
          tenantId: tid,
          deletedAt: null,
          status: 'published',
          $or: [{ title: regex }, { description: regex }],
        })
          .select('title thumbnail price isFree enrollmentCount status level')
          .limit(n)
          .lean()
      : Promise.resolve([]),

    searchUsers
      ? User.find({
          tenantId: tid,
          deletedAt: null,
          role: { $in: ['student', 'instructor'] },
          $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
        })
          .select('firstName lastName email role avatar')
          .limit(n)
          .lean()
      : Promise.resolve([]),

    searchQuizzes
      ? Quiz.find({
          tenantId: tid,
          deletedAt: null,
          status: 'published',
          $or: [{ title: regex }, { description: regex }],
        })
          .select('title description courseId questionCount timeLimit status')
          .populate('courseId', 'title')
          .limit(n)
          .lean()
      : Promise.resolve([]),

    searchAssignments
      ? Assignment.find({
          tenantId: tid,
          deletedAt: null,
          status: { $in: ['published', 'active'] },
          $or: [{ title: regex }, { description: regex }],
        })
          .select('title description courseId dueDate status')
          .populate('courseId', 'title')
          .limit(n)
          .lean()
      : Promise.resolve([]),
  ]);

  return { courses, users, quizzes, assignments };
}

module.exports = { globalSearch };
