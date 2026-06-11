'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

interface ActivityEvent {
  type: 'lesson_completed' | 'lesson_viewed' | 'quiz_passed' | 'quiz_attempted';
  title: string;
  lessonType?: string;
  courseTitle?: string;
  courseId?: string;
  watchedSeconds?: number;
  score?: number;
  passed?: boolean;
  status?: string;
  date: string;
}

interface ActivityData {
  events: ActivityEvent[];
  totalCount: number;
  totalWatchSeconds: number;
  page: number;
  pages: number;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSeconds(s: number) {
  if (!s) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

const EVENT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  lesson_completed: {
    label: 'Lesson Completed',
    color: 'text-emerald-700',
    bg: 'bg-emerald-100',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  lesson_viewed: {
    label: 'Lesson Viewed',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  quiz_passed: {
    label: 'Quiz Passed',
    color: 'text-purple-700',
    bg: 'bg-purple-100',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
  quiz_attempted: {
    label: 'Quiz Attempted',
    color: 'text-orange-700',
    bg: 'bg-orange-100',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
};

const LESSON_TYPE_ICON: Record<string, string> = {
  video: '▶', audio: '🎵', text: '📄', file: '📎', live: '📡', quiz: '📝',
};

export default function ActivityPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery<ActivityData>({
    queryKey: ['my-activity', page],
    queryFn: async () => {
      const { data } = await api.get(`/dashboard/my-activity?page=${page}&limit=20`);
      return data.data;
    },
    staleTime: 30000,
  });

  const totalWatchTime = fmtSeconds(data?.totalWatchSeconds ?? 0);

  return (
    <div className="max-w-3xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => router.back()}
              className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
          </div>
          <p className="text-sm text-gray-500">Your complete learning history and progress</p>
        </div>
        <button onClick={() => router.push('/my-learning')}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          My Learning →
        </button>
      </div>

      {/* ── Stats row ── */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: 'Total Activities',
              value: data.totalCount,
              icon: '📋',
              color: 'bg-blue-50 border-blue-100',
              text: 'text-blue-700',
            },
            {
              label: 'Lessons Completed',
              value: data.events.filter(e => e.type === 'lesson_completed').length,
              icon: '✅',
              color: 'bg-emerald-50 border-emerald-100',
              text: 'text-emerald-700',
            },
            {
              label: 'Total Watch Time',
              value: totalWatchTime ?? '0m',
              icon: '⏱',
              color: 'bg-purple-50 border-purple-100',
              text: 'text-purple-700',
            },
          ].map(({ label, value, icon, color, text }) => (
            <div key={label} className={cn('rounded-2xl border p-4', color)}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{icon}</span>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
              </div>
              <p className={cn('text-2xl font-bold', text)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest">Timeline</h2>
          {data && data.totalCount > 0 && (
            <span className="text-xs text-gray-400">{data.totalCount} events total</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">⚠️</span>
            <p className="text-sm font-semibold text-red-600">Failed to load activity</p>
            <p className="text-xs text-gray-400 mt-1">Please refresh the page and try again</p>
          </div>
        ) : !data?.events.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">📭</span>
            <p className="text-gray-600 font-semibold">No activity yet</p>
            <p className="text-gray-400 text-sm mt-1">Start learning to see your activity here</p>
            <button onClick={() => router.push('/courses')}
              className="mt-4 px-5 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">
              Browse Courses
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.events.map((event, i) => {
              const cfg = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.lesson_viewed;
              return (
                <div key={i} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
                  {/* Icon */}
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg, cfg.color)}>
                    {cfg.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-xs font-bold uppercase tracking-wide', cfg.color)}>
                            {cfg.label}
                          </span>
                          {event.lessonType && (
                            <span className="text-xs text-gray-400">
                              {LESSON_TYPE_ICON[event.lessonType] ?? '📄'} {event.lessonType}
                            </span>
                          )}
                          {event.score !== undefined && (
                            <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', event.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                              {event.score}% {event.passed ? '✓' : '✗'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{event.title}</p>
                        {event.courseTitle && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            in <span className="text-gray-600">{event.courseTitle}</span>
                          </p>
                        )}
                        {event.watchedSeconds !== undefined && event.watchedSeconds > 0 && (
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {fmtSeconds(event.watchedSeconds)} watched
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{timeAgo(event.date)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            <span className="text-xs text-gray-500">Page {page} of {data.pages}</span>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
