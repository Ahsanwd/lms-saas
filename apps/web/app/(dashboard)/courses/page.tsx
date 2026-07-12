'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { AxiosError } from 'axios';
import { cn } from '@/lib/utils';
import type { Course } from '@/types';

const STATUS_BADGE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  draft: 'default', published: 'success', archived: 'danger',
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all: 'All Levels',
};

type ViewMode = 'grid' | 'list' | 'compact';

function ctaText(course: Course, enrolled: boolean): string {
  if (enrolled) return 'Continue Learning';
  if (course.ctaLabel?.trim()) return course.ctaLabel.trim();
  return course.isFree ? 'Enroll Free' : 'Enroll Now';
}

function fmtDuration(s: number) {
  if (!s) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const LEVEL_STYLES: Record<string, string> = {
  beginner:     'bg-emerald-500 text-white',
  intermediate: 'bg-amber-500 text-white',
  advanced:     'bg-red-500 text-white',
};

// ── Thumbnail placeholder ─────────────────────────────────────────────────────
function ThumbPlaceholder() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-blue-100 flex items-center justify-center">
      <svg className="w-14 h-14 text-primary-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    </div>
  );
}

// ── Grid Card ─────────────────────────────────────────────────────────────────
function GridCard({ course, enrolled, onEnroll, enrolling, onOpen, onLearn }: {
  course: Course; enrolled: boolean; onEnroll: () => void; enrolling: boolean;
  onOpen: () => void; onLearn: () => void;
}) {
  const dur = fmtDuration(course.totalDurationSeconds);
  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer"
      onClick={onOpen}
    >
      {/* Thumbnail */}
      <div className="relative h-44 overflow-hidden flex-shrink-0">
        {course.thumbnail
          ? <img src={course.thumbnail} alt={course.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <ThumbPlaceholder />
        }
        {/* Dark overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2 flex items-center gap-2 shadow-lg">
            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            <span className="text-xs font-bold text-gray-800">View Course</span>
          </div>
        </div>
        {/* Level badge */}
        {course.level && (
          <span className={cn('absolute top-3 left-3 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm', LEVEL_STYLES[course.level] ?? 'bg-gray-600 text-white')}>
            {LEVEL_LABEL[course.level] ?? course.level}
          </span>
        )}
        {/* Price badge */}
        <span className={cn('absolute top-3 right-3 text-xs font-extrabold px-2.5 py-1 rounded-full shadow-sm', course.isFree ? 'bg-emerald-500 text-white' : 'bg-gray-900/80 text-white backdrop-blur-sm')}>
          {course.isFree ? 'FREE' : `$${course.price}`}
        </span>
        {/* Enrolled ribbon */}
        {enrolled && (
          <div className="absolute bottom-0 left-0 right-0 bg-primary-600/90 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            <span className="text-white text-[11px] font-bold">Enrolled</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-gray-900 text-sm leading-snug mb-1.5 line-clamp-2 group-hover:text-primary-600 transition-colors">
          {course.title}
        </h3>
        <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{stripHtml(course.description ?? '')}</p>

        {/* Tags */}
        {course.tags && course.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {course.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] bg-primary-50 text-primary-600 border border-primary-100 px-2 py-0.5 rounded-full font-medium">{tag}</span>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-auto mb-4 pt-3 border-t border-gray-50">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253"/></svg>
            {course.totalLessons} lessons
          </span>
          <span className="text-gray-200">|</span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            {course.enrollmentCount} students
          </span>
          {dur && (
            <>
              <span className="text-gray-200">|</span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {dur}
              </span>
            </>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={(e) => { e.stopPropagation(); enrolled ? onLearn() : onEnroll(); }}
          disabled={enrolling}
          className={cn('w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2',
            enrolled
              ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow-primary-200 hover:shadow-md'
              : course.isFree
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                : 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm'
          )}
        >
          {enrolling ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          ) : enrolled ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          ) : null}
          {enrolling ? 'Enrolling…' : ctaText(course, enrolled)}
        </button>
      </div>
    </div>
  );
}

// ── List Card ─────────────────────────────────────────────────────────────────
function ListCard({ course, enrolled, onEnroll, enrolling, onOpen, onLearn }: {
  course: Course; enrolled: boolean; onEnroll: () => void; enrolling: boolean;
  onOpen: () => void; onLearn: () => void;
}) {
  const dur = fmtDuration(course.totalDurationSeconds);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group cursor-pointer" onClick={onOpen}>
      {/* Thumbnail */}
      <div className="relative w-52 flex-shrink-0 overflow-hidden">
        {course.thumbnail
          ? <img src={course.thumbnail} alt={course.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
          : <ThumbPlaceholder />
        }
        {course.level && (
          <span className={cn('absolute top-3 left-3 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', LEVEL_STYLES[course.level] ?? 'bg-gray-600 text-white')}>
            {LEVEL_LABEL[course.level]}
          </span>
        )}
        {enrolled && (
          <div className="absolute bottom-0 inset-x-0 bg-primary-600/90 py-1 flex items-center justify-center gap-1">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
            <span className="text-white text-[10px] font-bold">Enrolled</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-5 flex flex-col justify-between min-w-0">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {course.tags?.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] bg-primary-50 text-primary-600 border border-primary-100 px-2 py-0.5 rounded-full font-medium">{tag}</span>
            ))}
          </div>
          <h3 className="font-bold text-gray-900 text-base leading-snug mb-1.5 line-clamp-1 group-hover:text-primary-600 transition-colors">
            {course.title}
          </h3>
          <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">{stripHtml(course.description ?? '')}</p>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap mt-4 pt-3 border-t border-gray-50">
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>{course.totalLessons} lessons</span>
            <span>·</span>
            <span>{course.enrollmentCount} students</span>
            {dur && <><span>·</span><span>{dur}</span></>}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={cn('text-sm font-extrabold', course.isFree ? 'text-emerald-600' : 'text-gray-900')}>
              {course.isFree ? 'Free' : `$${course.price}`}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); enrolled ? onLearn() : onEnroll(); }}
              disabled={enrolling}
              className={cn('px-5 py-2 rounded-xl text-xs font-bold transition-all',
                enrolled ? 'bg-primary-600 text-white hover:bg-primary-700' : course.isFree ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-900 text-white hover:bg-gray-800'
              )}
            >
              {enrolling ? '…' : ctaText(course, enrolled)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compact Card ──────────────────────────────────────────────────────────────
function CompactCard({ course, enrolled, onEnroll, enrolling, onOpen, onLearn }: {
  course: Course; enrolled: boolean; onEnroll: () => void; enrolling: boolean;
  onOpen: () => void; onLearn: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3.5 flex items-center gap-4 hover:shadow-md hover:border-gray-200 transition-all group cursor-pointer" onClick={onOpen}>
      <div className="relative w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden">
        {course.thumbnail
          ? <img src={course.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover"/>
          : <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-blue-100 flex items-center justify-center"><svg className="w-6 h-6 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253"/></svg></div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-semibold text-gray-900 text-sm truncate group-hover:text-primary-600 transition-colors">{course.title}</h3>
          {enrolled && <span className="flex-shrink-0 w-4 h-4 bg-primary-100 rounded-full flex items-center justify-center"><svg className="w-2.5 h-2.5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg></span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {course.level && <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', LEVEL_STYLES[course.level] ?? 'bg-gray-100 text-gray-500')}>{LEVEL_LABEL[course.level]}</span>}
          <span>·</span><span>{course.totalLessons} lessons</span>
          <span>·</span><span>{course.enrollmentCount} students</span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={cn('text-sm font-extrabold', course.isFree ? 'text-emerald-600' : 'text-gray-900')}>
          {course.isFree ? 'Free' : `$${course.price}`}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); enrolled ? onLearn() : onEnroll(); }}
          disabled={enrolling}
          className={cn('px-4 py-1.5 rounded-lg text-xs font-bold transition-all',
            enrolled ? 'bg-primary-600 text-white hover:bg-primary-700' : course.isFree ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-900 text-white hover:bg-gray-800'
          )}
        >
          {enrolling ? '…' : enrolled ? 'Continue' : course.isFree ? 'Enroll Free' : 'Enroll'}
        </button>
      </div>
    </div>
  );
}

// ── View Toggle ───────────────────────────────────────────────────────────────
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {([
        { mode: 'grid', icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        ), label: 'Grid' },
        { mode: 'list', icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        ), label: 'List' },
        { mode: 'compact', icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ), label: 'Compact' },
      ] as { mode: ViewMode; icon: React.ReactNode; label: string }[]).map(item => (
        <button
          key={item.mode}
          title={item.label}
          onClick={() => onChange(item.mode)}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            mode === item.mode ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
          )}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}

