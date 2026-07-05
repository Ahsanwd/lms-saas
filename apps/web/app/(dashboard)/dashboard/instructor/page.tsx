'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge, Spinner } from '@/components/ui';
import { formatDate } from '@/lib/utils';

// Real shape returned by GET /dashboard/instructor
interface InstructorDashboard {
  courses: { total: number; published: number; draft: number };
  students: { total: number; completed: number; averageCompletion: number };
  quizzes: { totalAttempts: number; averageScore: number; passRate: number; pendingGrades: number };
  topCourses: Array<{ _id: string; title: string; thumbnail?: string; enrollmentCount: number; status: string }>;
  recentEnrollments: Array<{
    _id: string;
    userId: { firstName: string; lastName: string; email: string; avatar?: string };
    courseId: { title: string; thumbnail?: string };
    enrolledAt: string;
  }>;
}

export default function InstructorDashboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data: stats, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery<InstructorDashboard>({
    queryKey: ['dashboard', 'instructor'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/instructor');
      return data.data.dashboard;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  const pendingGrades = stats?.quizzes?.pendingGrades ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Instructor Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome back, {user?.firstName}.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Updated {Math.round((Date.now() - dataUpdatedAt) / 1000)}s ago
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh stats"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <svg className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => router.push('/courses/new')}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-left bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          New Course →
        </button>
        <button
          onClick={() => router.push('/assignments')}
          className={`rounded-xl px-4 py-3 text-sm font-semibold text-left transition-colors ${
            pendingGrades > 0
              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Pending Grades {pendingGrades > 0 ? `(${pendingGrades})` : ''} →
        </button>
        <button
          onClick={() => router.push('/quizzes')}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-left bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
        >
          Quizzes →
        </button>
        <button
          onClick={() => router.push('/analytics')}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-left bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
        >
          Analytics →
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="My Courses"
          value={stats?.courses?.total ?? 0}
          subtitle={`${stats?.courses?.published ?? 0} published`}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
        <StatCard
          title="Total Students"
          value={stats?.students?.total ?? 0}
          subtitle={`${stats?.students?.averageCompletion ?? 0}% avg completion`}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <StatCard
          title="Quiz Avg Score"
          value={`${stats?.quizzes?.averageScore ?? 0}%`}
          subtitle={`${stats?.quizzes?.totalAttempts ?? 0} attempts`}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          title="Pending Grades"
          value={stats?.quizzes?.pendingGrades ?? 0}
          subtitle="need manual review"
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top Courses */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">My Courses</h2>
            <button
              onClick={() => router.push('/courses')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View all →
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
            {(stats?.topCourses?.length ?? 0) === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-500">No courses yet.</p>
                <button
                  onClick={() => router.push('/courses/new')}
                  className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Create your first course →
                </button>
              </div>
            ) : (
              stats!.topCourses.map((course) => (
                <div
                  key={course._id}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/courses/${course._id}`)}
                >
                  <div className="w-9 h-9 rounded-lg bg-primary-50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {course.thumbnail ? (
                      <img src={course.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-4 h-4 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{course.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{course.enrollmentCount} students</p>
                  </div>
                  <Badge variant={course.status === 'published' ? 'success' : 'default'}>
                    {course.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Enrollments */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Recent Enrollments</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
            {(stats?.recentEnrollments?.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-500 px-5 py-8 text-center">No enrollments yet.</p>
            ) : (
              stats!.recentEnrollments.map((e) => (
                <div key={e._id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex-shrink-0 flex items-center justify-center text-primary-700 font-semibold text-xs uppercase">
                    {e.userId?.firstName?.[0] ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {e.userId?.firstName} {e.userId?.lastName}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{e.courseId?.title}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(e.enrolledAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
