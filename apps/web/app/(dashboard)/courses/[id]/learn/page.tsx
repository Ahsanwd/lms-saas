'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import type { Course, Section, Lesson } from '@/types';
import { SmartContent } from '@/components/ui/SmartContent';

const SecurePdfViewer = dynamic(() => import('@/components/viewer/SecurePdfViewer'), { ssr: false });
const SecureDocViewer = dynamic(() => import('@/components/viewer/SecureDocViewer'), { ssr: false });

interface LessonProgress { lessonId: string; status: 'completed' | 'in_progress' }
interface CourseProgressData {
  courseProgress?: { percentage: number; completedLessons: number };
  lessonDetails: LessonProgress[];
}

interface CourseQuizSummary {
  _id: string; title: string; status: string;
  totalQuestions: number; lessonId: string | null;
  settings: { passingScore: number; maxAttempts: number };
}

const LESSON_ICON: Record<string, string> = {
  video: '▶', text: '📄', file: '📎', quiz: '📝', audio: '🎵', live: '📡',
};

// ── Sidebar ───────────────────────────────────────────────────────────────────
interface MyCohortBatchmate { firstName: string; lastName: string; avatar: string | null }
interface MyCohortData {
  cohort: { _id: string; name: string; description: string; startDate: string | null; endDate: string | null; status: string } | null;
  myProgress?: { percentage: number; completedLessons: number; totalLessons: number };
  batchmates?: MyCohortBatchmate[];
}

function formatCohortDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Renders nothing when the student isn't in a batch for this course — the
// common case for most students, same "return null when unconfigured"
// convention used across the Website Builder sections.
function MyCohortPanel({ courseId }: { courseId: string }) {
  const { data } = useQuery<MyCohortData>({
    queryKey: ['my-cohort', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/my-cohort`);
      return data.data;
    },
  });

  if (!data?.cohort) return null;
  const { cohort, batchmates = [] } = data;
  const dateRange = [formatCohortDate(cohort.startDate), formatCohortDate(cohort.endDate)].filter(Boolean).join(' – ');

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-violet-50/50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-violet-700 truncate">{cohort.name}</p>
        {dateRange && <span className="text-[10px] text-violet-500 flex-shrink-0">{dateRange}</span>}
      </div>
      {batchmates.length > 0 && (
        <div className="flex items-center -space-x-1.5 mt-1.5">
          {batchmates.slice(0, 6).map((m, i) => (
            <div key={i} title={`${m.firstName} ${m.lastName}`}
              className="w-5 h-5 rounded-full bg-violet-200 border border-white flex items-center justify-center text-[9px] font-semibold text-violet-700 overflow-hidden">
              {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : m.firstName[0]}
            </div>
          ))}
          {batchmates.length > 6 && (
            <span className="text-[10px] text-gray-400 pl-2">+{batchmates.length - 6} more</span>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  sections, activeLessonId, activeQuizId, completedIds,
  courseQuizzes, onSelect, onSelectQuiz, isOpen, onClose, courseId,
}: {
  sections: Section[];
  activeLessonId: string;
  activeQuizId: string;
  completedIds: Set<string>;
  courseQuizzes: CourseQuizSummary[];
  onSelect: (lesson: Lesson) => void;
  onSelectQuiz: (quiz: CourseQuizSummary) => void;
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
}) {
  const router = useRouter();
  const totalLessons = sections.flatMap(s => s.lessons ?? []).length;
  const doneCount = completedIds.size;
  const pct = totalLessons > 0 ? Math.round((doneCount / totalLessons) * 100) : 0;

  return (
    <>
      {/* Backdrop – mobile only, shown when sidebar drawer is open */}
      <div
        className={cn(
          'fixed inset-0 bg-black/40 z-40 lg:hidden transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={cn(
        'bg-white border-r border-gray-100 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out',
        'fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px]',
        'lg:relative lg:inset-auto lg:z-auto lg:w-72 lg:flex-shrink-0 lg:h-full lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Header with mini progress */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Course Content</p>
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close menu"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-medium text-gray-500 flex-shrink-0">{doneCount}/{totalLessons}</span>
          </div>
        </div>
        <MyCohortPanel courseId={courseId} />
        <nav className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <div key={section._id}>
            <div className="px-4 pt-3.5 pb-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">
                {section.title}
              </p>
            </div>
            {(section.lessons ?? []).map((lesson) => {
              const isActive = lesson._id === activeLessonId;
              const isDone = completedIds.has(lesson._id);
              const isDripped = !!lesson.dripLockedUntil;
              return (
                <button
                  key={lesson._id}
                  onClick={() => { if (!isDripped) { onSelect(lesson); onClose(); } }}
                  disabled={isDripped}
                  className={cn(
                    'w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-sm transition-colors border-l-2',
                    isDripped
                      ? 'opacity-50 cursor-not-allowed text-gray-400 border-transparent'
                      : isActive
                        ? 'bg-primary-50 text-primary-700 border-primary-500'
                        : 'text-gray-600 hover:bg-gray-50 border-transparent hover:border-gray-200'
                  )}
                >
                  {/* Status / lock circle */}
                  <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {isDripped ? (
                      <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                    ) : isDone ? (
                      <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                        <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    ) : isActive ? (
                      <span className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-primary-500" />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border-2 border-gray-200" />
                    )}
                  </span>
                  {/* Type icon */}
                  <span className="flex-shrink-0 text-xs">
                    {LESSON_ICON[lesson.type] ?? '📄'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={cn('block truncate leading-snug text-sm', isActive ? 'font-medium' : 'font-normal')}>
                      {lesson.title}
                    </span>
                    {isDripped && lesson.dripLockedUntil && (
                      <span className="block text-[10px] text-gray-400 mt-0.5">
                        Unlocks {new Date(lesson.dripLockedUntil).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {lesson.video?.durationSeconds ? (
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {Math.floor(lesson.video.durationSeconds / 60)}m
                    </span>
                  ) : lesson.audio?.durationSeconds ? (
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {Math.floor(lesson.audio.durationSeconds / 60)}m
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}

        {/* Course-level quizzes (not tied to any lesson) */}
        {courseQuizzes.length > 0 && (
          <div className="border-t border-gray-100 mt-1">
            <div className="px-4 pt-3.5 pb-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Quizzes</p>
            </div>
            {courseQuizzes.map((quiz) => {
              const isActive = quiz._id === activeQuizId;
              return (
                <button
                  key={quiz._id}
                  onClick={() => { onSelectQuiz(quiz); onClose(); }}
                  className={cn(
                    'w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-sm transition-colors border-l-2',
                    isActive
                      ? 'bg-primary-50 text-primary-700 border-primary-500'
                      : 'text-gray-600 hover:bg-gray-50 border-transparent hover:border-gray-200'
                  )}
                >
                  <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {isActive ? (
                      <span className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-primary-500" />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border-2 border-gray-200" />
                    )}
                  </span>
                  <span className="flex-shrink-0 text-xs">📝</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm', isActive ? 'font-medium' : 'font-normal')}>{quiz.title}</p>
                    <p className="text-[10px] text-gray-400">{quiz.totalQuestions} questions</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </nav>
      {/* Forum shortcut pinned at the very bottom of the sidebar */}
      <button
        onClick={() => router.push(`/courses/${courseId}/forum`)}
        className="flex items-center gap-2.5 px-4 py-3 border-t border-gray-100 text-sm text-gray-500 hover:text-primary-700 hover:bg-primary-50 transition-colors w-full text-left flex-shrink-0"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <span className="font-medium">Course Forum</span>
      </button>
    </aside>
    </>
  );
}

// ── Shared quiz interfaces ────────────────────────────────────────────────────
interface QuizOption { _id: string; text: string; }
interface QuizQuestion {
  _id: string; type: string; text: string;
  options: QuizOption[]; points: number;
  correctOrder?: string[];
  matchingPairs?: { left: string; right: string }[];
}
interface QuizData {
  _id: string; title: string; description: string | null; instructions: string | null;
  status: string; totalQuestions: number; totalPoints: number;
  settings: { passingScore: number; maxAttempts: number; allowRetake: boolean; timer: { enabled: boolean; durationMinutes: number } };
  questions: { questionId: QuizQuestion; points: number | null }[];
}
interface AttemptResult {
  _id: string; status: string; score: number; maxScore: number;
  percentage: number; passed: boolean; attemptNumber: number;
}

// ── Image option: shows <img> if src loads, broken-img icon on error ───────────
function ImageOptionDisplay({ src, inline = false }: { src: string; inline?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return inline ? (
      <span className="text-xs text-gray-400 italic">Image failed to load</span>
    ) : (
      <div className="flex flex-col items-center justify-center h-36 gap-1 text-gray-400">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src} alt=""
      className={inline ? 'h-20 w-auto rounded object-cover' : 'w-full h-36 object-cover'}
      onError={() => setFailed(true)}
    />
  );
}

// ── Shared quiz-taking UI (used by both QuizLesson and QuizById) ──────────────
function QuizUI({ quizId }: { quizId: string }) {
  const [phase, setPhase] = useState<'info' | 'taking' | 'result'>('info');
  const [attemptId, setAttemptId] = useState('');
  const [answers, setAnswers] = useState<Record<string, {
    selectedOptionId?: string;
    selectedOptionIds?: string[];
    textAnswer?: string;
    orderingAnswer?: string[];
    matchingAnswer?: { left: string; right: string }[];
  }>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [startError, setStartError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const { data: quizDetail, isLoading } = useQuery<QuizData>({
    queryKey: ['quiz', quizId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${quizId}`);
      return data.data.quiz;
    },
  });

  const { data: myAttempts = [] } = useQuery<AttemptResult[]>({
    queryKey: ['quiz-attempts', quizId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${quizId}/attempts/my`);
      return data.data.attempts;
    },
  });

  // Auto-init ordering answers when quiz starts
  useEffect(() => {
    if (phase !== 'taking' || !quizDetail) return;
    setAnswers(prev => {
      const updates: Record<string, any> = {};
      quizDetail.questions.forEach(({ questionId: q }) => {
        if (q.type === 'ordering' && q.correctOrder?.length && !(prev[q._id] as any)?.orderingAnswer) {
          updates[q._id] = { orderingAnswer: [...q.correctOrder] };
        }
      });
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [phase, quizDetail]);

  const startMutation = useMutation({
    mutationFn: () => api.post(`/quizzes/${quizId}/attempt`),
    onSuccess: (res) => {
      setAttemptId(res.data.data.attempt._id);
      setAnswers({});
      setStartError('');
      setPhase('taking');
    },
    onError: (err: import('axios').AxiosError<{ message: string }>) => {
      setStartError(err.response?.data?.message ?? 'Could not start quiz');
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const answerList = Object.entries(answers).map(([questionId, ans]) => ({ questionId, ...ans }));
      return api.post(`/quizzes/${quizId}/attempt/submit`, { attemptId, answers: answerList });
    },
    onSuccess: (res) => {
      setResult(res.data.data.attempt);
      setSubmitError('');
      setPhase('result');
    },
    onError: (err: import('axios').AxiosError<{ message: string }>) => {
      setSubmitError(err.response?.data?.message ?? 'Failed to submit quiz');
    },
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  if (!quizDetail) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-gray-500 font-medium">Quiz not available</p>
      </div>
    );
  }

  if (quizDetail.status !== 'published') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-gray-500 font-medium">Quiz not yet available</p>
        <p className="text-gray-400 text-sm mt-1">This quiz is still being prepared.</p>
      </div>
    );
  }

  // ── Result screen ──
  if (phase === 'result' && result) {
    const isPending = result.status === 'pending_manual';
    return (
      <div className="max-w-lg mx-auto py-8 space-y-6">
        {isPending ? (
          /* Pending manual grading — hide score entirely */
          <div className="rounded-xl p-8 text-center bg-amber-50 border border-amber-200 space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-amber-900">Quiz Submitted!</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Your quiz includes questions that need to be reviewed by your instructor.
              Your result will be available once grading is complete.
            </p>
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 text-sm font-medium px-4 py-2 rounded-full border border-amber-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              You will be notified when your result is ready
            </div>
          </div>
        ) : (
          /* Fully graded — show score */
          <div className={cn(
            'rounded-xl p-8 text-center',
            result.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          )}>
            <div className={cn('text-5xl font-bold mb-2', result.passed ? 'text-green-600' : 'text-red-600')}>
              {result.percentage}%
            </div>
            <p className={cn('text-lg font-semibold', result.passed ? 'text-green-700' : 'text-red-700')}>
              {result.passed ? '🎉 Passed!' : 'Not passed'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {result.score} / {result.maxScore} points · Pass at {quizDetail.settings.passingScore}%
            </p>
          </div>
        )}
        <Button variant="outline" className="w-full" onClick={() => { setResult(null); setPhase('info'); }}>
          Back to Quiz Info
        </Button>
      </div>
    );
  }

  // ── Taking screen ──
  if (phase === 'taking') {
    const questions = quizDetail.questions.map(q => q.questionId);

    const moveOrderItem = (qId: string, fromIdx: number, dir: -1 | 1) => {
      setAnswers(prev => {
        const order = [...((prev[qId] as any)?.orderingAnswer ?? [])];
        const toIdx = fromIdx + dir;
        if (toIdx < 0 || toIdx >= order.length) return prev;
        [order[fromIdx], order[toIdx]] = [order[toIdx], order[fromIdx]];
        return { ...prev, [qId]: { orderingAnswer: order } };
      });
    };

    const allAnswered = questions.every(q => {
      const a = answers[q._id] as any;
      if (!a) return false;
      if (['short_answer', 'essay', 'fill_blank'].includes(q.type)) return !!a.textAnswer?.trim();
      if (q.type === 'multiple_select') return !!a.selectedOptionIds?.length;
      if (q.type === 'ordering') return !!a.orderingAnswer?.length;
      if (q.type === 'matching') return a.matchingAnswer?.every((p: any) => p.right?.trim());
      return !!a.selectedOptionId;
    });

    return (
      <div className="max-w-2xl mx-auto space-y-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{quizDetail.title}</h2>
          <span className="text-sm text-gray-500">{questions.length} questions</span>
        </div>

        {questions.map((q, idx) => (
          <div key={q._id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3 gap-2">
              <p className="text-sm font-medium text-gray-900">
                <span className="text-gray-400 mr-1.5">{idx + 1}.</span>
                {q.text}
              </p>
              {q.type === 'essay' && (
                <span className="flex-shrink-0 text-xs bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-full">
                  Essay
                </span>
              )}
            </div>

            {/* Multiple choice / True-False */}
            {(q.type === 'multiple_choice' || q.type === 'true_false') && (
              <div className="space-y-2">
                {q.options.map(opt => {
                  const isImgUrl = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(opt.text.trim())
                    || /^https?:\/\//i.test(opt.text.trim());
                  return (
                    <label key={opt._id} className={cn(
                      'flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors',
                      answers[q._id]?.selectedOptionId === opt._id
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}>
                      <input
                        type="radio" name={`q-${q._id}`} value={opt._id}
                        checked={answers[q._id]?.selectedOptionId === opt._id}
                        onChange={() => setAnswers(a => ({ ...a, [q._id]: { selectedOptionId: opt._id } }))}
                        className="text-primary-600 flex-shrink-0"
                      />
                      {isImgUrl ? (
                        <ImageOptionDisplay src={opt.text.trim()} inline />
                      ) : (
                        <span className="text-sm text-gray-700">{opt.text}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {/* Image Choice — renders URLs as image cards in a 2-col grid */}
            {q.type === 'image' && (
              <div className="grid grid-cols-2 gap-3">
                {q.options.map(opt => {
                  const isSelected = answers[q._id]?.selectedOptionId === opt._id;
                  return (
                    <label key={opt._id} className={cn(
                      'relative flex flex-col rounded-xl border-2 cursor-pointer transition-colors overflow-hidden bg-gray-50',
                      isSelected ? 'border-primary-500 ring-2 ring-primary-300' : 'border-gray-200 hover:border-gray-300'
                    )}>
                      <input
                        type="radio" name={`q-${q._id}`} value={opt._id}
                        checked={isSelected}
                        onChange={() => setAnswers(a => ({ ...a, [q._id]: { selectedOptionId: opt._id } }))}
                        className="sr-only"
                      />
                      <ImageOptionDisplay src={opt.text.trim()} />
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow">
                          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {/* Multiple select (checkboxes) */}
            {q.type === 'multiple_select' && (
              <div className="space-y-2">
                {q.options.map(opt => {
                  const selected: string[] = (answers[q._id] as any)?.selectedOptionIds ?? [];
                  const isChecked = selected.includes(opt._id);
                  const isImgUrl = /^https?:\/\//i.test(opt.text.trim());
                  return (
                    <label key={opt._id} className={cn(
                      'flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors',
                      isChecked ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}>
                      <input
                        type="checkbox" value={opt._id} checked={isChecked}
                        onChange={() => {
                          const cur = (answers[q._id] as any)?.selectedOptionIds ?? [];
                          const next = isChecked ? cur.filter((x: string) => x !== opt._id) : [...cur, opt._id];
                          setAnswers(a => ({ ...a, [q._id]: { selectedOptionIds: next } as any }));
                        }}
                        className="text-primary-600 rounded flex-shrink-0"
                      />
                      {isImgUrl ? (
                        <ImageOptionDisplay src={opt.text.trim()} inline />
                      ) : (
                        <span className="text-sm text-gray-700">{opt.text}</span>
                      )}
                    </label>
                  );
                })}
                <p className="text-xs text-gray-400 mt-1">Select all that apply</p>
              </div>
            )}

            {/* Ordering */}
            {q.type === 'ordering' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 mb-2">Use ▲ ▼ to arrange items in the correct order</p>
                {((answers[q._id] as any)?.orderingAnswer ?? q.correctOrder ?? []).map((item: string, i: number, arr: string[]) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-semibold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-800">{item}</span>
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveOrderItem(q._id, i, -1)}
                        className="text-gray-400 hover:text-primary-600 disabled:opacity-20 text-xs leading-none px-1"
                      >▲</button>
                      <button
                        type="button"
                        disabled={i === arr.length - 1}
                        onClick={() => moveOrderItem(q._id, i, 1)}
                        className="text-gray-400 hover:text-primary-600 disabled:opacity-20 text-xs leading-none px-1"
                      >▼</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Matching */}
            {q.type === 'matching' && q.matchingPairs && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 mb-2">Match each item on the left with the correct answer on the right</p>
                {q.matchingPairs.map((pair, i) => {
                  const matchAns: { left: string; right: string }[] = (answers[q._id] as any)?.matchingAnswer ?? [];
                  const current = matchAns.find(m => m.left === pair.left)?.right ?? '';
                  const shuffledRights = [...q.matchingPairs!.map(p => p.right)];
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800">
                        {pair.left}
                      </div>
                      <span className="text-gray-400 text-sm flex-shrink-0">→</span>
                      <select
                        value={current}
                        onChange={(e) => {
                          const updated = matchAns.filter(m => m.left !== pair.left);
                          updated.push({ left: pair.left, right: e.target.value });
                          setAnswers(a => ({ ...a, [q._id]: { matchingAnswer: updated } as any }));
                        }}
                        className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                      >
                        <option value="">— Select —</option>
                        {shuffledRights.map((right, j) => (
                          <option key={j} value={right}>{right}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Short answer */}
            {q.type === 'short_answer' && (
              <textarea
                rows={2}
                value={answers[q._id]?.textAnswer ?? ''}
                onChange={(e) => setAnswers(a => ({ ...a, [q._id]: { textAnswer: e.target.value } }))}
                placeholder="Type your answer..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            )}

            {/* Fill in the blank */}
            {q.type === 'fill_blank' && (
              <input
                type="text"
                value={answers[q._id]?.textAnswer ?? ''}
                onChange={(e) => setAnswers(a => ({ ...a, [q._id]: { textAnswer: e.target.value } }))}
                placeholder="Fill in the blank..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            )}

            {/* Essay */}
            {q.type === 'essay' && (
              <div className="space-y-1.5">
                <textarea
                  rows={6}
                  value={answers[q._id]?.textAnswer ?? ''}
                  onChange={(e) => setAnswers(a => ({ ...a, [q._id]: { textAnswer: e.target.value } }))}
                  placeholder="Write your essay answer here..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                />
                <p className="text-xs text-gray-400">This answer will be manually reviewed by your instructor.</p>
              </div>
            )}
          </div>
        ))}

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <Button
          className="w-full"
          disabled={!allAnswered || submitMutation.isPending}
          loading={submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
        >
          Submit Quiz
        </Button>
      </div>
    );
  }

  // ── Info screen ──
  const lastAttempt = myAttempts[0];
  const canRetake = !lastAttempt ||
    (quizDetail.settings.allowRetake &&
      (quizDetail.settings.maxAttempts === 0 || myAttempts.length < quizDetail.settings.maxAttempts));

  const hasTimer = quizDetail.settings.timer?.enabled && quizDetail.settings.timer?.durationMinutes > 0;

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-4">
      {/* Quiz card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-primary-500 font-medium uppercase tracking-wide">Quiz</p>
              <h2 className="text-lg font-bold text-gray-900">{quizDetail.title}</h2>
            </div>
          </div>
          {quizDetail.description && (
            <p className="text-sm text-gray-600 mt-3">{quizDetail.description}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
          {[
            { label: 'Questions', value: quizDetail.totalQuestions },
            { label: 'Pass mark', value: `${quizDetail.settings.passingScore}%` },
            { label: 'Attempts', value: quizDetail.settings.maxAttempts === 0 ? 'Unlimited' : `${myAttempts.length} / ${quizDetail.settings.maxAttempts}` },
          ].map(({ label, value }) => (
            <div key={label} className="py-4 text-center">
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className="text-base font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Timer + instructions */}
        <div className="px-6 py-4 space-y-3">
          {hasTimer && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Time limit: <strong>{quizDetail.settings.timer.durationMinutes} minutes</strong></span>
            </div>
          )}
          {quizDetail.instructions && (
            <div className="flex items-start gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{quizDetail.instructions}</span>
            </div>
          )}
        </div>
      </div>

      {/* Last attempt result */}
      {lastAttempt && (
        <div className={cn(
          'rounded-xl border px-5 py-4 flex items-center justify-between',
          lastAttempt.passed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
        )}>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Last attempt #{lastAttempt.attemptNumber}</p>
            <p className={cn('text-xl font-bold', lastAttempt.passed ? 'text-green-600' : 'text-gray-700')}>
              {lastAttempt.percentage}%
            </p>
          </div>
          <span className={cn(
            'text-sm font-semibold px-3 py-1 rounded-full',
            lastAttempt.passed ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
          )}>
            {lastAttempt.passed ? '✓ Passed' : 'Not passed'}
          </span>
        </div>
      )}

      {startError && <p className="text-sm text-red-600 text-center">{startError}</p>}

      {canRetake ? (
        <Button className="w-full py-3 text-base" loading={startMutation.isPending} onClick={() => startMutation.mutate()}>
          {lastAttempt ? '↺ Retake Quiz' : '▶ Start Quiz'}
        </Button>
      ) : (
        <div className="text-center py-3 px-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-sm font-medium text-gray-600">Maximum attempts reached</p>
          <p className="text-xs text-gray-400 mt-0.5">You have used all {quizDetail.settings.maxAttempts} allowed attempts</p>
        </div>
      )}
    </div>
  );
}

// ── Quiz Lesson (lookup by lessonId → then render QuizUI) ────────────────────
function QuizLesson({ lessonId }: { lessonId: string }) {
  const { data: quizList, isLoading } = useQuery<QuizData[]>({
    queryKey: ['quiz-by-lesson', lessonId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes?lessonId=${lessonId}&limit=1`);
      return data.data.quizzes;
    },
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  if (!quizList?.[0]) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-3">
          <svg className="w-8 h-8 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p className="text-gray-500 font-medium">No quiz configured</p>
        <p className="text-gray-400 text-sm mt-1">The instructor hasn&apos;t attached a quiz to this lesson yet.</p>
      </div>
    );
  }

  return <QuizUI quizId={quizList[0]._id} />;
}

