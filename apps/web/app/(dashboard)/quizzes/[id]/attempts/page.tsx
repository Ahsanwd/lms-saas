'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';

// ── Types ─────────────────────────────────────────────────────────────────────
interface User { _id: string; firstName: string; lastName: string; email: string; avatar: string | null; }

interface Answer {
  _id: string;
  questionId: string;
  questionType: string;
  textAnswer: string | null;
  selectedOptionId: string | null;
  selectedOptionIds: string[];
  isCorrect: boolean | null;
  pointsAwarded: number;
  maxPoints: number;
  feedback: string | null;
}

interface Attempt {
  _id: string;
  userId: User;
  attemptNumber: number;
  status: 'in_progress' | 'submitted' | 'auto_graded' | 'manually_graded' | 'pending_manual';
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  answers: Answer[];
  submittedAt: string | null;
  gradedAt: string | null;
}

interface QuizQuestion {
  questionId: { _id: string; text: string; type: string; options: { _id: string; text: string; isCorrect: boolean }[]; points: number };
  points: number | null;
}

interface Quiz { _id: string; title: string; questions: QuizQuestion[]; settings: { passingScore: number } }

const STATUS_BADGE: Record<string, 'default' | 'success' | 'danger' | 'warning'> = {
  auto_graded: 'success',
  manually_graded: 'success',
  pending_manual: 'warning',
  submitted: 'default',
  in_progress: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  auto_graded: 'Graded',
  manually_graded: 'Graded',
  pending_manual: 'Needs Grading',
  submitted: 'Submitted',
  in_progress: 'In Progress',
};

