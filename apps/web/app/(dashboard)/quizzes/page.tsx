'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';
import { formatDate } from '@/lib/utils';

interface QuizSummary {
  _id: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
  totalQuestions: number;
  totalPoints: number;
  attemptCount: number;
  settings: { passingScore: number; maxAttempts: number };
  courseId?: { _id: string; title: string } | null;
  createdAt: string;
}

interface Course { _id: string; title: string; }

const STATUS_BADGE: Record<string, 'default' | 'success' | 'danger'> = {
  draft: 'default', published: 'success', archived: 'danger',
};

// ─── Create Quiz Modal ────────────────────────────────────────────────────────

interface CreateQuizModalProps {
  onClose: () => void;
  prefillLessonId?: string;
  prefillCourseId?: string;
}

function CreateQuizModal({ onClose, prefillLessonId, prefillCourseId }: CreateQuizModalProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [passingScore, setPassingScore] = useState(70);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [courseId, setCourseId] = useState(prefillCourseId ?? '');
  const [error, setError] = useState('');

  const { data: courses = [] } = useQuery<Course[]>({
    queryKey: ['courses-dropdown'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=100');
      return data.data.courses;
    },
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/quizzes', {
      title: title.trim(),
      courseId: courseId || null,
      lessonId: prefillLessonId || null,
      passingScore,
      maxAttempts,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['quizzes'] });
      router.push(`/quizzes/${res.data.data.quiz._id}`);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Failed to create quiz');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Create Quiz</h2>
        {prefillLessonId && (
          <p className="text-xs text-primary-600 bg-primary-50 rounded-lg px-3 py-1.5 mb-3 font-medium">
            ✓ This quiz will be automatically linked to your lesson
          </p>
        )}
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) mutation.mutate(); }}
              placeholder="e.g. Module 1 Quiz"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Course {prefillCourseId ? '(pre-selected)' : '(optional)'}
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">— None —</option>
              {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passing score (%)</label>
              <input type="number" min={0} max={100} value={passingScore}
                onChange={(e) => setPassingScore(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max attempts</label>
              <input type="number" min={1} value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={!title.trim()} onClick={() => mutation.mutate()}>
            Create & Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuizzesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);

  const lessonIdParam = searchParams.get('lessonId');
  const courseIdParam = searchParams.get('courseId');

  useEffect(() => {
    if (lessonIdParam) setShowCreate(true);
  }, [lessonIdParam]);

  const { data, isLoading } = useQuery<{ quizzes: QuizSummary[] }>({
    queryKey: ['quizzes'],
    queryFn: async () => {
      const { data } = await api.get('/quizzes?limit=100');
      return data.data;
    },
  });

  const quizzes = data?.quizzes ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Quizzes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Quiz
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : quizzes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium">No quizzes yet</p>
          <p className="text-gray-500 text-sm mt-1">Create your first quiz to get started.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>Create Quiz</Button>
        </div>
      ) : (
        <>
          {/* ── Mobile card list (hidden on sm+) ── */}
          <div className="sm:hidden space-y-3">
            {quizzes.map(quiz => {
              const courseName = typeof quiz.courseId === 'object' && quiz.courseId
                ? quiz.courseId.title : null;
              return (
                <div
                  key={quiz._id}
                  className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 active:bg-gray-50"
                  onClick={() => router.push(`/quizzes/${quiz._id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 text-sm leading-snug">{quiz.title}</p>
                    <Badge variant={STATUS_BADGE[quiz.status] ?? 'default'} className="flex-shrink-0">
                      {quiz.status}
                    </Badge>
                  </div>
                  {courseName && (
                    <p className="text-xs text-primary-700 bg-primary-50 border border-primary-100 rounded-lg px-2 py-1 inline-block font-medium">
                      {courseName}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                    <span>{quiz.totalQuestions} questions</span>
                    <span>{quiz.settings?.passingScore ?? 70}% to pass</span>
                    <span>{quiz.attemptCount} attempts</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (hidden below sm) ── */}
          <div className="hidden sm:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Title</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Course</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Questions</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Passing</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Attempts</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {quizzes.map(quiz => {
                    const courseName = typeof quiz.courseId === 'object' && quiz.courseId
                      ? quiz.courseId.title
                      : null;

                    return (
                      <tr
                        key={quiz._id}
                        className="hover:bg-gray-50 transition-colors group cursor-pointer"
                        onClick={() => router.push(`/quizzes/${quiz._id}`)}
                      >
                        <td className="px-5 py-3.5 font-medium text-gray-900">{quiz.title}</td>
                        <td className="px-5 py-3.5">
                          {courseName ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-primary-700 bg-primary-50 border border-primary-100 px-2 py-1 rounded-lg font-medium">
                              {courseName}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">No course</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={STATUS_BADGE[quiz.status] ?? 'default'}>{quiz.status}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">{quiz.totalQuestions}</td>
                        <td className="px-5 py-3.5 text-gray-600">{quiz.settings?.passingScore ?? 70}%</td>
                        <td className="px-5 py-3.5 text-gray-600">{quiz.attemptCount}</td>
                        <td className="px-5 py-3.5 text-gray-500">{formatDate(quiz.createdAt)}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); router.push(`/quizzes/${quiz._id}`); }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); router.push(`/quizzes/${quiz._id}`); }}
                            >
                              Open →
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showCreate && (
        <CreateQuizModal
          onClose={() => setShowCreate(false)}
          prefillLessonId={lessonIdParam ?? undefined}
          prefillCourseId={courseIdParam ?? undefined}
        />
      )}
    </div>
  );
}