// ── Student Catalog ───────────────────────────────────────────────────────────
function StudentCatalog() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['courses', search, levelFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (levelFilter) params.set('level', levelFilter);
      const { data } = await api.get(`/courses?${params}`);
      return data.data as { courses: Course[]; pagination: { total: number } };
    },
    staleTime: 30000,
  });

  const { data: enrollmentsData } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: async () => {
      const { data } = await api.get('/courses/my-enrollments');
      return data.data.enrollments as Array<{ _id: string; courseId: { _id: string } }>;
    },
    staleTime: 30000,
  });

  const enrolledIds = new Set(enrollmentsData?.map((e) => e.courseId?._id).filter(Boolean) ?? []);

  const enrollMutation = useMutation({
    mutationFn: (courseId: string) => api.post(`/courses/${courseId}/enroll`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-enrollments'] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      setEnrollingId(null);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setEnrollError(err.response?.data?.message ?? 'Failed to enroll');
      setEnrollingId(null);
      setTimeout(() => setEnrollError(''), 4000);
    },
  });

  function handleEnroll(courseId: string) {
    setEnrollingId(courseId);
    enrollMutation.mutate(courseId);
  }

  function openCourse(courseId: string) {
    router.push(`/courses/${courseId}`);
  }

  const courses = coursesData?.courses ?? [];

  const total = coursesData?.pagination?.total ?? 0;
  const enrolledCount = enrolledIds.size;

  return (
    <div className="p-6 space-y-6">

      {/* ── Hero header ── */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-primary-600 via-primary-700 to-blue-700 px-8 py-8 shadow-lg">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Course Catalog</h1>
            <p className="text-primary-200 mt-1 text-sm">
              {total} course{total !== 1 ? 's' : ''} available
              {enrolledCount > 0 && <span className="ml-2 text-primary-300">· {enrolledCount} enrolled</span>}
            </p>
          </div>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {/* Search bar inside hero */}
        <div className="relative mt-5 flex gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              placeholder="Search courses, topics, instructors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 text-sm bg-white/95 backdrop-blur-sm rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg placeholder-gray-400 font-medium"
            />
          </div>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-4 py-3 text-sm bg-white/95 backdrop-blur-sm rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg font-medium text-gray-700 min-w-[140px]"
          >
            <option value="">All Levels</option>
            <option value="beginner">🟢 Beginner</option>
            <option value="intermediate">🟡 Intermediate</option>
            <option value="advanced">🔴 Advanced</option>
          </select>
        </div>
      </div>

      {enrollError && <Alert variant="error">{enrollError}</Alert>}

      {/* ── Quick filter pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 font-semibold">Filter:</span>
        {[
          { label: 'All Courses', value: '' },
          { label: '🟢 Beginner', value: 'beginner' },
          { label: '🟡 Intermediate', value: 'intermediate' },
          { label: '🔴 Advanced', value: 'advanced' },
        ].map(f => (
          <button key={f.value} onClick={() => setLevelFilter(f.value)}
            className={cn('px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all',
              levelFilter === f.value
                ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-600')}>
            {f.label}
          </button>
        ))}
        {search && (
          <button onClick={() => setSearch('')} className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            Clear search
          </button>
        )}
      </div>

      {/* ── Course list ── */}
      {isLoading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center py-20 text-center shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <p className="text-gray-900 font-bold text-base">No courses found</p>
          <p className="text-gray-500 text-sm mt-1">Try different keywords or remove filters.</p>
          <button onClick={() => { setSearch(''); setLevelFilter(''); }}
            className="mt-4 px-5 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">
            Clear Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map(course => (
            <GridCard key={course._id} course={course}
              enrolled={enrolledIds.has(course._id)}
              enrolling={enrollingId === course._id}
              onEnroll={() => handleEnroll(course._id)}
              onOpen={() => openCourse(course._id)}
              onLearn={() => router.push(`/courses/${course._id}/learn`)}
            />
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-4">
          {courses.map(course => (
            <ListCard key={course._id} course={course}
              enrolled={enrolledIds.has(course._id)}
              enrolling={enrollingId === course._id}
              onEnroll={() => handleEnroll(course._id)}
              onOpen={() => openCourse(course._id)}
              onLearn={() => router.push(`/courses/${course._id}/learn`)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {courses.map(course => (
            <CompactCard key={course._id} course={course}
              enrolled={enrolledIds.has(course._id)}
              enrolling={enrollingId === course._id}
              onEnroll={() => handleEnroll(course._id)}
              onOpen={() => openCourse(course._id)}
              onLearn={() => router.push(`/courses/${course._id}/learn`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Admin / Instructor Table View ─────────────────────────────────────────────
function ManagementTable() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['courses', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/courses?${params}`);
      return data.data as { courses: Course[]; pagination: { total: number; pages: number } };
    },
    staleTime: 30000,
  });

  const [deleteError, setDeleteError] = useState('');

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/${id}`),
    onSuccess: () => {
      setDeleteError('');
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setDeleteError(err.response?.data?.message ?? 'Failed to delete course');
      setTimeout(() => setDeleteError(''), 6000);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/courses/${id}/publish`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['courses'] }),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => api.post(`/courses/${id}/clone`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      router.push(`/courses/${res.data.data.course._id}`);
    },
  });

  const [scormTargetId, setScormTargetId] = useState<string | null>(null);
  const [scormSuccess, setScormSuccess] = useState('');
  const scormInputRef = useRef<HTMLInputElement>(null);

  const scormMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/courses/${id}/scorm-import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      const { sectionsCreated, lessonsCreated, note } = res.data.data;
      setScormSuccess(
        `Structure imported: ${sectionsCreated} sections, ${lessonsCreated} lessons added (left unpublished). ${note ?? ''}`
      );
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      setScormTargetId(null);
      setTimeout(() => setScormSuccess(''), 12000);
    },
  });

  const canManage = user?.role === 'tenant_admin' || user?.role === 'instructor';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.pagination?.total ?? 0} courses total</p>
        </div>
        {canManage && (
          <Button onClick={() => router.push('/courses/new')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Course
          </Button>
        )}
      </div>

      {scormSuccess && <Alert variant="warning">{scormSuccess}</Alert>}
      {deleteError && <Alert variant="error">{deleteError}</Alert>}

      {/* Hidden SCORM file picker — triggered per-row */}
      <input
        ref={scormInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && scormTargetId) scormMutation.mutate({ id: scormTargetId, file });
          e.target.value = '';
        }}
      />

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (data?.courses?.length ?? 0) === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-900 font-medium">No courses yet</p>
            <p className="text-gray-500 text-sm mt-1">Create your first course to get started.</p>
            {canManage && (
              <Button className="mt-4" onClick={() => router.push('/courses/new')}>Create Course</Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Course</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Level</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">CTA Label</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Students</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data!.courses.map((course) => (
                <tr
                  key={course._id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/courses/${course._id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {course.thumbnail ? (
                        <img src={course.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{course.title}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {course.isFree ? 'Free' : `$${course.price}`} · {course.totalLessons} lessons
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-500 text-sm">{LEVEL_LABEL[course.level] ?? course.level}</td>
                  <td className="px-4 py-4">
                    <Badge variant={STATUS_BADGE[course.status] ?? 'default'}>{course.status}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    {course.ctaLabel ? (
                      <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full border border-primary-100 font-medium">{course.ctaLabel}</span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Enroll Now</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-gray-500 text-sm">{course.enrollmentCount}</td>
                  {canManage && (
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        {course.status === 'draft' && (
                          <Button size="sm" variant="outline" loading={publishMutation.isPending}
                            onClick={() => publishMutation.mutate(course._id)}>
                            Publish
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => router.push(`/courses/${course._id}`)}>Edit</Button>
                        <Button size="sm" variant="outline"
                          loading={cloneMutation.isPending}
                          title="Duplicate this course as a draft"
                          onClick={() => cloneMutation.mutate(course._id)}>
                          Clone
                        </Button>
                        <Button size="sm" variant="outline"
                          loading={scormMutation.isPending && scormTargetId === course._id}
                          title="Import SCORM package into this course"
                          onClick={() => { setScormTargetId(course._id); setTimeout(() => scormInputRef.current?.click(), 50); }}>
                          SCORM
                        </Button>
                        <Button size="sm" variant="danger"
                          onClick={() => { if (confirm('Delete this course?')) deleteMutation.mutate(course._id); }}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page Entry Point ──────────────────────────────────────────────────────────
export default function CoursesPage() {
  const user = useAuthStore((s) => s.user);
  return user?.role === 'student' ? <StudentCatalog /> : <ManagementTable />;
}
