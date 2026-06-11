'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button, Spinner } from '@/components/ui';
import { formatDate } from '@/lib/utils';

// ── Types matching the actual API response ─────────────────────────────────────
interface CourseRef { _id: string; title: string; thumbnail?: string; totalLessons?: number; level?: string }
interface LessonRef  { _id: string; title: string; type: string; durationSeconds?: number }

interface InProgressCourse {
  _id: string;
  courseId: CourseRef;
  completedLessons: number;
  percentage: number;
  lastAccessedAt?: string;
}

interface RecentActivity {
  _id: string;
  lessonId: LessonRef;
  courseId: CourseRef;
  lastAccessedAt: string;
}

interface StudentDashboardData {
  enrollments: { active: number; completed: number; total: number };
  certificates: number;
  quizzes: { totalAttempts: number; averageScore: number; passRate: number };
  inProgressCourses: InProgressCourse[];
  recentActivity: RecentActivity[];
}

const LESSON_TYPE_ICON: Record<string, string> = {
  video: '▶', text: '📄', file: '📎', quiz: '📝',
};

const LEVEL_COLOR: Record<string, string> = {
  beginner: 'text-green-600 bg-green-50',
  intermediate: 'text-yellow-700 bg-yellow-50',
  advanced: 'text-red-600 bg-red-50',
};

// ── Progress bar ───────────────────────────────────────────────────────────────
function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-primary-500 rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function StudentDashboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery<StudentDashboardData>({
    queryKey: ['dashboard', 'student'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/student');
      return data.data.dashboard;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const firstName = user?.firstName ?? 'there';

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  const noActivity = (data?.enrollments?.total ?? 0) === 0;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Welcome back, {firstName}!</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here&apos;s your learning progress.</p>
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
          onClick={() => router.push('/courses')}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-left bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          Browse Courses →
        </button>
        <button
          onClick={() => router.push('/my-learning')}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-left bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
        >
          My Learning →
        </button>
        <button
          onClick={() => router.push('/certificates')}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-left bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
        >
          Certificates →
        </button>
        <button
          onClick={() => router.push('/assignments')}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-left bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
        >
          Assignments →
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Enrolled Courses"
          value={data?.enrollments?.total ?? 0}
          subtitle={`${data?.enrollments?.active ?? 0} active`}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
        <StatCard
          title="Completed"
          value={data?.enrollments?.completed ?? 0}
          subtitle="courses finished"
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Quiz Avg. Score"
          value={`${data?.quizzes?.averageScore ?? 0}%`}
          subtitle={`${data?.quizzes?.totalAttempts ?? 0} attempts`}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          title="Certificates"
          value={data?.certificates ?? 0}
          subtitle="earned"
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          }
        />
      </div>

      {/* Empty state */}
      {noActivity ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium">No courses yet</p>
          <p className="text-gray-500 text-sm mt-1">Browse the catalog and enroll in your first course.</p>
          <Button className="mt-4" onClick={() => router.push('/courses')}>Browse Courses</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* In-progress courses — takes 2 cols */}
          <div className="xl:col-span-2 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Continue Learning</h2>
            {(data?.inProgressCourses?.length ?? 0) === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                <p className="text-sm text-gray-500">No courses in progress. Start one from your enrolled courses.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => router.push('/courses')}>
                  Browse Courses
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {data!.inProgressCourses.map((item) => {
                  const course = item.courseId;
                  return (
                    <div
                      key={item._id}
                      className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 hover:shadow-sm transition-shadow cursor-pointer"
                      onClick={() => router.push(`/courses/${course._id}/learn`)}
                    >
                      {/* Thumbnail */}
                      <div className="w-16 h-16 rounded-lg bg-primary-50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                        {course.thumbnail ? (
                          <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                        ) : (
                          <svg className="w-7 h-7 text-primary-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-gray-900 text-sm truncate">{course.title}</p>
                          {course.level && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 capitalize ${LEVEL_COLOR[course.level] ?? 'text-gray-500 bg-gray-100'}`}>
                              {course.level}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {item.completedLessons ?? 0} / {course.totalLessons ?? '?'} lessons
                          {item.lastAccessedAt && ` · Last studied ${formatDate(item.lastAccessedAt)}`}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <ProgressBar value={item.percentage} />
                          <span className="text-xs font-semibold text-primary-600 flex-shrink-0">{item.percentage}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Activity — 1 col */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
              {(data?.recentActivity?.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-500 px-4 py-5 text-center">No activity yet.</p>
              ) : (
                data!.recentActivity.map((activity) => (
                  <div key={activity._id} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">
                      {LESSON_TYPE_ICON[activity.lessonId?.type] ?? '📄'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {activity.lessonId?.title ?? 'Lesson'}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {activity.courseId?.title ?? 'Course'}
                      </p>
                      {activity.lastAccessedAt && (
                        <p className="text-xs text-gray-300 mt-0.5">{formatDate(activity.lastAccessedAt)}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div className="px-4 py-3">
                <button
                  onClick={() => router.push('/courses')}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Browse more courses →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
