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

// ─── Edit Quiz Modal ──────────────────────────────────────────────────────────

function EditQuizModal({ quiz, onClose }: { quiz: QuizSummary; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(quiz.title);
  const [courseId, setCourseId] = useState(
    typeof quiz.courseId === 'object' && quiz.courseId ? quiz.courseId._id : ''
  );
  const [error, setError] = useState('');

  const { data: courses = [] } = useQuery<Course[]>({
    queryKey: ['courses-dropdown'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=100');
      return data.data.courses;
    },
  });

  const mutation = useMutation({
    mutationFn: () => api.patch(`/quizzes/${quiz._id}`, {
      title: title.trim(),
      courseId: courseId ? String(courseId) : null,
    }),
    onSuccess: (res) => {
      const updated: QuizSummary = res.data.data.quiz;
      // Patch the cache entry directly so it reflects immediately
      qc.setQueryData(['quizzes'], (old: { quizzes: QuizSummary[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          quizzes: old.quizzes.map((q) => q._id === updated._id ? { ...q, ...updated } : q),
        };
      });
      qc.invalidateQueries({ queryKey: ['quizzes'] });
      onClose();
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to update quiz'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Edit Quiz</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Course <span className="text-gray-400 font-normal text-xs">(link or change)</span>
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">— No course —</option>
              {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
            </select>
            {courseId && (
              <button
                type="button"
                onClick={() => setCourseId('')}
                className="mt-1 text-xs text-red-500 hover:text-red-600"
              >
                × Remove course link
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={!title.trim()} onClick={() => mutation.mutate()}>
            Save Changes
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
  const [editingQuiz, setEditingQuiz] = useState<QuizSummary | null>(null);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Quizzes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Quiz
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : quizzes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-center">
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                    className="hover:bg-gray-50 transition-colors group"
                  >
                    {/* Title — clickable to open quiz builder */}
                    <td
                      className="px-5 py-3.5 font-medium text-gray-900 cursor-pointer"
                      onClick={() => router.push(`/quizzes/${quiz._id}`)}
                    >
                      {quiz.title}
                    </td>

                    {/* Course column */}
                    <td className="px-5 py-3.5">
                      {courseName ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-primary-700 bg-primary-50 border border-primary-100 px-2 py-1 rounded-lg font-medium">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
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

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setEditingQuiz(quiz); }}
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
      )}

      {showCreate && (
        <CreateQuizModal
          onClose={() => setShowCreate(false)}
          prefillLessonId={lessonIdParam ?? undefined}
          prefillCourseId={courseIdParam ?? undefined}
        />
      )}

      {editingQuiz && (
        <EditQuizModal
          quiz={editingQuiz}
          onClose={() => setEditingQuiz(null)}
        />
      )}
    </div>
  );
}