// ── Video helpers ─────────────────────────────────────────────────────────────
function parseYouTubeId(url: string): string {
  if (!url) return '';
  // Handles: watch?v=, youtu.be/, embed/, shorts/
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : url.trim();
}
function parseVimeoId(url: string): string {
  if (!url) return '';
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : url.trim();
}
function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── Cloudflare Stream Player (signed token) ───────────────────────────────────
function CfStreamPlayer({ lesson, courseId, watermark, watermarkText }: {
  lesson: Lesson; courseId: string; watermark: boolean | null; watermarkText?: string | null;
}) {
  const { data, isLoading, isError } = useQuery<{ token: string }>({
    queryKey: ['cf-stream-token', lesson._id],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/lessons/${lesson._id}/cloudflare-stream/token`);
      return data.data;
    },
    staleTime: 50 * 60 * 1000, // token is valid 1h; refresh at 50min
    refetchInterval: 50 * 60 * 1000, // proactively renew during long-focused viewing
    retry: 1,
  });

  if (isLoading) return (
    <div className="bg-black rounded-2xl aspect-video flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-gray-400">Loading secure player…</p>
      </div>
    </div>
  );

  if (isError || !data?.token) return (
    <div className="bg-black rounded-2xl aspect-video flex items-center justify-center">
      <p className="text-sm text-red-400">Could not load video. Please refresh.</p>
    </div>
  );

  const src = `https://iframe.videodelivery.net/${data.token}/iframe?autoplay=false&muted=false`;
  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-xl">
        <iframe src={src} className="w-full h-full" allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin" />
        {watermark && watermarkText && <WatermarkOverlay text={watermarkText} />}
      </div>
    </div>
  );
}

// ── Premium Video Player ───────────────────────────────────────────────────────
function VideoPlayer({ lesson, courseId }: { lesson: Lesson; courseId: string }) {
  const vid = lesson.video;
  const settings = vid?.settings;
  const disableDownload = settings?.disableDownload ?? false;
  const allowSpeed = settings?.allowSpeedControl ?? true;
  const watermark = settings?.watermarkEnabled && settings?.watermarkText;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [resumed, setResumed] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch a signed R2 URL for locally-hosted video (enrollment-gated, 2h
  // window) — the raw storage URL is never sent to students by the sections
  // API, only through this token endpoint. refetchInterval renews it
  // proactively (well before the 2h expiry) so long-focused viewing doesn't
  // silently break mid-playback.
  const isHosted = vid?.provider === 'local' || vid?.provider === 's3';
  const { data: videoTokenData, isLoading: videoTokenLoading, isError: videoTokenError, error: videoTokenErrorObj } = useQuery<{ signedUrl: string }, import('axios').AxiosError<{ message: string }>>({
    queryKey: ['video-token', lesson._id],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/lessons/${lesson._id}/video-token`);
      return data.data;
    },
    enabled: !!vid && isHosted,
    staleTime: 50 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
    retry: 1,
  });

  // Fetch resume position
  const { data: progressData } = useQuery<{ positionSeconds: number }>({
    queryKey: ['lesson-position', lesson._id],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/progress/lessons/${lesson._id}`);
      return data.data;
    },
    enabled: (vid?.provider === 'local' || vid?.provider === 's3' || vid?.provider === 'external'),
    retry: false,
  });

  // Resume to saved position once loaded
  useEffect(() => {
    const pos = progressData?.positionSeconds ?? 0;
    if (pos > 5 && videoRef.current && !resumed) {
      videoRef.current.currentTime = pos;
      setResumed(true);
    }
  }, [progressData, resumed]);

  // Save position every 10 seconds while playing
  useEffect(() => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const onPlay = () => {
      saveTimer.current = setInterval(() => {
        if (!v.paused && v.currentTime > 0)
          api.patch(`/courses/${courseId}/progress/lessons/${lesson._id}/position`, {
            positionSeconds: Math.floor(v.currentTime),
          }).catch(() => {});
      }, 10000);
    };
    const onPause = () => { if (saveTimer.current) clearInterval(saveTimer.current); };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => { v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); if (saveTimer.current) clearInterval(saveTimer.current); };
  }, [courseId, lesson._id]);

  // Sync speed to video element
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  if (!vid || (!vid.url && !vid.embedCode && !isHosted)) {
    return (
      <div className="bg-gray-900 rounded-2xl flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-400 font-medium">Video not configured yet</p>
      </div>
    );
  }

  // ── Embed (raw HTML) ──
  if (vid.provider === 'embed' && vid.embedCode) {
    return (
      <div className="space-y-2">
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-xl"
          dangerouslySetInnerHTML={{ __html: vid.embedCode }} />
        {watermark && <WatermarkOverlay text={settings!.watermarkText!} />}
      </div>
    );
  }

  // ── Cloudflare Stream — signed token playback ──
  if (vid.provider === 'cloudflare') {
    return <CfStreamPlayer lesson={lesson} courseId={courseId} watermark={watermark} watermarkText={settings?.watermarkText} />;
  }

  // ── YouTube / Vimeo iframe ──
  if (vid.provider === 'youtube' || vid.provider === 'vimeo') {
    let src = vid.url ?? '';
    if (vid.provider === 'youtube') {
      const id = parseYouTubeId(src);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      src = `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&enablejsapi=1${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`;
    } else {
      const id = parseVimeoId(src);
      src = `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0&dnt=1`;
    }

    return (
      <div className="space-y-2">
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-xl">
          <iframe src={src} className="w-full h-full" allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin" />
          {watermark && <WatermarkOverlay text={settings!.watermarkText!} />}
        </div>
        {vid.durationSeconds > 0 && (
          <p className="text-xs text-gray-400 text-right px-1">{fmtTime(vid.durationSeconds)}</p>
        )}
      </div>
    );
  }

  // ── Self-hosted — wait for the signed token before rendering the player ──
  if (isHosted) {
    if (videoTokenLoading) {
      return (
        <div className="bg-black rounded-2xl aspect-video flex items-center justify-center">
          <Spinner size="sm" />
        </div>
      );
    }
    if (videoTokenError || !videoTokenData?.signedUrl) {
      const apiMessage = videoTokenErrorObj?.response?.data?.message;
      return (
        <div className="bg-gray-900 rounded-2xl aspect-video flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-red-400 text-sm">{apiMessage || 'Could not load video. Please refresh the page.'}</p>
          {videoTokenErrorObj?.response?.status === 403 && apiMessage?.toLowerCase().includes('membership') && (
            <a href="/membership" className="text-xs font-medium text-primary-400 hover:text-primary-300 underline">
              Go to Membership →
            </a>
          )}
        </div>
      );
    }
  }

  // ── Self-hosted / External URL — native HTML5 player with custom controls ──
  const videoSrc = isHosted ? videoTokenData?.signedUrl : (vid.url ?? undefined);
  return (
    <div className="space-y-1" onClick={() => setShowSpeedMenu(false)}>
      <div className="relative rounded-2xl overflow-hidden bg-black shadow-xl group">
        <video
          ref={videoRef}
          key={videoSrc}
          src={videoSrc}
          className="w-full aspect-video"
          controls
          controlsList={disableDownload ? 'nodownload' : undefined}
          onContextMenu={disableDownload ? (e) => e.preventDefault() : undefined}
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
          playsInline
        />
        {/* Watermark */}
        {watermark && <WatermarkOverlay text={settings!.watermarkText!} />}
        {/* Disable-download shield — transparent overlay blocks right-click on video */}
        {disableDownload && <div className="absolute inset-0 pointer-events-none select-none" />}
      </div>

      {/* Custom control bar */}
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-xs text-gray-400">
          {fmtTime(currentTime)} {duration > 0 && `/ ${fmtTime(duration)}`}
        </span>
        <div className="flex items-center gap-3">
          {allowSpeed && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(v => !v); }}
                className="text-xs font-semibold text-gray-500 hover:text-primary-600 bg-gray-100 hover:bg-primary-50 px-2.5 py-1 rounded-lg transition-colors"
              >
                {speed}×
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-10">
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => { setSpeed(s); setShowSpeedMenu(false); }}
                      className={cn('block w-full text-left px-4 py-2 text-sm transition-colors',
                        speed === s ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-gray-700 hover:bg-gray-50')}>
                      {s}×
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {disableDownload && (
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Protected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Watermark ─────────────────────────────────────────────────────────────────
function WatermarkOverlay({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none select-none flex items-end justify-end p-4">
      <span className="text-white/30 text-xs font-semibold tracking-wide"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
        {text}
      </span>
    </div>
  );
}

// ── Audio Player ─────────────────────────────────────────────────────────────
function AudioPlayer({ lesson, courseId }: { lesson: Lesson; courseId: string }) {
  const au = lesson.audio;

  // Fetch a signed R2 URL for locally-hosted audio (enrollment-gated, 2h window)
  const isHosted = au?.provider === 'local' || au?.provider === 's3';
  const { data: tokenData, isLoading: tokenLoading, isError: tokenError, error: tokenErrorObj } = useQuery<{ signedUrl: string }, import('axios').AxiosError<{ message: string }>>({
    queryKey: ['audio-token', lesson._id],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/lessons/${lesson._id}/audio-token`);
      return data.data;
    },
    enabled: !!au && isHosted,
    staleTime: 50 * 60 * 1000, // refresh well before 2h expiry
    refetchInterval: 45 * 60 * 1000, // proactively renew during long-focused listening
    retry: 1,
  });

  const empty = (
    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl mb-4">🎵</span>
      <p className="text-gray-500 font-medium">No audio configured yet</p>
    </div>
  );

  if (!au) return empty;

  // Waveform / branding header
  const Header = ({ color = 'purple' }: { color?: string }) => (
    <div className={`flex items-center gap-4 px-6 py-5 rounded-t-2xl bg-gradient-to-r from-${color}-600 to-${color}-500`}>
      <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
        </svg>
      </div>
      <div>
        <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">Audio Lesson</p>
        <p className="text-white font-bold text-base leading-snug">{lesson.title}</p>
        {au.durationSeconds > 0 && (
          <p className="text-white/60 text-xs mt-0.5">{Math.floor(au.durationSeconds / 60)}m {au.durationSeconds % 60}s</p>
        )}
      </div>
    </div>
  );

  // ── Embed (raw HTML) ──
  if (au.provider === 'embed' && au.embedCode) {
    return (
      <div className="rounded-2xl overflow-hidden border border-purple-100 shadow-sm">
        <Header />
        <div className="p-4 bg-white" dangerouslySetInnerHTML={{ __html: au.embedCode }} />
      </div>
    );
  }

  // ── SoundCloud ──
  if (au.provider === 'soundcloud' && au.url) {
    const scSrc = `https://w.soundcloud.com/player/?url=${encodeURIComponent(au.url)}&color=%237c3aed&auto_play=false&show_artwork=true&visual=true`;
    return (
      <div className="rounded-2xl overflow-hidden border border-purple-100 shadow-sm">
        <Header color="orange" />
        <div className="bg-white p-1">
          <iframe
            width="100%"
            height="166"
            scrolling="no"
            frameBorder="no"
            src={scSrc}
            className="rounded-xl"
          />
        </div>
        <div className="px-4 pb-3 bg-white">
          <a href={au.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-orange-500 hover:underline flex items-center gap-1">
            <span>☁</span> Open on SoundCloud
          </a>
        </div>
      </div>
    );
  }

  // ── Spotify ──
  if (au.provider === 'spotify' && au.url) {
    // A link copied via "Share > Copy Song Link" from inside an album view looks like
    // .../album/{albumId}?highlight=spotify:track:{trackId} — prefer the highlighted
    // track (what the user actually meant to share) over embedding the whole album.
    const highlightMatch = au.url.match(/highlight=spotify(?::|%3A)(track|episode)(?::|%3A)([A-Za-z0-9]+)/);
    const pathMatch = au.url.match(/(track|episode|show|album|playlist)\/([A-Za-z0-9]+)/);
    const embedType = highlightMatch?.[1] ?? pathMatch?.[1] ?? 'track';
    const spotifyId = highlightMatch?.[2] ?? pathMatch?.[2] ?? '';
    // Spotify's recommended embed heights differ by content type — a fixed
    // 152px (right for a single track) clips an album/playlist's tracklist.
    const embedHeight = embedType === 'album' || embedType === 'playlist' ? 352
      : embedType === 'episode' || embedType === 'show' ? 232
      : 152;
    return (
      <div className="rounded-2xl overflow-hidden border border-green-100 shadow-sm">
        <Header color="green" />
        <div className="bg-white p-1">
          {spotifyId ? (
            <iframe
              src={`https://open.spotify.com/embed/${embedType}/${spotifyId}?utm_source=generator&theme=0`}
              width="100%"
              height={embedHeight}
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="rounded-xl"
            />
          ) : (
            <div className="py-6 text-center text-sm text-gray-400">Invalid Spotify URL</div>
          )}
        </div>
        <div className="px-4 pb-3 bg-white">
          <a href={au.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-green-600 hover:underline flex items-center gap-1">
            <span>🎧</span> Open on Spotify
          </a>
        </div>
      </div>
    );
  }

  // ── Self-hosted (R2/local) — signed URL, enrollment-gated ──
  if ((au.provider === 'local' || au.provider === 's3') && au.url) {
    if (tokenLoading) return (
      <div className="rounded-2xl overflow-hidden border border-purple-100 shadow-sm">
        <Header />
        <div className="bg-white px-6 py-8 flex items-center justify-center gap-3 text-sm text-gray-400">
          <Spinner size="sm" /> Loading audio…
        </div>
      </div>
    );
    if (tokenError || !tokenData?.signedUrl) {
      const apiMessage = tokenErrorObj?.response?.data?.message;
      return (
        <div className="rounded-2xl overflow-hidden border border-red-100 shadow-sm">
          <Header />
          <div className="bg-white px-6 py-6 text-center text-sm text-red-500 space-y-2">
            <p>{apiMessage || 'Could not load audio. Please refresh the page.'}</p>
            {tokenErrorObj?.response?.status === 403 && apiMessage?.toLowerCase().includes('membership') && (
              <a href="/membership" className="block text-xs font-medium text-primary-600 hover:text-primary-700 underline">
                Go to Membership →
              </a>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-2xl overflow-hidden border border-purple-100 shadow-sm">
        <Header />
        <div className="bg-white px-6 py-5">
          <audio
            key={tokenData.signedUrl}
            src={tokenData.signedUrl}
            controls
            controlsList="nodownload"
            className="w-full"
            style={{ accentColor: '#7c3aed' }}
          />
        </div>
      </div>
    );
  }

  // ── External URL — native HTML5 player (no signing, not our file) ──
  if (au.provider === 'external' && au.url) {
    return (
      <div className="rounded-2xl overflow-hidden border border-purple-100 shadow-sm">
        <Header />
        <div className="bg-white px-6 py-5">
          <audio src={au.url} controls className="w-full" style={{ accentColor: '#7c3aed' }} />
        </div>
      </div>
    );
  }

  return empty;
}

// ── Drip Lock Overlay ────────────────────────────────────────────────────────
function DripLockOverlay({ lesson }: { lesson: Lesson }) {
  const unlockDate = lesson.dripLockedUntil ? new Date(lesson.dripLockedUntil) : null;
  const daysLeft = unlockDate
    ? Math.ceil((unlockDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
      <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-5">
        <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-1">Lesson Locked</h3>
      <p className="text-gray-500 text-sm max-w-xs">
        This lesson unlocks{' '}
        {unlockDate ? (
          <span className="font-semibold text-amber-600">
            {daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`} ({unlockDate.toLocaleDateString()})
          </span>
        ) : 'soon'}.
      </p>
      <p className="text-gray-400 text-xs mt-2">Drip content is released gradually after enrollment.</p>
    </div>
  );
}

// ── Live Lesson Content (full-featured) ───────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  livekit: 'Live Class', zoom: 'Zoom', meet: 'Google Meet', teams: 'Microsoft Teams',
  youtube_live: 'YouTube Live', custom: 'Online Meeting',
};
const PLATFORM_COLORS: Record<string, string> = {
  livekit: 'bg-primary-600', zoom: 'bg-blue-600', meet: 'bg-green-600', teams: 'bg-purple-600',
  youtube_live: 'bg-red-600', custom: 'bg-gray-600',
};

function useCountdown(target: Date | null) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!target) { setRemaining(null); return; }
    const tick = () => setRemaining(Math.max(0, target.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return remaining;
}

function formatCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function parseYouTubeEmbed(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : null;
}

interface LiveSessionData {
  lesson: { liveClass: {
    platform: string; meetingUrl: string | null; hasLiveKitRoom: boolean; scheduledAt: string | null;
    durationMinutes: number; instructions: string | null; status: string;
    liveStartedAt: string | null; liveEndedAt: string | null;
    recordingUrl: string | null; attendanceEnabled: boolean; checkinOpen: boolean;
  }};
  myAttendance: { status: string; source: string; joinedAt: string | null; checkedInAt: string | null } | null;
}

function LiveLessonContent({ lesson }: { lesson: Lesson }) {
  const qc = useQueryClient();
  const router = useRouter();
  const qKey = ['live-session', lesson._id];

  const { data, isLoading } = useQuery<LiveSessionData>({
    queryKey: qKey,
    queryFn: async () => { const { data } = await api.get(`/live/lessons/${lesson._id}/session`); return data.data; },
    refetchInterval: 15000, // re-poll every 15s to catch status changes
  });

  const joinMut = useMutation({
    mutationFn: () => api.post(`/live/lessons/${lesson._id}/join`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qKey });
      const result = res.data?.data;
      if (result?.platform === 'livekit') {
        // In-app video room — a real page navigation, not a popup.
        router.push(`/live-room/${lesson._id}`);
      } else if (result?.meetingUrl) {
        // Legacy zoom/meet/teams/custom — unchanged behavior.
        window.open(result.meetingUrl, '_blank', 'noopener,noreferrer');
      }
    },
  });

  const checkinMut = useMutation({
    mutationFn: () => api.post(`/live/lessons/${lesson._id}/checkin`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  });

  const lc = data?.lesson?.liveClass ?? (lesson.liveClass as any);
  const myAttendance = data?.myAttendance ?? null;
  const status = lc?.status ?? 'scheduled';
  const scheduledAt = lc?.scheduledAt ? new Date(lc.scheduledAt) : null;
  const platform = lc?.platform ?? 'livekit';
  // A livekit lesson has meetingUrl:null by design (uses a room instead).
  const hasMeeting = !!lc?.meetingUrl || (platform === 'livekit' && !!lc?.hasLiveKitRoom);
  const remaining = useCountdown(status === 'scheduled' && scheduledAt ? scheduledAt : null);

  const isLive      = status === 'live';
  const isEnded     = status === 'ended';
  const isCancelled = status === 'cancelled';
  const isScheduled = status === 'scheduled';
  const checkinOpen = lc?.checkinOpen ?? false;
  const recordingUrl = lc?.recordingUrl;
  const ytEmbed = recordingUrl ? parseYouTubeEmbed(recordingUrl) : null;

  if (isLoading && !lc) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="space-y-4">
      {/* ── Status banner ── */}
      {isLive && (
        <div className="flex items-center gap-3 px-5 py-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="relative flex h-3 w-3 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <p className="text-sm font-bold text-red-700">Session is Live Now!</p>
        </div>
      )}
      {isEnded && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Session ended {lc?.liveEndedAt ? `· ${new Date(lc.liveEndedAt).toLocaleDateString()}` : ''}
        </div>
      )}
      {isCancelled && (
        <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">🚫 This session was cancelled</div>
      )}

      {/* ── Main card ── */}
      <div className={cn(
        'rounded-2xl border p-6',
        isLive ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-100'
               : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100'
      )}>
        <div className="max-w-md mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0',
              isLive ? 'bg-red-100' : 'bg-emerald-100')}>
              <svg className={cn('w-7 h-7', isLive ? 'text-red-600' : 'text-emerald-600')}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className={cn('text-xs font-semibold uppercase tracking-wide', isLive ? 'text-red-600' : 'text-emerald-600')}>
                {isLive ? '🔴 Live Class' : 'Live Class'}
              </p>
              <p className="text-lg font-bold text-gray-900">{lesson.title}</p>
            </div>
          </div>

          {/* Countdown for upcoming */}
          {isScheduled && remaining !== null && remaining > 0 && (
            <div className="text-center bg-white/80 rounded-xl py-4 border border-emerald-100">
              <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Starts in</p>
              <p className="text-3xl font-bold text-emerald-700 font-mono">{formatCountdown(remaining)}</p>
            </div>
          )}

          {/* Scheduled date */}
          {scheduledAt && (
            <div className={cn('rounded-xl px-4 py-3 flex items-center gap-3',
              isLive ? 'bg-red-100 border border-red-200' : 'bg-emerald-100 border border-emerald-200')}>
              <svg className="w-5 h-5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {scheduledAt.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-xs text-gray-500">
                  {scheduledAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
                  {lc?.durationMinutes ? ` · ${lc.durationMinutes} min` : ''}
                </p>
              </div>
            </div>
          )}

          {/* Instructions */}
          {lc?.instructions && (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 leading-relaxed">
              {lc.instructions}
            </div>
          )}

          {/* Join button */}
          {isLive && hasMeeting && (
            <button
              onClick={() => joinMut.mutate()}
              disabled={joinMut.isPending}
              className={cn(
                'flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-white text-base transition-opacity',
                PLATFORM_COLORS[platform] ?? 'bg-gray-600',
                joinMut.isPending ? 'opacity-70' : 'hover:opacity-90'
              )}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {joinMut.isPending ? 'Opening…' : `Join ${PLATFORM_LABELS[platform] ?? 'Meeting'}`}
            </button>
          )}

          {isScheduled && hasMeeting && (
            <div className="text-center py-3 bg-white/60 rounded-xl border border-emerald-100 text-sm text-gray-500">
              Meeting link will be available when the session starts.
            </div>
          )}

          {(isScheduled || isEnded) && !hasMeeting && !isEnded && (
            <div className="text-center py-3 bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-500">
              Meeting link will be shared before the session.
            </div>
          )}

          {/* Self check-in */}
          {lc?.attendanceEnabled && checkinOpen && !myAttendance?.checkedInAt && (
            <button
              onClick={() => checkinMut.mutate()}
              disabled={checkinMut.isPending}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-semibold text-emerald-700 bg-white border-2 border-emerald-400 hover:bg-emerald-50 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {checkinMut.isPending ? 'Confirming…' : 'Mark Myself as Attended'}
            </button>
          )}
        </div>
      </div>

      {/* ── Attendance status badge ── */}
      {myAttendance && (
        <div className={cn(
          'flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium border',
          myAttendance.status === 'attended' ? 'bg-green-50 border-green-200 text-green-700'
            : myAttendance.status === 'partial' ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
            : 'bg-gray-50 border-gray-200 text-gray-600'
        )}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Attendance: <span className="capitalize font-semibold">{myAttendance.status}</span>
          {myAttendance.checkedInAt && (
            <span className="text-xs font-normal opacity-70 ml-1">
              · verified {new Date(myAttendance.checkedInAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {/* ── Recording ── */}
      {recordingUrl && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="flex items-center gap-2.5 px-5 py-3 bg-gray-50 border-b border-gray-100">
            <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="text-sm font-semibold text-gray-800">Session Recording</span>
          </div>
          {ytEmbed ? (
            <div className="aspect-video">
              <iframe src={ytEmbed ?? undefined} className="w-full h-full" allowFullScreen allow="autoplay; encrypted-media" />
            </div>
          ) : (
            <div className="px-5 py-4">
              <a href={recordingUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Watch Recording →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Secure File Lesson ────────────────────────────────────────────────────────
const PDF_TYPES  = ['application/pdf'];
const DOC_TYPES  = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];
const PPT_TYPES  = [
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const IMG_TYPES  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

interface FileTokenData {
  token: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isConverted: boolean;
  convertedHtml: string | null;
}

function SecureFileLesson({ lesson }: { lesson: Lesson }) {
  const { user } = useAuthStore();
  const apiBase  = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '') + '/api';

  const { data, isLoading, isError, refetch } = useQuery<FileTokenData>({
    queryKey: ['file-token', lesson._id],
    queryFn:  async () => {
      const res = await api.get(`/files/token?lessonId=${lesson._id}`);
      return res.data.data;
    },
    staleTime: 4 * 60 * 1000, // token lives 5 min — refetch after 4 min
    refetchInterval: 4 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Preparing secure viewer…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center bg-red-50 rounded-2xl border border-red-100">
        <p className="text-red-600 font-medium">Could not load file</p>
        <p className="text-gray-400 text-sm mt-1">You may not have access or the file was removed.</p>
        <button onClick={() => refetch()} className="mt-3 text-sm text-primary-600 hover:underline">Retry</button>
      </div>
    );
  }

  // Handle embed code (rare — admin pasted raw HTML embed)
  if (lesson.file?.embedCode) {
    return (
      <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100" style={{ height: '70vh' }}
        dangerouslySetInnerHTML={{ __html: lesson.file.embedCode }} />
    );
  }

  const mime     = data.mimeType ?? lesson.file?.mimeType ?? '';
  const serveUrl = `${apiBase}/files/serve/${data.token}`;
  const sizeKB   = data.sizeBytes ? Math.round(data.sizeBytes / 1024) : null;
  const sizeLabel = sizeKB === null ? '' : sizeKB < 1024 ? `${sizeKB} KB` : `${(sizeKB / 1024).toFixed(1)} MB`;
  const ext      = data.fileName?.split('.').pop()?.toUpperCase() ?? 'FILE';
  const name     = user?.name ?? user?.email ?? 'Student';
  const email    = user?.email ?? '';

  // ── PDF ──
  if (PDF_TYPES.includes(mime) || data.fileName?.toLowerCase().endsWith('.pdf')) {
    return (
      <div className="space-y-3">
        <SecurePdfViewer
          serveUrl={serveUrl}
          fileName={data.fileName}
          studentName={name}
          studentEmail={email}
        />
        <p className="text-xs text-gray-400 text-center">
          🔒 This document is protected. Downloading and copying are disabled.
        </p>
      </div>
    );
  }

  // ── Word / Excel / Text — converted HTML viewer ──
  if (DOC_TYPES.includes(mime)) {
    if (data.isConverted && data.convertedHtml) {
      return (
        <div className="space-y-3">
          <SecureDocViewer
            html={data.convertedHtml}
            fileName={data.fileName}
            mimeType={mime}
            studentName={name}
            studentEmail={email}
          />
          <p className="text-xs text-gray-400 text-center">
            🔒 This document is protected. Copying and downloading are disabled.
          </p>
        </div>
      );
    }
    // Conversion still in progress (should resolve within seconds)
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 bg-amber-50 rounded-2xl border border-amber-100">
        <div className="w-8 h-8 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
        <p className="text-sm text-amber-700 font-medium">Document is being processed…</p>
        <p className="text-xs text-amber-600">This takes a few seconds. Refresh the page shortly.</p>
      </div>
    );
  }

  // ── Image — inline secure viewer with watermark ──
  if (IMG_TYPES.includes(mime) || (!mime && /\.(jpe?g|png|webp|gif|svg)$/i.test(data.fileName ?? ''))) {
    return (
      <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-xl select-none bg-gray-900"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        onContextMenu={e => e.preventDefault()}>
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-800 border-b border-gray-700">
          <span className="text-xs font-bold bg-purple-600 text-white px-2 py-0.5 rounded uppercase flex-shrink-0">IMG</span>
          <span className="text-xs text-gray-300 truncate flex-1">{data.fileName}</span>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-900/50 border border-emerald-700/50 rounded-lg flex-shrink-0">
            <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-[10px] text-emerald-400 font-semibold">Protected</span>
          </div>
        </div>
        <div className="relative flex justify-center items-center p-4 bg-gray-800" style={{ minHeight: '60vh' }}>
          {/* Tiled watermark */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={i} className="absolute whitespace-nowrap text-white font-semibold"
                style={{
                  fontSize: '13px', opacity: 0.08,
                  top:  `${(i % 6) * 120 - 20}px`,
                  left: `${Math.floor(i / 6) * 300 - 60}px`,
                  transform: 'rotate(-20deg)', letterSpacing: '0.05em',
                }}>
                {name}  •  {email}
              </div>
            ))}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={serveUrl} alt={data.fileName} className="relative z-0 max-w-full max-h-[65vh] object-contain rounded-lg shadow-2xl"
            draggable={false} onContextMenu={e => e.preventDefault()} />
        </div>
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-700 text-center">
          <p className="text-xs text-gray-500">🔒 This image is protected. Right-click and downloading are disabled.</p>
        </div>
      </div>
    );
  }

  // ── PowerPoint or other ── secure download only ──
  const isPpt  = PPT_TYPES.includes(mime);
  const label  = isPpt ? 'Open Presentation' : 'Download File';
  const bgColor = isPpt ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="bg-gradient-to-br from-slate-50 to-gray-100 border border-gray-200 rounded-2xl p-8">
      <div className="max-w-sm mx-auto flex flex-col items-center text-center gap-4">
        <div className="relative">
          <div className="w-20 h-20 bg-white border border-gray-200 rounded-2xl flex items-center justify-center shadow-sm">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <span className={`absolute -bottom-1 -right-1 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase ${isPpt ? 'bg-orange-600' : 'bg-blue-600'}`}>
            {ext}
          </span>
        </div>
        <div>
          <p className="font-semibold text-gray-800 text-sm">{data.fileName}</p>
          {sizeLabel && <p className="text-xs text-gray-400 mt-0.5">{sizeLabel}</p>}
        </div>
        <a
          href={serveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 px-5 py-2.5 ${bgColor} text-white rounded-xl text-sm font-medium transition-colors shadow-sm`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          {label}
        </a>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Secured · Link expires in 5 minutes
        </div>
      </div>
    </div>
  );
}

// ── Lesson Content ────────────────────────────────────────────────────────────
function LessonContent({ lesson }: { lesson: Lesson }) {
  if (lesson.dripLockedUntil) return <DripLockOverlay lesson={lesson} />;
  if (lesson.type === 'text') {
    if (!lesson.content) {
      return (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-400 text-sm italic">No content added for this lesson yet.</p>
        </div>
      );
    }
    return (
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lesson Content</span>
        </div>
        <div className="px-6 py-6">
          <SmartContent content={lesson.content} />
        </div>
      </div>
    );
  }

  if (lesson.type === 'video') {
    // key forces a full remount per lesson — without it, VideoPlayer's
    // internal `resumed` flag (and other per-video state) carries over from
    // the previous lesson, so only the very first video watched in a
    // session ever seeks to its saved position; every one after silently
    // doesn't.
    return <VideoPlayer key={lesson._id} lesson={lesson} courseId={lesson.courseId} />;
  }

  if (lesson.type === 'audio') {
    return <AudioPlayer lesson={lesson} courseId={lesson.courseId} />;
  }

  if (lesson.type === 'file') {
    return <SecureFileLesson lesson={lesson} />;
  }

  if (lesson.type === 'live') {
    return <LiveLessonContent lesson={lesson} />;
  }

  if (lesson.type === 'quiz') {
    return <QuizLesson lessonId={lesson._id} />;
  }

  return null;
}

// ── Discussion Panel ──────────────────────────────────────────────────────────

interface DiscussionPost {
  _id: string;
  parentId: string | null;
  userId: string;
  authorName: string;
  authorRole: 'student' | 'instructor' | 'tenant_admin';
  body: string;
  isResolved: boolean;
  isPinned: boolean;
  upvoteCount: number;
  isUpvotedByMe: boolean;
  editedAt: string | null;
  createdAt: string;
  replies?: DiscussionPost[];
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const EDITOR_ROLES = ['instructor', 'tenant_admin'];

function PostCard({
  post, lessonId, currentUserId, currentUserRole, onRefresh, isReply = false,
}: {
  post: DiscussionPost;
  lessonId: string;
  currentUserId: string;
  currentUserRole: string;
  onRefresh: () => void;
  isReply?: boolean;
}) {
  const [replying, setReplying]   = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [editing, setEditing]     = useState(false);
  const [editBody, setEditBody]   = useState(post.body);

  const isEditor  = EDITOR_ROLES.includes(currentUserRole);
  const isOwner   = post.userId === currentUserId;
  const canDelete = isOwner || isEditor;
  const canEdit   = isOwner || isEditor;
  const canResolve = (isOwner || isEditor) && !isReply;
  const canPin    = isEditor && !isReply;

  const mutOpts = { onSuccess: onRefresh };

  const replyMut   = useMutation({ mutationFn: (b: string) => api.post(`/discussions/${post._id}/reply`, { body: b }), ...mutOpts });
  const editMut    = useMutation({ mutationFn: (b: string) => api.patch(`/discussions/${post._id}`, { body: b }), ...mutOpts });
  const deleteMut  = useMutation({ mutationFn: () => api.delete(`/discussions/${post._id}`), ...mutOpts });
  const resolveMut = useMutation({ mutationFn: () => api.patch(`/discussions/${post._id}/resolve`), ...mutOpts });
  const pinMut     = useMutation({ mutationFn: () => api.patch(`/discussions/${post._id}/pin`), ...mutOpts });
  const upvoteMut  = useMutation({ mutationFn: () => api.post(`/discussions/${post._id}/upvote`), ...mutOpts });

  function submitReply() {
    if (!replyBody.trim()) return;
    replyMut.mutate(replyBody.trim(), { onSuccess: () => { setReplyBody(''); setReplying(false); onRefresh(); } });
  }

  function submitEdit() {
    if (!editBody.trim()) return;
    editMut.mutate(editBody.trim(), { onSuccess: () => { setEditing(false); onRefresh(); } });
  }

  return (
    <div className={cn('flex gap-3', isReply && 'ml-8 mt-3')}>
      {/* Avatar */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
        isEditor || post.authorRole !== 'student'
          ? 'bg-primary-100 text-primary-700'
          : 'bg-gray-100 text-gray-600'
      )}>
        {post.authorName.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-semibold text-gray-900">{post.authorName}</span>
          {post.authorRole !== 'student' && (
            <span className="text-[10px] font-bold bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
              {post.authorRole === 'tenant_admin' ? 'Admin' : 'Instructor'}
            </span>
          )}
          {post.isPinned  && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">📌 Pinned</span>}
          {post.isResolved && <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-1.5 py-0.5 rounded">✅ Resolved</span>}
          <span className="text-xs text-gray-400">{timeAgo(post.createdAt)}</span>
          {post.editedAt && <span className="text-xs text-gray-400 italic">(edited)</span>}
        </div>

        {/* Body / edit mode */}
        {editing ? (
          <div className="space-y-2">
            <textarea
              rows={3}
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <div className="flex gap-2">
              <Button size="sm" loading={editMut.isPending} onClick={submitEdit}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setEditBody(post.body); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{post.body}</p>
        )}

        {/* Action row */}
        {!editing && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <button
              onClick={() => upvoteMut.mutate()}
              className={cn('flex items-center gap-1 text-xs transition-colors', post.isUpvotedByMe ? 'text-primary-600 font-semibold' : 'text-gray-400 hover:text-primary-500')}
            >
              👍 {post.upvoteCount > 0 && post.upvoteCount}
            </button>

            {!isReply && (
              <button onClick={() => setReplying(v => !v)} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                Reply
              </button>
            )}
            {canResolve && (
              <button onClick={() => resolveMut.mutate()} className={cn('text-xs transition-colors', post.isResolved ? 'text-green-600 hover:text-gray-500' : 'text-gray-400 hover:text-green-600')}>
                {post.isResolved ? 'Unresolve' : 'Mark resolved'}
              </button>
            )}
            {canPin && (
              <button onClick={() => pinMut.mutate()} className={cn('text-xs transition-colors', post.isPinned ? 'text-amber-600 hover:text-gray-500' : 'text-gray-400 hover:text-amber-600')}>
                {post.isPinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            {canEdit && (
              <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Edit</button>
            )}
            {canDelete && (
              <button onClick={() => deleteMut.mutate()} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                {deleteMut.isPending ? '…' : 'Delete'}
              </button>
            )}
          </div>
        )}

        {/* Reply input */}
        {replying && (
          <div className="mt-3 space-y-2">
            <textarea
              autoFocus
              rows={2}
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              placeholder="Write a reply…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <div className="flex gap-2">
              <Button size="sm" loading={replyMut.isPending} onClick={submitReply}>Post reply</Button>
              <Button size="sm" variant="outline" onClick={() => { setReplying(false); setReplyBody(''); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Replies */}
        {!isReply && (post.replies ?? []).map(r => (
          <PostCard
            key={r._id} post={r} lessonId={lessonId}
            currentUserId={currentUserId} currentUserRole={currentUserRole}
            onRefresh={onRefresh} isReply
          />
        ))}
      </div>
    </div>
  );
}

function DiscussionPanel({ lessonId }: { lessonId: string }) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [newBody, setNewBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const qKey = ['discussions', lessonId];

  const { data, isLoading, isError, error } = useQuery<{ discussions: DiscussionPost[] }>({
    queryKey: qKey,
    queryFn: () => api.get(`/discussions/lesson/${lessonId}`).then(r => r.data.data),
    staleTime: 0,
    retry: 0,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: qKey });

  const postMut = useMutation({
    mutationFn: (body: string) => api.post(`/discussions/lesson/${lessonId}`, { body }),
    onSuccess: () => { setNewBody(''); refresh(); },
  });

  function submitPost() {
    if (!newBody.trim()) return;
    postMut.mutate(newBody.trim());
  }

  if (!user) return null;

  const discussions = data?.discussions ?? [];
  const total = discussions.length;

  return (
    <div className="border-t border-gray-200 pt-6 space-y-5">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <h2 className="text-base font-semibold text-gray-900">
          Discussion {total > 0 && <span className="text-gray-400 font-normal text-sm">({total})</span>}
        </h2>
      </div>

      {/* New post input */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
        <textarea
          ref={textareaRef}
          rows={3}
          value={newBody}
          onChange={e => setNewBody(e.target.value)}
          placeholder="Ask a question or share a thought about this lesson…"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none bg-white"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!newBody.trim()}
            loading={postMut.isPending}
            onClick={submitPost}
          >
            Post
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : isError ? (
        <p className="text-sm text-red-500 text-center py-4">
          {(error as any)?.response?.data?.message ?? 'Failed to load discussions.'}
        </p>
      ) : discussions.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <p className="text-sm font-medium text-gray-500">No posts yet</p>
          <p className="text-xs mt-1">Be the first to ask a question.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {discussions.map(post => (
            <PostCard
              key={post._id}
              post={post}
              lessonId={lessonId}
              currentUserId={user._id}
              currentUserRole={user.role}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LearnPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const [activeLessonId, setActiveLessonId] = useState<string>(searchParams.get('lessonId') ?? '');
  const [activeQuizId, setActiveQuizId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: course } = useQuery<Course>({
    queryKey: ['course', id],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${id}`);
      return data.data.course;
    },
  });

  const { data: sections, isLoading: sectionsLoading } = useQuery<Section[]>({
    queryKey: ['sections', id],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${id}/sections`);
      return data.data.sections;
    },
  });

  // Course-level quizzes (published, not tied to a specific lesson)
  const { data: courseQuizzesRaw = [] } = useQuery<CourseQuizSummary[]>({
    queryKey: ['course-quizzes', id],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes?courseId=${id}&status=published&limit=50`);
      return data.data.quizzes;
    },
  });
  // Filter out quizzes that already belong to a lesson (those show inside the lesson)
  const courseQuizzes = courseQuizzesRaw.filter(q => !q.lessonId);

  const { data: progressData } = useQuery<CourseProgressData>({
    queryKey: ['progress', id],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${id}/progress`);
      return data.data;
    },
  });

  const allLessons: Lesson[] = (sections ?? []).flatMap(s => s.lessons ?? []);

  useEffect(() => {
    if (!activeLessonId && !activeQuizId && allLessons.length > 0) {
      setActiveLessonId(allLessons[0]._id);
    }
  }, [allLessons.length]);

  const activeLesson = allLessons.find(l => l._id === activeLessonId) ?? (activeQuizId ? undefined : allLessons[0]);
  const activeIndex = allLessons.findIndex(l => l._id === activeLessonId);

  const completedIds = new Set(
    (progressData?.lessonDetails ?? [])
      .filter(p => p.status === 'completed')
      .map(p => p.lessonId)
  );

  const completionPct = progressData?.courseProgress?.percentage ?? 0;
  const [courseCompleted, setCourseCompleted] = useState(false);

  const completeMutation = useMutation({
    mutationFn: (lessonId: string) => api.post(`/courses/${id}/progress/lessons/${lessonId}`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['progress', id] });
      qc.invalidateQueries({ queryKey: ['my-enrollments'] });
      if (data.data?.data?.percentage === 100) setCourseCompleted(true);
    },
  });

  const goTo = useCallback((lesson: Lesson) => {
    setActiveLessonId(lesson._id);
    setActiveQuizId('');
    router.replace(`/courses/${id}/learn?lessonId=${lesson._id}`, { scroll: false });
  }, [id, router]);

  const goToQuiz = useCallback((quiz: CourseQuizSummary) => {
    setActiveQuizId(quiz._id);
    setActiveLessonId('');
    router.replace(`/courses/${id}/learn?quizId=${quiz._id}`, { scroll: false });
  }, [id, router]);

  const goPrev = () => { if (activeIndex > 0) goTo(allLessons[activeIndex - 1]); };

  const markAndNext = () => {
    if (!completedIds.has(activeLessonId)) completeMutation.mutate(activeLessonId);
    if (activeIndex < allLessons.length - 1) goTo(allLessons[activeIndex + 1]);
  };

  const handleFinish = () => {
    completeMutation.mutate(activeLessonId, {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ['progress', id] });
        qc.invalidateQueries({ queryKey: ['my-enrollments'] });
        if (data.data?.data?.percentage === 100) {
          setCourseCompleted(true);
        } else {
          router.push('/my-learning');
        }
      },
    });
  };

  if (sectionsLoading) {
    return <div className="flex justify-center items-center h-screen"><Spinner size="lg" /></div>;
  }

  if (!sections || (allLessons.length === 0 && courseQuizzes.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center py-16">
        <p className="text-gray-500 font-medium">No content available</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push(`/courses/${id}`)}>
          Back to Course
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      <Sidebar
        sections={sections ?? []}
        activeLessonId={activeLessonId}
        activeQuizId={activeQuizId}
        completedIds={completedIds}
        courseQuizzes={courseQuizzes}
        onSelect={goTo}
        onSelectQuiz={goToQuiz}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        courseId={id}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-100 px-5 py-2.5 flex items-center justify-between gap-4 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger – mobile only */}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0 transition-colors"
              aria-label="Toggle course menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => router.push(`/courses/${id}`)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex-shrink-0 transition-colors text-sm"
              title="Back to course"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline font-medium">Back</span>
            </button>
            <div className="h-5 w-px bg-gray-200 flex-shrink-0" />
            <p className="text-sm font-semibold text-gray-800 truncate">{course?.title}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${completionPct}%` }} />
              </div>
              <span className="text-xs font-bold text-primary-600">{completionPct}%</span>
            </div>
            <span className="text-xs text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100 font-medium">
              {completedIds.size}/{allLessons.length} done
            </span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Course-level quiz view */}
          {activeQuizId ? (
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm text-gray-400">Quiz</span>
              </div>
              <QuizUI quizId={activeQuizId} />
            </div>
          ) : activeLesson ? (
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
              {/* Lesson header */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Type pill */}
                  <span className={cn(
                    'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide',
                    activeLesson.type === 'video' ? 'bg-blue-100 text-blue-700'
                      : activeLesson.type === 'audio' ? 'bg-purple-100 text-purple-700'
                      : activeLesson.type === 'live' ? 'bg-emerald-100 text-emerald-700'
                      : activeLesson.type === 'quiz' ? 'bg-green-100 text-green-700'
                      : activeLesson.type === 'file' ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-600'
                  )}>
                    <span>{LESSON_ICON[activeLesson.type]}</span>
                    {activeLesson.type}
                  </span>
                  {activeLesson.isPreview && (
                    <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                      Free Preview
                    </span>
                  )}
                  {completedIds.has(activeLesson._id) && (
                    <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Completed
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-gray-900 leading-snug">{activeLesson.title}</h1>
                <div className="w-12 h-0.5 bg-primary-400 rounded-full" />
              </div>

              <LessonContent lesson={activeLesson} />

              {/* Discussion panel — only when enabled for this lesson */}
              {activeLesson.discussionEnabled && (
                <DiscussionPanel lessonId={activeLesson._id} />
              )}

              {/* Navigation bar */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                  disabled={activeIndex === 0}
                  onClick={goPrev}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    activeIndex === 0
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>
                <div className="flex items-center gap-2">
                  {!completedIds.has(activeLesson._id) && (
                    <Button size="sm" variant="outline" loading={completeMutation.isPending}
                      onClick={() => completeMutation.mutate(activeLessonId)}>
                      Mark Complete
                    </Button>
                  )}
                  {activeIndex < allLessons.length - 1 ? (
                    <Button size="sm" onClick={markAndNext} loading={completeMutation.isPending}>
                      {completedIds.has(activeLesson._id) ? 'Next Lesson' : 'Complete & Next'}
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Button>
                  ) : (
                    <Button size="sm" loading={completeMutation.isPending}
                      onClick={completedIds.has(activeLesson._id) ? () => setCourseCompleted(true) : handleFinish}>
                      {completedIds.has(activeLesson._id) ? 'View Certificate' : 'Finish Course'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400">Select a lesson to begin.</p>
            </div>
          )}
        </div>
      </div>

      {courseCompleted && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Course Completed!</h2>
            <p className="text-gray-500 mb-6">
              Congratulations on finishing <span className="font-medium text-gray-800">{course?.title}</span>. Your certificate is ready.
            </p>
            <div className="flex flex-col gap-3">
              <Button className="w-full" onClick={() => router.push(`/certificates/${id}`)}>
                🎓 View My Certificate
              </Button>
              <Button variant="outline" className="w-full" onClick={() => router.push('/my-learning')}>
                Go to My Learning
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
