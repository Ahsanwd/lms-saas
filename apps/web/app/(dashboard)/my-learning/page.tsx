'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Spinner } from '@/components/ui';
import { formatDate, cn } from '@/lib/utils';

interface CourseRef {
  _id: string;
  title: string;
  thumbnail?: string;
  level?: string;
  totalLessons?: number;
  certificateEnabled?: boolean;
}

interface Enrollment {
  _id: string;
  courseId: CourseRef;
  status: 'active' | 'completed' | 'dropped';
  enrolledAt: string;
  completedAt?: string;
  certificateIssued?: boolean;
}

interface CourseProgress {
  courseId: { _id: string };
  percentage: number;
  completedLessons: number;
  lastLessonId?: string | null;
  totalLessons?: number;
}

const LEVEL_COLOR: Record<string, string> = {
  beginner:     'text-emerald-700 bg-emerald-50 border border-emerald-200',
  intermediate: 'text-amber-700   bg-amber-50   border border-amber-200',
  advanced:     'text-red-700     bg-red-50     border border-red-200',
};

type FilterTab = 'all' | 'active' | 'completed';

function fmtWatchTime(seconds: number) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m watched`;
  if (m > 0) return `${m}m watched`;
  return `${seconds}s watched`;
}

// ── Circular progress ring ───────────────────────────────────────────────────
function ProgressRing({ pct, size = 56, stroke = 4, isCompleted = false }: {
  pct: number; size?: number; stroke?: number; isCompleted?: boolean;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = isCompleted ? '#10b981' : pct > 60 ? '#3b82f6' : pct > 30 ? '#f59e0b' : '#e11d48';

  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <g transform={`rotate(90, ${size / 2}, ${size / 2})`}>
        {isCompleted ? (
          <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>✓</text>
        ) : (
          <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{pct}%</text>
        )}
      </g>
    </svg>
  );
}

export default function MyLearningPage() {
  const router = useRouter();
  const [tab, setTab] = useState<FilterTab>('all');

  const { data: enrollmentsData, isLoading } = useQuery<Enrollment[]>({
    queryKey: ['my-enrollments'],
    queryFn: async () => {
      const { data } = await api.get('/courses/my-enrollments');
      return data.data.enrollments;
    },
  });

  const { data: dashData } = useQuery<{ recentProgress: CourseProgress[] }>({
    queryKey: ['dashboard', 'student'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/student');
      return data.data.dashboard;
    },
  });

  // Activity summary for watch time per course
  const { data: activityData } = useQuery<{ totalWatchSeconds: number }>({
    queryKey: ['my-activity-summary'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/my-activity?limit=1');
      return data.data;
    },
  });

  const progressMap = new Map<string, CourseProgress>(
    (dashData?.recentProgress ?? []).map(p => [p.courseId?._id, p])
  );

  const allEnrollments = enrollmentsData ?? [];
  const filtered = allEnrollments.filter(e => {
    if (tab === 'active') return e.status === 'active';
    if (tab === 'completed') return e.status === 'completed';
    return true;
  });

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all',       label: 'All Courses', count: allEnrollments.length },
    { key: 'active',    label: 'In Progress',  count: allEnrollments.filter(e => e.status === 'active').length },
    { key: 'completed', label: 'Completed',    count: allEnrollments.filter(e => e.status === 'completed').length },
  ];

  const totalWatchSecs = activityData?.totalWatchSeconds ?? 0;

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Learning</h1>
          <p className="text-sm text-gray-500 mt-1">
            {allEnrollments.length} course{allEnrollments.length !== 1 ? 's' : ''} enrolled
            {totalWatchSecs > 0 && (
              <span className="ml-3 text-primary-600 font-medium">· {fmtWatchTime(totalWatchSecs)}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => router.push('/activity')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-primary-50 border border-gray-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Activity Log
        </button>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                'ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold',
                tab === t.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-500'
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-gray-900 font-semibold text-base">
            {tab === 'all' ? 'No courses yet' : tab === 'active' ? 'No courses in progress' : 'No completed courses'}
          </p>
          <p className="text-gray-500 text-sm mt-1 max-w-xs">
            {tab === 'all' ? 'Browse the catalog and enroll in a course to start learning.' : tab === 'active' ? 'Enroll in a course to start learning.' : 'Complete a course to see it here.'}
          </p>
          {tab === 'all' && (
            <button onClick={() => router.push('/courses')}
              className="mt-5 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">
              Browse Courses
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(enrollment => {
            const course = enrollment.courseId;
            const progress = progressMap.get(course._id);
            const pct = progress?.percentage ?? 0;
            const completed = progress?.completedLessons ?? 0;
            const total = course.totalLessons ?? progress?.totalLessons ?? 0;
            const isCompleted = enrollment.status === 'completed';
            const lastLessonId = progress?.lastLessonId;
            const learnUrl = lastLessonId && pct > 0
              ? `/courses/${course._id}/learn?lessonId=${lastLessonId}`
              : `/courses/${course._id}/learn`;

            return (
              <div key={enrollment._id}
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col hover:shadow-lg transition-all hover:-translate-y-0.5 group">

                {/* Thumbnail */}
                <div className="relative h-40 bg-gradient-to-br from-primary-100 to-blue-100 flex-shrink-0 overflow-hidden">
                  {course.thumbnail ? (
                    <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-12 h-12 text-primary-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  {/* Level badge */}
                  {course.level && (
                    <span className={cn('absolute top-3 left-3 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide', LEVEL_COLOR[course.level] ?? 'text-gray-500 bg-white')}>
                      {course.level}
                    </span>
                  )}
                  {/* Completed badge */}
                  {isCompleted && (
                    <div className="absolute top-3 right-3 bg-emerald-500 text-white rounded-full px-2.5 py-1 flex items-center gap-1 text-[10px] font-bold shadow">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      Completed
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-bold text-gray-900 text-sm leading-snug mb-3 line-clamp-2">
                    {course.title}
                  </h3>

                  {/* Progress ring + stats */}
                  <div className="flex items-center gap-3 mb-4">
                    <ProgressRing pct={pct} isCompleted={isCompleted} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', isCompleted ? 'bg-emerald-500' : pct > 60 ? 'bg-blue-500' : pct > 30 ? 'bg-amber-500' : 'bg-primary-500')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 font-medium">
                        {completed}/{total} lessons done
                      </p>
                      {enrollment.completedAt ? (
                        <p className="text-xs text-emerald-600 font-medium">
                          ✓ Completed {formatDate(enrollment.completedAt)}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">
                          Started {formatDate(enrollment.enrolledAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-auto flex flex-col gap-2">
                    {isCompleted ? (
                      <>
                        {course.certificateEnabled && (
                          <button
                            onClick={() => router.push(`/certificates/${course._id}`)}
                            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                            View Certificate
                          </button>
                        )}
                        <button
                          onClick={() => router.push(learnUrl)}
                          className="w-full py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                          Review Course
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => router.push(learnUrl)}
                        className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
                      >
                        {pct > 0 ? (
                          <>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            Continue Learning
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Start Course
                          </>
                        )}
                      </button>
                    )}
                    {/* Forum shortcut */}
                    <button
                      onClick={() => router.push(`/courses/${course._id}/forum`)}
                      className="w-full py-1.5 border border-gray-100 text-gray-400 rounded-xl text-xs font-medium hover:bg-gray-50 hover:text-gray-600 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      Course Forum
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
