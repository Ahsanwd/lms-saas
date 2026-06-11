'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { useAuthStore } from '@/stores/auth.store';

interface CourseResult {
  _id: string;
  title: string;
  thumbnail?: string;
  price: number;
  isFree: boolean;
  enrollmentCount: number;
  level: string;
  status: string;
}

interface UserResult {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'student' | 'instructor';
  avatar?: string;
}

interface QuizResult {
  _id: string;
  title: string;
  description?: string;
  courseId?: { _id: string; title: string };
  questionCount?: number;
  timeLimit?: number;
  status: string;
}

interface AssignmentResult {
  _id: string;
  title: string;
  description?: string;
  courseId?: { _id: string; title: string };
  dueDate?: string;
  status: string;
}

interface SearchData {
  courses: CourseResult[];
  users: UserResult[];
  quizzes: QuizResult[];
  assignments: AssignmentResult[];
}

function fmt$(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
      {label} ({count})
    </p>
  );
}

export default function SearchPage() {
  const router   = useRouter();
  const user     = useAuthStore(s => s.user);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') router.back();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useQuery<SearchData>({
    queryKey: ['search', debouncedQ],
    queryFn: async () => {
      if (debouncedQ.trim().length < 2) return { courses: [], users: [], quizzes: [], assignments: [] };
      const res = await api.get('/search', { params: { q: debouncedQ, limit: 10 } });
      return res.data.data as SearchData;
    },
    enabled: debouncedQ.trim().length >= 2,
    staleTime: 30_000,
  });

  const courses     = data?.courses     ?? [];
  const users       = data?.users       ?? [];
  const quizzes     = data?.quizzes     ?? [];
  const assignments = data?.assignments ?? [];

  const hasResults = courses.length > 0 || users.length > 0 || quizzes.length > 0 || assignments.length > 0;
  const showEmpty  = debouncedQ.trim().length >= 2 && !isFetching && !hasResults;

  const isAdmin     = user?.role === 'tenant_admin';
  const canSeeUsers = isAdmin || user?.role === 'instructor';
  const canSeeQuizzesAssignments = isAdmin || user?.role === 'instructor' || user?.role === 'student';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Search bar */}
        <div className="relative">
          <div
            role="search"
            className="flex items-center gap-3 bg-white border border-gray-300 rounded-xl px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-shadow"
          >
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search courses, quizzes, assignments…"
              aria-label="Search"
              aria-controls="search-results"
              className="flex-1 text-base bg-transparent focus:outline-none text-gray-900 placeholder-gray-400"
            />
            {isFetching && <Spinner size="sm" />}
            {q && (
              <button
                onClick={() => setQ('')}
                aria-label="Clear search"
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1.5 text-right">Press Esc to go back</p>
        </div>

        {/* Empty hint */}
        {!q && (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-200" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-500">Start typing to search</p>
            <p className="text-xs text-gray-400 mt-1">Courses, quizzes, assignments, people</p>
          </div>
        )}

        {/* No results */}
        {showEmpty && (
          <div className="text-center py-10 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500 font-medium">No results for &ldquo;{debouncedQ}&rdquo;</p>
            <p className="text-sm text-gray-400 mt-1">Try a different search term</p>
          </div>
        )}

        <div id="search-results" aria-live="polite" aria-atomic="false" className="space-y-6">

          {/* Courses */}
          {courses.length > 0 && (
            <section aria-label="Courses">
              <SectionLabel label="Courses" count={courses.length} />
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {courses.map(c => (
                  <Link
                    key={c._id}
                    href={`/courses/${c._id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    {c.thumbnail ? (
                      <img src={c.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-primary-50 flex-shrink-0 flex items-center justify-center" aria-hidden="true">
                        <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {c.level} · {c.enrollmentCount} student{c.enrollmentCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {c.isFree ? <span className="text-green-600">Free</span> : fmt$(c.price * 100)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Quizzes */}
          {quizzes.length > 0 && canSeeQuizzesAssignments && (
            <section aria-label="Quizzes">
              <SectionLabel label="Quizzes" count={quizzes.length} />
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {quizzes.map(qz => (
                  <Link
                    key={qz._id}
                    href={`/quizzes/${qz._id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-50 flex-shrink-0 flex items-center justify-center" aria-hidden="true">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{qz.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {qz.courseId?.title ?? 'Standalone'}
                        {qz.questionCount != null && ` · ${qz.questionCount} questions`}
                        {qz.timeLimit != null && ` · ${qz.timeLimit} min`}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium flex-shrink-0">
                      Quiz
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Assignments */}
          {assignments.length > 0 && canSeeQuizzesAssignments && (
            <section aria-label="Assignments">
              <SectionLabel label="Assignments" count={assignments.length} />
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {assignments.map(a => (
                  <Link
                    key={a._id}
                    href={`/assignments/${a._id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex-shrink-0 flex items-center justify-center" aria-hidden="true">
                      <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {a.courseId?.title ?? 'No course'}
                        {a.dueDate && ` · Due ${fmtDate(a.dueDate)}`}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium flex-shrink-0">
                      Assignment
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Users (admins/instructors only) */}
          {users.length > 0 && canSeeUsers && (
            <section aria-label="People">
              <SectionLabel label="People" count={users.length} />
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {users.map(u => (
                  <div key={u._id} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className="w-9 h-9 rounded-full bg-primary-100 flex-shrink-0 flex items-center justify-center text-primary-700 text-xs font-bold uppercase"
                      aria-hidden="true"
                    >
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      u.role === 'instructor'
                        ? 'bg-purple-50 text-purple-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}>
                      {u.role}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