// ── Grading Panel ─────────────────────────────────────────────────────────────
function GradingPanel({
  attempt, quiz, onClose,
}: {
  attempt: Attempt;
  quiz: Quiz;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const isPending = attempt.status === 'pending_manual';

  // Build grade state for short-answer answers only
  const shortAnswers = attempt.answers.filter(a =>
    a.questionType === 'short_answer' || a.questionType === 'essay'
  );

  const [grades, setGrades] = useState<Record<string, { pointsAwarded: string; feedback: string }>>(
    () => Object.fromEntries(shortAnswers.map(a => [
      a.questionId,
      { pointsAwarded: String(a.pointsAwarded ?? 0), feedback: a.feedback ?? '' },
    ]))
  );
  const [error, setError] = useState('');

  const gradeMutation = useMutation({
    mutationFn: () => api.patch(`/quizzes/${id}/attempts/${attempt._id}/grade`, {
      grades: shortAnswers.map(a => ({
        questionId: a.questionId,
        // Clamp client-side too — the server also enforces this, but this
        // avoids a confusing round-trip error for an obvious typo.
        pointsAwarded: Math.max(0, Math.min(Number(grades[a.questionId]?.pointsAwarded ?? 0) || 0, a.maxPoints)),
        feedback: grades[a.questionId]?.feedback?.trim() || null,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz-attempts', id] });
      onClose();
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Grading failed'),
  });

  // Build a lookup map: questionId → question
  const questionMap = new Map(
    quiz.questions.map(q => [q.questionId._id, q.questionId])
  );

  const fullName = (u: User) => `${u.firstName} ${u.lastName}`;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Panel header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">
              {isPending ? 'Grade Attempt' : 'Attempt Detail'}
            </p>
            <p className="font-semibold text-gray-900">{fullName(attempt.userId)}</p>
            <p className="text-sm text-gray-500">{attempt.userId.email}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <Badge variant={STATUS_BADGE[attempt.status] ?? 'default'}>
              {STATUS_LABEL[attempt.status] ?? attempt.status}
            </Badge>
            {attempt.status !== 'pending_manual' && (
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {attempt.percentage}% {attempt.passed ? '✓ Pass' : '✗ Fail'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && <Alert variant="error">{error}</Alert>}

          {attempt.answers.map((answer, idx) => {
            const question = questionMap.get(answer.questionId);
            const isShortAnswer = answer.questionType === 'short_answer' || answer.questionType === 'essay';
            const gradeState = grades[answer.questionId];

            return (
              <div key={answer._id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                {/* Question text */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    <span className="text-gray-400 mr-1.5">Q{idx + 1}.</span>
                    {question?.text ?? `Question ${idx + 1}`}
                  </p>
                  <span className="text-xs text-gray-400 flex-shrink-0">{answer.maxPoints} pt{answer.maxPoints !== 1 ? 's' : ''}</span>
                </div>

                {/* Student answer */}
                {isShortAnswer ? (
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700">
                    {answer.textAnswer || <span className="text-gray-400 italic">No answer</span>}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    {answer.isCorrect === true && (
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Correct — {answer.pointsAwarded}/{answer.maxPoints} pts
                      </span>
                    )}
                    {answer.isCorrect === false && (
                      <span className="text-red-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Incorrect — {answer.pointsAwarded}/{answer.maxPoints} pts
                      </span>
                    )}
                    {answer.isCorrect === null && (
                      <span className="text-gray-500">Not graded</span>
                    )}
                  </div>
                )}

                {/* Grading inputs for short answer */}
                {isShortAnswer && (
                  <div className="space-y-2 pt-1 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-medium text-gray-600 w-24 flex-shrink-0">
                        Points (max {answer.maxPoints})
                      </label>
                      {isPending ? (
                        <input
                          type="number"
                          min={0}
                          max={answer.maxPoints}
                          value={gradeState?.pointsAwarded ?? '0'}
                          onChange={e => setGrades(prev => ({
                            ...prev,
                            [answer.questionId]: { ...prev[answer.questionId], pointsAwarded: e.target.value },
                          }))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      ) : (
                        <span className="text-sm font-medium text-gray-900">
                          {answer.pointsAwarded} / {answer.maxPoints}
                        </span>
                      )}
                    </div>
                    <div className="flex items-start gap-3">
                      <label className="text-xs font-medium text-gray-600 w-24 flex-shrink-0 mt-1.5">Feedback</label>
                      {isPending ? (
                        <textarea
                          rows={2}
                          placeholder="Optional feedback for student…"
                          value={gradeState?.feedback ?? ''}
                          onChange={e => setGrades(prev => ({
                            ...prev,
                            [answer.questionId]: { ...prev[answer.questionId], feedback: e.target.value },
                          }))}
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                        />
                      ) : (
                        <span className="text-sm text-gray-600">{answer.feedback || <span className="italic text-gray-400">No feedback</span>}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {isPending && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button loading={gradeMutation.isPending} onClick={() => gradeMutation.mutate()}>
              Submit Grade
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type TabKey = 'all' | 'pending_manual' | 'auto_graded' | 'manually_graded';

export default function QuizAttemptsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const isManager = user?.role === 'tenant_admin' || user?.role === 'instructor' || user?.role === 'super_admin';
  const [tab, setTab] = useState<TabKey>('all');
  const [selected, setSelected] = useState<Attempt | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const statusParam = tab === 'all' ? '' : tab;

  const { data, isLoading } = useQuery<{ attempts: Attempt[]; total: number; quiz: { title: string } }>({
    queryKey: ['quiz-attempts', id, tab, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
      if (statusParam) params.set('status', statusParam);
      const { data } = await api.get(`/quizzes/${id}/attempts?${params}`);
      return data.data;
    },
    enabled: isManager,
  });

  const { data: quizData } = useQuery<{ quiz: Quiz }>({
    queryKey: ['quiz', id],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${id}`);
      return data.data;
    },
  });

  const quiz = quizData?.quiz;
  const attempts = data?.attempts ?? [];

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending_manual', label: 'Needs Grading' },
    { key: 'auto_graded', label: 'Auto Graded' },
    { key: 'manually_graded', label: 'Manually Graded' },
  ];

  const fullName = (u: User) => `${u.firstName} ${u.lastName}`;

  if (!isManager) {
    return (
      <div className="max-w-4xl p-6 text-center">
        <p className="text-gray-500">You don't have access to this page.</p>
        <Button className="mt-4" onClick={() => router.push('/quizzes')}>Back to Quizzes</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(`/quizzes/${id}`)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {quiz?.title ?? 'Quiz'} — Attempts
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} total attempts</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : attempts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-500 text-sm">No attempts found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">#</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Score</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Submitted</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {attempts.map(attempt => (
                <tr key={attempt._id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{fullName(attempt.userId)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{attempt.userId.email}</p>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">#{attempt.attemptNumber}</td>
                  <td className="px-5 py-3.5">
                    {attempt.status === 'pending_manual' ? (
                      <span className="text-gray-400 text-xs">Pending</span>
                    ) : (
                      <span className={`font-medium ${attempt.passed ? 'text-green-600' : 'text-red-600'}`}>
                        {attempt.percentage}%
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={STATUS_BADGE[attempt.status] ?? 'default'}>
                      {STATUS_LABEL[attempt.status] ?? attempt.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {attempt.submittedAt ? formatDate(attempt.submittedAt) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      size="sm"
                      variant={attempt.status === 'pending_manual' ? undefined : 'outline'}
                      onClick={() => setSelected(attempt)}
                    >
                      {attempt.status === 'pending_manual' ? 'Grade' : 'View'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && (data?.total ?? 0) > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.total ?? 0)} of {data?.total} attempts
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page * PAGE_SIZE >= (data?.total ?? 0)}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Grading panel */}
      {selected && quiz && (
        <GradingPanel
          attempt={selected}
          quiz={quiz}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
