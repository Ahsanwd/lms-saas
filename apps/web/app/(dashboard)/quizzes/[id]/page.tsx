'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { AxiosError } from 'axios';
import { formatDate, cn } from '@/lib/utils';
import type { QuestionType } from '@/types';

// ─── Local Types ──────────────────────────────────────────────────────────────

interface QuizQuestion {
  _id: string;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  options: Array<{ _id: string; text: string; isCorrect?: boolean }>;
  matchingPairs: Array<{ left: string; right: string }>;
  correctOrder?: string[];
  correctAnswer?: string;
  explanation?: string;
  points: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags?: string[];
  timeLimitSeconds?: number;
}

interface QuizSettings {
  timer: { enabled: boolean; durationMinutes: number };
  maxAttempts: number;
  passingScore: number;
  negativeMarking: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showCorrectAnswers: boolean;
  showExplanations: boolean;
  allowRetake: boolean;
  triggerCertificate: boolean;
}

interface QuizDetail {
  _id: string;
  title: string;
  description?: string;
  instructions?: string;
  status: 'draft' | 'published' | 'archived';
  gradingType: 'auto' | 'manual' | 'mixed';
  totalQuestions: number;
  totalPoints: number;
  attemptCount: number;
  settings: QuizSettings;
  questions: Array<{ questionId: QuizQuestion; order: number; points: number }>;
}

interface AttemptSummary {
  _id: string;
  status: 'in_progress' | 'submitted' | 'auto_graded' | 'manually_graded' | 'pending_manual';
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  attemptNumber: number;
  startedAt: string;
  submittedAt?: string;
  timeSpentSeconds?: number;
  userId?: { _id: string; firstName: string; lastName: string; email: string };
}

interface ActiveAttempt {
  _id: string;
  servedQuestions: Array<string | QuizQuestion>;
  startedAt: string;
}

// answer shape per question
type Answer =
  | { selectedOptionId: string }
  | { selectedOptionIds: string[] }
  | { textAnswer: string }
  | { orderingAnswer: string[] }
  | { matchingAnswer: Array<{ left: string; right: string }> };

type Answers = Record<string, Answer>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, 'default' | 'success' | 'danger'> = {
  draft: 'default', published: 'success', archived: 'danger',
};

function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
  let s = Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = () => { s = ((s * 1664525 + 1013904223) | 0) >>> 0; return s / 0x100000000; };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function resolveQuestions(quiz: QuizDetail, attempt: ActiveAttempt): QuizQuestion[] {
  const bank = Object.fromEntries(quiz.questions.map(q => [q.questionId._id, q.questionId]));
  const questions = attempt.servedQuestions.map(q =>
    typeof q === 'string' ? bank[q] : q
  ).filter(Boolean) as QuizQuestion[];

  if (!quiz.settings.shuffleOptions) return questions;
  return questions.map(q => {
    if (['multiple_choice', 'multiple_select', 'image'].includes(q.type) && (q.options?.length ?? 0) > 1) {
      return { ...q, options: shuffleWithSeed(q.options, attempt._id + q._id) };
    }
    return q;
  });
}

// ─── Question Renderer (student) ─────────────────────────────────────────────

interface QProps {
  question: QuizQuestion;
  index: number;
  answer: Answer | undefined;
  onChange: (a: Answer) => void;
  showResult?: boolean; // after submit, if showCorrectAnswers enabled
  earned?: number;      // points earned for this question
}

function QuestionRenderer({ question, index, answer, onChange, showResult, earned }: QProps) {
  const { type, text, options = [], matchingPairs = [] } = question;

  // shared label style
  const optLabel = (correct: boolean | undefined, selected: boolean) => {
    if (!showResult) return selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300';
    if (correct) return 'border-green-500 bg-green-50';
    if (selected && !correct) return 'border-red-400 bg-red-50';
    return 'border-gray-200';
  };

  // ordering state helpers — items come from correctOrder (shuffled by server), not options[]
  const orderedItems = (() => {
    const a = answer as { orderingAnswer?: string[] } | undefined;
    if (a?.orderingAnswer) return a.orderingAnswer;
    return question.correctOrder?.length ? [...question.correctOrder] : options.map(o => o.text);
  })();

  const moveItem = (from: number, to: number) => {
    const next = [...orderedItems];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange({ orderingAnswer: next });
  };

  // matching state helpers
  const matchingAnswer = ((answer as { matchingAnswer?: { left: string; right: string }[] } | undefined)?.matchingAnswer) ?? [];
  const getMatchedRight = (leftText: string) => matchingAnswer.find(p => p.left === leftText)?.right ?? '';

  const rightSides = matchingPairs.map(p => p.right);

  return (
    <div className="space-y-4">
      {/* Question header */}
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-sm font-semibold flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1">
          {question.imageUrl && (
            <img src={question.imageUrl} alt="" className="mb-3 rounded-lg max-h-48 object-contain" />
          )}
          <p className="text-sm font-medium text-gray-900 leading-relaxed">{text}</p>
          {showResult && earned !== undefined && (
            <span className="inline-block mt-1 text-xs text-gray-500">
              {earned} / {question.points} pts
            </span>
          )}
        </div>
      </div>

      {/* Multiple choice */}
      {(type === 'multiple_choice' || type === 'image') && (
        <div className="space-y-2 ml-10">
          {options.map((opt) => {
            const sel = (answer as { selectedOptionId?: string } | undefined)?.selectedOptionId === opt._id;
            return (
              <label key={opt._id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${optLabel(opt.isCorrect, sel)}`}>
                <input type="radio" className="accent-primary-600"
                  checked={sel} onChange={() => onChange({ selectedOptionId: opt._id })} />
                <span className="text-sm text-gray-800">{opt.text}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Multiple select */}
      {type === 'multiple_select' && (
        <div className="space-y-2 ml-10">
          {options.map((opt) => {
            const sels = (answer as { selectedOptionIds?: string[] } | undefined)?.selectedOptionIds ?? [];
            const sel = sels.includes(opt._id);
            return (
              <label key={opt._id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${optLabel(opt.isCorrect, sel)}`}>
                <input type="checkbox" className="accent-primary-600" checked={sel}
                  onChange={() => {
                    const next = sel ? sels.filter(x => x !== opt._id) : [...sels, opt._id];
                    onChange({ selectedOptionIds: next });
                  }} />
                <span className="text-sm text-gray-800">{opt.text}</span>
              </label>
            );
          })}
          <p className="text-xs text-gray-400 ml-1">Select all that apply.</p>
        </div>
      )}

      {/* True / False */}
      {type === 'true_false' && (
        <div className="flex gap-3 ml-10">
          {options.map((opt) => {
            const sel = (answer as { selectedOptionId?: string } | undefined)?.selectedOptionId === opt._id;
            return (
              <label key={opt._id}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  showResult
                    ? opt.isCorrect ? 'border-green-500 bg-green-50'
                      : sel ? 'border-red-400 bg-red-50'
                      : 'border-gray-200'
                    : sel ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <input type="radio" className="accent-primary-600"
                  checked={sel} onChange={() => onChange({ selectedOptionId: opt._id })} />
                <span className="text-sm font-medium text-gray-800">{opt.text}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Fill blank / Short answer */}
      {(type === 'fill_blank' || type === 'short_answer') && (
        <div className="ml-10">
          <input
            type="text"
            value={(answer as { textAnswer?: string } | undefined)?.textAnswer ?? ''}
            onChange={(e) => onChange({ textAnswer: e.target.value })}
            placeholder={type === 'fill_blank' ? 'Fill in the blank...' : 'Short answer...'}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      )}

      {/* Essay */}
      {type === 'essay' && (
        <div className="ml-10 space-y-1">
          <textarea
            rows={5}
            value={(answer as { textAnswer?: string } | undefined)?.textAnswer ?? ''}
            onChange={(e) => onChange({ textAnswer: e.target.value })}
            placeholder="Write your answer here..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <p className="text-xs text-gray-400">This answer requires manual grading.</p>
        </div>
      )}

      {/* Ordering */}
      {type === 'ordering' && (
        <div className="ml-10 space-y-2">
          <p className="text-xs text-gray-400 mb-1">Use arrows to arrange items in the correct order.</p>
          {orderedItems.map((itemText, pos) => (
            <div key={pos}
              className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-white">
              <span className="text-xs text-gray-400 w-5 text-center">{pos + 1}.</span>
              <span className="flex-1 text-sm text-gray-800">{itemText}</span>
              <div className="flex gap-1">
                <button disabled={pos === 0}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                  onClick={() => moveItem(pos, pos - 1)}>
                  <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button disabled={pos === orderedItems.length - 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                  onClick={() => moveItem(pos, pos + 1)}>
                  <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Matching */}
      {type === 'matching' && (
        <div className="ml-10 space-y-2">
          <p className="text-xs text-gray-400 mb-1">Match each item on the left with the correct item on the right.</p>
          {matchingPairs.map((pair) => (
            <div key={pair.left} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                {pair.left}
              </span>
              <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <select
                value={getMatchedRight(pair.left)}
                onChange={(e) => {
                  const updated = matchingAnswer.filter(p => p.left !== pair.left);
                  if (e.target.value) updated.push({ left: pair.left, right: e.target.value });
                  onChange({ matchingAnswer: updated });
                }}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">— Select —</option>
                {rightSides.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Explanation (shown after submit if enabled) */}
      {showResult && question.explanation && (
        <div className="ml-10 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
          <span className="font-medium">Explanation: </span>{question.explanation}
        </div>
      )}
    </div>
  );
}

// ─── Student: Info Screen ─────────────────────────────────────────────────────

function QuizInfoScreen({
  quiz,
  myAttempts,
  onStart,
  starting,
  startError,
  isPreview = false,
}: {
  quiz: QuizDetail;
  myAttempts: AttemptSummary[];
  onStart: () => void;
  starting: boolean;
  startError: string;
  isPreview?: boolean;
}) {
  const { settings } = quiz;
  const completedAttempts = myAttempts.filter(a =>
    ['auto_graded', 'manually_graded', 'pending_manual'].includes(a.status)
  );
  const inProgress = myAttempts.find(a => a.status === 'in_progress');
  const attemptsLeft = settings.maxAttempts > 0
    ? Math.max(0, settings.maxAttempts - completedAttempts.length)
    : Infinity;
  const canStart = (isPreview || quiz.status === 'published') &&
    (isPreview || attemptsLeft > 0 || settings.allowRetake) &&
    !inProgress;

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Quiz card */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{quiz.title}</h1>
            {quiz.description && <p className="text-sm text-gray-500 mt-1">{quiz.description}</p>}
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Questions</p>
              <p className="font-semibold text-gray-900">{quiz.totalQuestions}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Total Points</p>
              <p className="font-semibold text-gray-900">{quiz.totalPoints}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Passing Score</p>
              <p className="font-semibold text-gray-900">{settings.passingScore}%</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Time Limit</p>
              <p className="font-semibold text-gray-900">
                {settings.timer?.enabled ? `${settings.timer.durationMinutes} min` : 'Unlimited'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Max Attempts</p>
              <p className="font-semibold text-gray-900">
                {settings.maxAttempts > 0 ? settings.maxAttempts : 'Unlimited'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Grading</p>
              <p className="font-semibold text-gray-900 capitalize">{quiz.gradingType}</p>
            </div>
          </div>

          {quiz.instructions && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-4 py-3 text-sm text-yellow-800">
              <p className="font-medium mb-1">Instructions</p>
              <p className="whitespace-pre-line">{quiz.instructions}</p>
            </div>
          )}

          {startError && <Alert variant="error">{startError}</Alert>}

          {inProgress ? (
            <Button className="w-full" loading={starting} onClick={onStart}>
              Continue Attempt
            </Button>
          ) : canStart ? (
            <Button className="w-full" loading={starting} onClick={onStart}>
              {completedAttempts.length > 0 ? 'Retake Quiz' : 'Start Quiz'}
            </Button>
          ) : (
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700 text-center">
              {quiz.status !== 'published'
                ? 'This quiz is not available.'
                : 'You have used all available attempts.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past attempts */}
      {completedAttempts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Past Attempts</h2>
          {completedAttempts.map((a, i) => (
            <div key={a._id}
              className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Attempt {a.attemptNumber ?? (i + 1)}</p>
                <p className="text-xs text-gray-400">{formatDate(a.submittedAt ?? a.startedAt)}</p>
              </div>
              {a.status === 'pending_manual' ? (
                <Badge variant="warning">Pending grading</Badge>
              ) : (
                <>
                  <span className="text-sm font-semibold text-gray-900">{a.percentage}%</span>
                  <Badge variant={a.passed ? 'success' : 'danger'}>
                    {a.passed ? 'Passed' : 'Failed'}
                  </Badge>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Student: Taking Screen ───────────────────────────────────────────────────

function QuizTakingScreen({
  quiz,
  questions,
  attempt: _attempt,
  onSubmit,
  submitting,
  submitError,
}: {
  quiz: QuizDetail;
  questions: QuizQuestion[];
  attempt: ActiveAttempt;
  onSubmit: (answers: Answers) => void;
  submitting: boolean;
  submitError: string;
}) {
  const [current, setCurrent]     = useState(0);
  const [answers, setAnswers]     = useState<Answers>({});
  const [flagged, setFlagged]     = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft]   = useState<number | null>(
    quiz.settings.timer?.enabled ? quiz.settings.timer.durationMinutes * 60 : null
  );
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [tabSwitches, setTabSwitches]   = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [qTimeLeft, setQTimeLeft]       = useState<number | null>(null);

  const toggleFlag = (id: string) =>
    setFlagged(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const handleSubmit = useCallback(() => onSubmit(answers), [answers, onSubmit]);

  // Quiz-level timer countdown
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) { handleSubmit(); return; }
    const id = setTimeout(() => setTimeLeft(t => (t ?? 1) - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, handleSubmit]);

  // Per-question timer: reset when question changes
  useEffect(() => {
    const q = questions[current];
    if (!q || !q.timeLimitSeconds || q.timeLimitSeconds <= 0) { setQTimeLeft(null); return; }
    setQTimeLeft(q.timeLimitSeconds);
  }, [current, questions]);

  // Per-question timer countdown
  useEffect(() => {
    if (qTimeLeft === null) return;
    if (qTimeLeft <= 0) {
      // Auto-advance or submit on last question
      if (current < questions.length - 1) setCurrent(c => c + 1);
      else handleSubmit();
      return;
    }
    const id = setTimeout(() => setQTimeLeft(t => (t ?? 1) - 1), 1000);
    return () => clearTimeout(id);
  }, [qTimeLeft, current, questions.length, handleSubmit]);

  // Tab-switch detection
  useEffect(() => {
    const MAX_VIOLATIONS = 3;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitches(n => {
          const next = n + 1;
          if (next >= MAX_VIOLATIONS) {
            handleSubmit();
          } else {
            setShowTabWarning(true);
          }
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleSubmit]);

  const q = questions[current];
  if (!q) return null;

  const answeredCount = Object.keys(answers).length;
  const unanswered   = questions.length - answeredCount;
  const flaggedCount = flagged.size;
  const pct          = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{quiz.title}</p>
            <p className="text-xs text-gray-400">{answeredCount} of {questions.length} answered</p>
          </div>
          {qTimeLeft !== null && (
            <div className={`flex items-center gap-1.5 text-xs font-mono font-semibold px-2.5 py-1 rounded-lg ${
              qTimeLeft < 10 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-700'
            }`}>
              Q {fmtSecs(qTimeLeft)}
            </div>
          )}
          {timeLeft !== null && (
            <div className={`flex items-center gap-1.5 text-sm font-mono font-semibold px-3 py-1 rounded-lg ${
              timeLeft < 60 ? 'bg-red-50 text-red-600' : timeLeft < 300 ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-100 text-gray-700'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {fmtSecs(timeLeft)}
            </div>
          )}
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className="bg-primary-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Question navigator */}
      <div className="flex flex-wrap gap-1.5">
        {questions.map((qn, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
              i === current           ? 'bg-primary-600 text-white' :
              flagged.has(qn._id)    ? 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300' :
              answers[qn._id]        ? 'bg-primary-100 text-primary-700' :
                                       'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {i + 1}
          </button>
        ))}
      </div>

      {/* Current question */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs text-gray-400">Question {current + 1} of {questions.length}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
              <button
                onClick={() => toggleFlag(q._id)}
                title={flagged.has(q._id) ? 'Remove flag' : 'Flag for review'}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                  flagged.has(q._id) ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600'
                }`}>
                <svg className="w-3.5 h-3.5" fill={flagged.has(q._id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6H11l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                </svg>
                {flagged.has(q._id) ? 'Flagged' : 'Flag'}
              </button>
            </div>
          </div>
          <QuestionRenderer
            question={q}
            index={current}
            answer={answers[q._id]}
            onChange={(a) => setAnswers(prev => ({ ...prev, [q._id]: a }))}
          />
        </CardContent>
      </Card>

      {submitError && <Alert variant="error">{submitError}</Alert>}

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => handleSubmit()}
          className="text-gray-400 hover:text-gray-600 text-xs">
          Save & Exit
        </Button>
        <Button variant="outline" disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>
          Previous
        </Button>
        {current < questions.length - 1 ? (
          <Button className="flex-1" onClick={() => setCurrent(c => c + 1)}>Next</Button>
        ) : (
          <Button className="flex-1" onClick={() => setShowSubmitConfirm(true)}>Review & Submit</Button>
        )}
      </div>

      {/* Tab-switch warning modal */}
      {showTabWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900">Tab switch detected</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Leaving the quiz window is not allowed. This is violation{' '}
              <span className="font-semibold text-red-600">{tabSwitches} of 3</span>.
              After 3 violations your quiz will be auto-submitted.
            </p>
            <Button className="w-full" onClick={() => setShowTabWarning(false)}>
              Return to Quiz
            </Button>
          </div>
        </div>
      )}

      {/* Submit confirm modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Submit Quiz?</h3>
            <div className="space-y-2 mb-4">
              {unanswered > 0 && (
                <p className="text-sm text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2">
                  {unanswered} unanswered question{unanswered !== 1 ? 's' : ''}.
                </p>
              )}
              {flaggedCount > 0 && (
                <p className="text-sm text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2">
                  {flaggedCount} flagged question{flaggedCount !== 1 ? 's' : ''} — review before submitting?
                </p>
              )}
              {unanswered === 0 && flaggedCount === 0 && (
                <p className="text-sm text-gray-500">All questions answered. Ready to submit?</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSubmitConfirm(false)}>Go Back</Button>
              <Button loading={submitting} onClick={handleSubmit}>Submit Quiz</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Student: Result Screen ───────────────────────────────────────────────────

function QuizResultScreen({
  quiz,
  result,
  onRetake,
  canRetake,
  submittedAnswers = {},
  submittedQuestions = [],
}: {
  quiz: QuizDetail;
  result: AttemptSummary;
  onRetake: () => void;
  canRetake: boolean;
  submittedAnswers?: Answers;
  submittedQuestions?: QuizQuestion[];
}) {
  const pending = result.status === 'pending_manual';
  const showReview = quiz.settings.showCorrectAnswers && submittedQuestions.length > 0;

  // Determine if a given answer is correct (for auto-gradable types only)
  const isCorrect = (q: QuizQuestion, ans: Answer | undefined): boolean | null => {
    if (!ans) return false;
    const a = ans as any;
    switch (q.type) {
      case 'multiple_choice':
      case 'image':
      case 'true_false': {
        const opt = q.options.find(o => o._id === a.selectedOptionId);
        return opt ? opt.isCorrect === true : false;
      }
      case 'multiple_select': {
        const sels = new Set<string>(a.selectedOptionIds ?? []);
        const correctIds = new Set(q.options.filter(o => o.isCorrect).map(o => o._id));
        return sels.size === correctIds.size && Array.from(correctIds).every(id => sels.has(id));
      }
      case 'fill_blank': {
        const expected = (q.correctAnswer ?? '').trim().toLowerCase();
        const given = (a.textAnswer ?? '').trim().toLowerCase();
        return expected.length > 0 && given === expected;
      }
      case 'short_answer': {
        const expected = (q.correctAnswer ?? '').trim().toLowerCase();
        const given = (a.textAnswer ?? '').trim().toLowerCase();
        return expected.length > 0 && given.includes(expected);
      }
      default: return null; // complex or essay — no client-side verdict
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Score card */}
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          {pending ? (
            <>
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Submitted!</h2>
              <p className="text-sm text-gray-500">
                This quiz includes questions that require manual grading.
                You will be notified once grading is complete.
              </p>
              <Badge variant="warning">Pending Manual Grading</Badge>
            </>
          ) : (
            <>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${result.passed ? 'bg-green-100' : 'bg-red-100'}`}>
                {result.passed ? (
                  <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-4xl font-bold text-gray-900">{result.percentage}%</p>
                <p className="text-sm text-gray-400 mt-1">{result.score} / {result.maxScore} points</p>
              </div>
              <Badge variant={result.passed ? 'success' : 'danger'} className="text-sm px-4 py-1">
                {result.passed ? 'Passed' : 'Failed'}
              </Badge>
              <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-400 mb-0.5">Required</p>
                  <p className="font-semibold text-gray-900">{quiz.settings.passingScore}%</p>
                </div>
                {result.timeSpentSeconds !== undefined && (
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <p className="text-xs text-gray-400 mb-0.5">Time Spent</p>
                    <p className="font-semibold text-gray-900">{fmtSecs(result.timeSpentSeconds)}</p>
                  </div>
                )}
              </div>
            </>
          )}
          {canRetake && (
            <Button variant="outline" onClick={onRetake} className="mt-2">Retake Quiz</Button>
          )}
        </CardContent>
      </Card>

      {/* Per-question review */}
      {showReview && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Answer Review</h2>
          {submittedQuestions.map((q, i) => {
            const ans = submittedAnswers[q._id];
            const verdict = isCorrect(q, ans);
            const isManual = q.type === 'essay';

            return (
              <div key={q._id} className={`bg-white rounded-xl border px-5 py-4 space-y-3 ${
                verdict === true ? 'border-green-200' : verdict === false ? 'border-red-200' : 'border-gray-200'
              }`}>
                {/* Question header */}
                <div className="flex items-start gap-3">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5 ${
                    verdict === true  ? 'bg-green-100 text-green-700' :
                    verdict === false ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-relaxed">{q.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {verdict === true  && <span className="text-xs text-green-600 font-medium">✓ Correct</span>}
                      {verdict === false && <span className="text-xs text-red-500 font-medium">✗ Incorrect</span>}
                      {isManual         && <span className="text-xs text-amber-600 font-medium">Manually graded</span>}
                      {verdict === null && !isManual && <span className="text-xs text-gray-400">—</span>}
                      <span className="text-xs text-gray-400">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Student's answer */}
                <div className="ml-9 text-sm space-y-2">
                  {(q.type === 'multiple_choice' || q.type === 'image' || q.type === 'true_false') && (
                    <div className="space-y-1">
                      {q.options.map((opt) => {
                        const sel = (ans as any)?.selectedOptionId === opt._id;
                        return (
                          <div key={opt._id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                            opt.isCorrect ? 'bg-green-50 text-green-800' :
                            sel ? 'bg-red-50 text-red-700' : 'text-gray-500'
                          }`}>
                            <span>{sel ? '●' : '○'}</span>
                            <span>{opt.text}</span>
                            {opt.isCorrect && <span className="ml-auto text-xs text-green-600 font-medium">correct</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === 'multiple_select' && (
                    <div className="space-y-1">
                      {q.options.map((opt) => {
                        const sels: string[] = (ans as any)?.selectedOptionIds ?? [];
                        const sel = sels.includes(opt._id);
                        return (
                          <div key={opt._id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                            opt.isCorrect ? 'bg-green-50 text-green-800' :
                            sel ? 'bg-red-50 text-red-700' : 'text-gray-500'
                          }`}>
                            <span>{sel ? '☑' : '☐'}</span>
                            <span>{opt.text}</span>
                            {opt.isCorrect && <span className="ml-auto text-xs text-green-600 font-medium">correct</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(q.type === 'fill_blank' || q.type === 'short_answer') && (
                    <div className="space-y-1">
                      <div className={`px-3 py-2 rounded-lg text-sm ${verdict === false ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
                        Your answer: {(ans as any)?.textAnswer || <em className="text-gray-400">No answer</em>}
                      </div>
                      {q.type === 'fill_blank' && q.correctAnswer && verdict !== true && (
                        <div className="px-3 py-2 rounded-lg bg-green-50 text-green-800 text-sm">
                          Correct answer: {q.correctAnswer}
                        </div>
                      )}
                    </div>
                  )}

                  {q.type === 'essay' && (
                    <div className="px-3 py-2 rounded-lg bg-gray-50 text-gray-700 text-sm whitespace-pre-wrap">
                      {(ans as any)?.textAnswer || <em className="text-gray-400">No answer provided</em>}
                    </div>
                  )}

                  {q.type === 'matching' && (
                    <div className="space-y-1">
                      {q.matchingPairs.map((pair) => {
                        const ma: { left: string; right: string }[] = (ans as any)?.matchingAnswer ?? [];
                        const chosen = ma.find(p => p.left === pair.left)?.right;
                        const correct = chosen?.trim().toLowerCase() === pair.right.trim().toLowerCase();
                        return (
                          <div key={pair.left} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${correct ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                            <span>{pair.left}</span>
                            <span className="text-gray-400">→</span>
                            <span>{chosen ?? '—'}</span>
                            {!correct && <span className="ml-auto text-xs">(correct: {pair.right})</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === 'ordering' && (
                    <div className="space-y-1">
                      {((ans as any)?.orderingAnswer ?? q.correctOrder ?? []).map((item: string, pos: number) => (
                        <div key={pos} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-gray-50 text-gray-700">
                          <span className="text-gray-400 w-4">{pos + 1}.</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Explanation */}
                  {quiz.settings.showExplanations && q.explanation && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-800">
                      <span className="font-medium">Explanation: </span>{q.explanation}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Student View (state machine) ────────────────────────────────────────────

function StudentView({ isPreview = false }: { isPreview?: boolean }) {
  const params = useParams();
  const router = useRouter();
  const quizId = params.id as string;

  type Phase = 'info' | 'taking' | 'result';
  const [phase, setPhase]                     = useState<Phase>('info');
  const [activeAttempt, setActiveAttempt]     = useState<ActiveAttempt | null>(null);
  const [latestResult, setLatestResult]       = useState<AttemptSummary | null>(null);
  const [submittedAnswers, setSubmittedAnswers] = useState<Answers>({});
  const [submittedQuestions, setSubmittedQuestions] = useState<QuizQuestion[]>([]);
  const [startError, setStartError]           = useState('');
  const [submitError, setSubmitError]         = useState('');

  const { data: quiz, isLoading: quizLoading } = useQuery({
    queryKey: ['quiz', quizId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${quizId}`);
      return data.data.quiz as QuizDetail;
    },
  });

  const { data: myAttempts = [], refetch: refetchAttempts } = useQuery({
    queryKey: ['my-attempts', quizId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${quizId}/attempts/my`);
      return data.data.attempts as AttemptSummary[];
    },
    enabled: !!quiz,
  });

  const startMutation = useMutation({
    mutationFn: () => api.post(`/quizzes/${quizId}/attempt`),
    onSuccess: (res) => {
      setActiveAttempt(res.data.data.attempt);
      setStartError('');
      setPhase('taking');
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setStartError(err.response?.data?.message ?? 'Failed to start quiz');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (payload: { attemptId: string; answers: object[] }) =>
      api.post(`/quizzes/${quizId}/attempt/submit`, payload),
    onSuccess: (res) => {
      const result = res.data.data.attempt as AttemptSummary;
      setLatestResult(result);
      setSubmitError('');
      setPhase('result');
      refetchAttempts();
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setSubmitError(err.response?.data?.message ?? 'Submission failed');
    },
  });

  const handleStart = () => startMutation.mutate();

  const handleSubmit = (answers: Answers) => {
    if (!activeAttempt) return;
    setSubmittedAnswers(answers);
    setSubmittedQuestions(questions);
    const answersArr = Object.entries(answers).map(([questionId, ans]) => ({
      questionId,
      ...ans,
    }));
    submitMutation.mutate({ attemptId: activeAttempt._id, answers: answersArr });
  };

  const handleRetake = () => {
    setActiveAttempt(null);
    setLatestResult(null);
    setSubmittedAnswers({});
    setSubmittedQuestions([]);
    setPhase('info');
  };

  if (quizLoading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (!quiz) return (
    <div className="flex flex-col items-center justify-center py-24">
      <p className="text-gray-500">Quiz not found.</p>
      <Button className="mt-4" variant="outline" onClick={() => router.push('/quizzes')}>Back</Button>
    </div>
  );

  const completedAttempts = myAttempts.filter(a =>
    ['auto_graded', 'manually_graded', 'pending_manual'].includes(a.status)
  );
  const attemptsLeft = quiz.settings.maxAttempts > 0
    ? Math.max(0, quiz.settings.maxAttempts - completedAttempts.length)
    : Infinity;
  const canRetake = quiz.status === 'published' &&
    quiz.settings.allowRetake && (attemptsLeft > 0 || quiz.settings.maxAttempts === 0);

  const questions = activeAttempt && quiz ? resolveQuestions(quiz, activeAttempt) : [];

  return (
    <div className="p-4 sm:p-6">
      {isPreview && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span className="text-sm text-amber-800 font-medium">Preview Mode — you are viewing this quiz as a student would see it</span>
          <button
            onClick={() => router.push(`/quizzes/${quizId}`)}
            className="ml-auto text-xs text-amber-700 hover:text-amber-900 font-medium underline flex-shrink-0"
          >
            Exit Preview
          </button>
        </div>
      )}

      <div className="mb-5">
        <button onClick={() => router.push(isPreview ? `/quizzes/${quizId}` : '/quizzes')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {isPreview ? 'Exit Preview' : 'Back to Quizzes'}
        </button>
      </div>

      {phase === 'info' && (
        <QuizInfoScreen
          quiz={quiz}
          myAttempts={myAttempts}
          onStart={handleStart}
          starting={startMutation.isPending}
          startError={startError}
          isPreview={isPreview}
        />
      )}
      {phase === 'taking' && activeAttempt && (
        <QuizTakingScreen
          quiz={quiz}
          questions={questions}
          attempt={activeAttempt}
          onSubmit={handleSubmit}
          submitting={submitMutation.isPending}
          submitError={submitError}
        />
      )}
      {phase === 'result' && latestResult && (
        <QuizResultScreen
          quiz={quiz}
          result={latestResult}
          onRetake={handleRetake}
          canRetake={canRetake}
          submittedAnswers={submittedAnswers}
          submittedQuestions={submittedQuestions}
        />
      )}
    </div>
  );
}

// ─── Instructor: Settings Tab ─────────────────────────────────────────────────

function SettingsTab({ quizId, quiz }: { quizId: string; quiz: QuizDetail }) {
  const qc = useQueryClient();
  const s = quiz.settings;
  const [description, setDescription]   = useState(quiz.description ?? '');
  const [instructions, setInstructions] = useState(quiz.instructions ?? '');
  const [maxAttempts, setMaxAttempts] = useState(String(s.maxAttempts));
  const [passingScore, setPassingScore] = useState(String(s.passingScore));
  const [timerEnabled, setTimerEnabled] = useState(s.timer?.enabled ?? false);
  const [timerMins, setTimerMins] = useState(String(s.timer?.durationMinutes ?? 30));
  const [negativeMarking, setNegativeMarking] = useState(s.negativeMarking);
  const [shuffleQuestions, setShuffleQuestions] = useState(s.shuffleQuestions);
  const [shuffleOptions, setShuffleOptions] = useState(s.shuffleOptions);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(s.showCorrectAnswers);
  const [showExplanations, setShowExplanations] = useState(s.showExplanations);
  const [allowRetake, setAllowRetake] = useState(s.allowRetake);
  const [triggerCertificate, setTriggerCertificate] = useState(s.triggerCertificate ?? false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: object) => api.patch(`/quizzes/${quizId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz', quizId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to save'),
  });

  const handleSave = () => {
    setError('');
    mutation.mutate({
      description: description.trim() || undefined,
      instructions: instructions.trim() || undefined,
      maxAttempts: parseInt(maxAttempts) || 1,
      passingScore: parseInt(passingScore) || 70,
      negativeMarking,
      shuffleQuestions,
      shuffleOptions,
      showCorrectAnswers,
      showExplanations,
      allowRetake,
      triggerCertificate,
      timer: { enabled: timerEnabled, durationMinutes: parseInt(timerMins) || 30 },
    });
  };

  const Toggle = ({ label, desc, val, set }: { label: string; desc?: string; val: boolean; set: (v: boolean) => void }) => (
    <div
      onClick={() => set(!val)}
      className="flex items-center justify-between py-3.5 px-1 cursor-pointer group"
    >
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-gray-800 group-hover:text-gray-900">{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <div className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${val ? 'bg-primary-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${val ? 'translate-x-5' : ''}`} />
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-5">
      {error && <Alert variant="error">{error}</Alert>}

      {/* ── Quiz Info ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Quiz Info</h3>
            <p className="text-xs text-gray-400">Visible to students before they start</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What is this quiz about?"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50 placeholder:text-gray-300 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Instructions
              <span className="ml-2 normal-case text-gray-400 font-normal">shown in a notice box before students start</span>
            </label>
            <textarea rows={3} value={instructions} onChange={e => setInstructions(e.target.value)}
              placeholder="e.g. Read each question carefully. You have one attempt."
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50 placeholder:text-gray-300 resize-none" />
          </div>
        </div>
      </div>

      {/* ── Attempt & Scoring ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Attempt & Scoring</h3>
            <p className="text-xs text-gray-400">Control how students attempt and pass</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Max Attempts</label>
              <input type="number" min={0} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)}
                className="w-full px-3 py-2 text-sm font-semibold text-gray-800 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white" />
              <p className="text-xs text-gray-400 mt-1.5">0 = unlimited</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Passing Score</label>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={100} value={passingScore} onChange={(e) => setPassingScore(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm font-semibold text-gray-800 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white" />
                <span className="text-sm font-medium text-gray-500">%</span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Minimum to pass</p>
            </div>
          </div>

          {/* Timer */}
          <div className={`rounded-xl border p-4 transition-colors ${timerEnabled ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setTimerEnabled(v => !v)}>
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${timerEnabled ? 'bg-amber-200' : 'bg-gray-200'}`}>
                  <svg className={`w-4 h-4 ${timerEnabled ? 'text-amber-700' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Timer</p>
                  <p className="text-xs text-gray-400">Limit time allowed per attempt</p>
                </div>
              </div>
              <div className={`relative w-11 h-6 rounded-full transition-colors ${timerEnabled ? 'bg-amber-500' : 'bg-gray-200'}`}>
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${timerEnabled ? 'translate-x-5' : ''}`} />
              </div>
            </div>
            {timerEnabled && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-amber-200">
                <input type="number" min={1} value={timerMins} onChange={(e) => setTimerMins(e.target.value)}
                  className="w-24 px-3 py-2 text-sm font-semibold border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                <span className="text-sm text-amber-700 font-medium">minutes per attempt</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Behaviour ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Behaviour</h3>
            <p className="text-xs text-gray-400">Control quiz experience and feedback</p>
          </div>
        </div>
        <div className="px-6 divide-y divide-gray-50">
          <Toggle label="Shuffle Questions" desc="Randomise question order for each student" val={shuffleQuestions} set={setShuffleQuestions} />
          <Toggle label="Shuffle Options" desc="Randomise answer options order" val={shuffleOptions} set={setShuffleOptions} />
          <Toggle label="Negative Marking" desc="Deduct marks for wrong answers" val={negativeMarking} set={setNegativeMarking} />
          <Toggle label="Show Correct Answers" desc="Reveal correct answers after submission" val={showCorrectAnswers} set={setShowCorrectAnswers} />
          <Toggle label="Show Explanations" desc="Show question explanations after submission" val={showExplanations} set={setShowExplanations} />
          <Toggle label="Allow Retake" desc="Students can retake within attempt limit" val={allowRetake} set={setAllowRetake} />
          <Toggle label="Issue Certificate on Pass" desc="Auto-generate certificate when student passes" val={triggerCertificate} set={setTriggerCertificate} />
        </div>
      </div>

      {/* ── Save ── */}
      <div className="flex items-center justify-between pt-1">
        {saved ? (
          <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Settings saved
          </span>
        ) : <span />}
        <Button loading={mutation.isPending} onClick={handleSave} className="px-6">
          Save Settings
        </Button>
      </div>
    </div>
  );
}

// ─── Instructor: Questions Tab ─────────────────────────────────────────────────

function QuestionBankModal({
  quizId,
  currentIds,
  onClose,
  onAdded,
}: {
  quizId: string;
  currentIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['question-bank', search, typeFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: '50' });
      if (search) p.set('search', search);
      if (typeFilter) p.set('type', typeFilter);
      const { data } = await api.get(`/quizzes/questions?${p}`);
      return data.data.questions as QuizQuestion[];
    },
  });

  const addMutation = useMutation({
    mutationFn: (questionIds: string[]) => {
      const all = [...currentIds, ...questionIds].map((id, i) => ({ questionId: id, order: i }));
      return api.put(`/quizzes/${quizId}/questions`, { questions: all });
    },
    onSuccess: () => { onAdded(); onClose(); },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to add questions'),
  });

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const available = (data ?? []).filter(q => !currentIds.includes(q._id));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Add from Question Bank</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex gap-2 flex-shrink-0">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
            <option value="">All Types</option>
            {['multiple_choice','multiple_select','true_false','fill_blank','short_answer','essay','matching','ordering','image'].map(t => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : available.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No questions found.</div>
          ) : (
            available.map(q => (
              <label key={q._id}
                className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(q._id)}
                  onChange={() => toggle(q._id)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 line-clamp-2">{q.text}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="default">{q.type.replace('_', ' ')}</Badge>
                    <span className="text-xs text-gray-400">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-gray-400 capitalize">{q.difficulty}</span>
                  </div>
                </div>
              </label>
            ))
          )}
        </div>

        {error && <Alert variant="error" className="mx-5 mb-2">{error}</Alert>}

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={addMutation.isPending}
            disabled={selected.size === 0}
            onClick={() => addMutation.mutate(Array.from(selected))}
          >
            Add {selected.size > 0 ? `(${selected.size})` : ''} Questions
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Question Modal ─────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard';

interface OptionRow { text: string; isCorrect: boolean; }
interface PairRow  { left: string; right: string; }

function CreateQuestionModal({
  quizId,
  currentIds,
  onClose,
  onCreated,
  initialData,
}: {
  quizId: string;
  currentIds: string[];
  onClose: () => void;
  onCreated: () => void;
  initialData?: QuizQuestion;
}) {
  const isEdit = !!initialData;
  const qc = useQueryClient();
  const [qType, setQType]         = useState<QuestionType>(initialData?.type ?? 'multiple_choice');
  const [text, setText]           = useState(initialData?.text ?? '');
  const [points, setPoints]       = useState(initialData?.points ?? 1);
  const [difficulty, setDiff]     = useState<Difficulty>((initialData?.difficulty as Difficulty) ?? 'medium');
  const [explanation, setExpl]    = useState(initialData?.explanation ?? '');
  const [options, setOptions]     = useState<OptionRow[]>(() => {
    if (initialData?.options?.length) return initialData.options.map(o => ({ text: o.text, isCorrect: o.isCorrect ?? false }));
    return [{ text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }];
  });
  const [pairs, setPairs]         = useState<PairRow[]>(() =>
    initialData?.matchingPairs?.length ? initialData.matchingPairs : [{ left: '', right: '' }, { left: '', right: '' }]
  );
  const [orderItems, setOrder]    = useState<string[]>(() =>
    initialData?.correctOrder?.length
      ? [...initialData.correctOrder]
      : ['', '', '']
  );
  const [correctText, setCorrectText] = useState(initialData?.correctAnswer ?? '');
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(initialData?.timeLimitSeconds ?? 0);
  const [error, setError]         = useState('');

  // ── option helpers ──────────────────────────────────────────────────────────
  const setOptText  = (i: number, val: string) =>
    setOptions(o => o.map((x, idx) => idx === i ? { ...x, text: val } : x));
  const toggleCorrect = (i: number, multi: boolean) =>
    setOptions(o => o.map((x, idx) =>
      multi ? (idx === i ? { ...x, isCorrect: !x.isCorrect } : x)
            : { ...x, isCorrect: idx === i }));
  const addOption = () => setOptions(o => [...o, { text: '', isCorrect: false }]);
  const removeOption = (i: number) => setOptions(o => o.filter((_, idx) => idx !== i));

  // ── pair helpers ────────────────────────────────────────────────────────────
  const setPairField = (i: number, side: 'left' | 'right', val: string) =>
    setPairs(p => p.map((x, idx) => idx === i ? { ...x, [side]: val } : x));
  const addPair = () => setPairs(p => [...p, { left: '', right: '' }]);
  const removePair = (i: number) => setPairs(p => p.filter((_, idx) => idx !== i));

  // ── order helpers ───────────────────────────────────────────────────────────
  const setOrderItem = (i: number, val: string) =>
    setOrder(o => o.map((x, idx) => idx === i ? val : x));
  const addOrderItem = () => setOrder(o => [...o, '']);
  const removeOrderItem = (i: number) => setOrder(o => o.filter((_, idx) => idx !== i));

  // ── build payload ───────────────────────────────────────────────────────────
  const buildPayload = () => {
    const base = { type: qType, text: text.trim(), points, difficulty, explanation: explanation.trim() || undefined, timeLimitSeconds: timeLimitSeconds > 0 ? timeLimitSeconds : 0 };
    switch (qType) {
      case 'multiple_choice':
      case 'image':
        return { ...base, options: options.filter(o => o.text.trim()) };
      case 'multiple_select':
        return { ...base, options: options.filter(o => o.text.trim()) };
      case 'true_false':
        return { ...base, options: [
          { text: 'True',  isCorrect: options[0]?.isCorrect ?? false },
          { text: 'False', isCorrect: !(options[0]?.isCorrect ?? false) },
        ]};
      case 'fill_blank':
        return { ...base, correctAnswer: correctText.trim() };
      case 'short_answer':
      case 'essay':
        return base;
      case 'matching':
        return { ...base, matchingPairs: pairs.filter(p => p.left.trim() && p.right.trim()) };
      case 'ordering':
        return { ...base, correctOrder: orderItems.filter(x => x.trim()) };
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit && initialData) {
        // Edit: PATCH the question in the bank — no need to re-PUT the quiz
        await api.patch(`/quizzes/questions/${initialData._id}`, buildPayload());
      } else {
        // Create: POST to bank then add to this quiz
        const res = await api.post('/quizzes/questions', buildPayload());
        const newId: string = res.data.data.question._id;
        const all = [...currentIds, newId].map((id, i) => ({ questionId: id, order: i }));
        await api.put(`/quizzes/${quizId}/questions`, { questions: all });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz', quizId] });
      qc.invalidateQueries({ queryKey: ['question-bank'] });
      onCreated();
      onClose();
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? (isEdit ? 'Failed to update question' : 'Failed to create question')),
  });

  const TYPE_OPTIONS: { value: QuestionType; label: string; emoji: string }[] = [
    { value: 'multiple_choice', label: 'Multiple Choice', emoji: '🔘' },
    { value: 'multiple_select', label: 'Multi-Select',    emoji: '☑️' },
    { value: 'true_false',      label: 'True / False',    emoji: '✅' },
    { value: 'fill_blank',      label: 'Fill in Blank',   emoji: '✏️' },
    { value: 'short_answer',    label: 'Short Answer',    emoji: '📝' },
    { value: 'essay',           label: 'Essay',           emoji: '📄' },
    { value: 'matching',        label: 'Matching',        emoji: '🔗' },
    { value: 'ordering',        label: 'Ordering',        emoji: '🔢' },
    { value: 'image',           label: 'Image Choice',    emoji: '🖼️' },
  ];

  const TYPE_INFO: Record<QuestionType, { you: string; student: string }> = {
    multiple_choice: { you: 'Add answer options and select the one correct answer (radio button).', student: 'Picks exactly one answer from the list.' },
    multiple_select: { you: 'Add options and check every correct answer — multiple can be right.', student: 'Checks all options they believe are correct.' },
    true_false:      { you: 'Choose whether the statement is True or False.', student: 'Clicks the True or False button.' },
    fill_blank:      { you: 'Write the expected word/phrase that fills the blank. Use ___ in the question text to mark the blank.', student: 'Sees the question with a blank and types their answer.' },
    short_answer:    { you: 'No correct answer to set — you review and grade responses manually.', student: 'Types a short text answer in a small text box.' },
    essay:           { you: 'No correct answer to set — you review and grade responses manually.', student: 'Writes a long essay in a large text area.' },
    matching:        { you: 'Enter pairs: Prompt on the left ↔ Correct match on the right.', student: 'Sees the left column and picks the right match from a dropdown for each row.' },
    ordering:        { you: 'Enter items in the CORRECT order from top to bottom. Students will see them shuffled.', student: 'Sees items in random order and uses ▲▼ buttons to rearrange them.' },
    image:           { you: 'Add image URLs as options (one URL per option) and mark the correct one.', student: 'Sees each option displayed as an image card in a 2-column grid, then clicks to select.' },
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">{isEdit ? 'Edit Question' : 'Create New Question'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-5 space-y-5">
          {error && <Alert variant="error">{error}</Alert>}

          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Question Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(t => (
                <button key={t.value} type="button"
                  onClick={() => { setQType(t.value); setError(''); }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors',
                    qType === t.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  )}>
                  <span>{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
            {/* How it works for instructor vs student */}
            <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 space-y-1 text-xs text-blue-800">
              <div><span className="font-semibold">You set up:</span> {TYPE_INFO[qType].you}</div>
              <div><span className="font-semibold">Student sees:</span> {TYPE_INFO[qType].student}</div>
            </div>
          </div>

          {/* Question text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
            <textarea rows={2} value={text} onChange={e => setText(e.target.value)}
              placeholder="Enter your question here..."
              className={cn(inputCls, 'resize-none')} />
          </div>

          {/* ── Multiple Choice / Image ── */}
          {(qType === 'multiple_choice' || qType === 'image') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Options <span className="text-gray-400 font-normal text-xs">(select the correct one)</span>
              </label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="correct" checked={opt.isCorrect}
                      onChange={() => toggleCorrect(i, false)}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 flex-shrink-0" />
                    <input type="text" value={opt.text} onChange={e => setOptText(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      className={cn(inputCls, 'flex-1')} />
                    {options.length > 2 && (
                      <button type="button" onClick={() => removeOption(i)}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {options.length < 6 && (
                <button type="button" onClick={addOption}
                  className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium">
                  + Add option
                </button>
              )}
            </div>
          )}

          {/* ── Multi-Select ── */}
          {qType === 'multiple_select' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Options <span className="text-gray-400 font-normal text-xs">(check all correct answers)</span>
              </label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="checkbox" checked={opt.isCorrect} onChange={() => toggleCorrect(i, true)}
                      className="w-4 h-4 rounded text-primary-600 border-gray-300 focus:ring-primary-500 flex-shrink-0" />
                    <input type="text" value={opt.text} onChange={e => setOptText(i, e.target.value)}
                      placeholder={`Option ${i + 1}`} className={cn(inputCls, 'flex-1')} />
                    {options.length > 2 && (
                      <button type="button" onClick={() => removeOption(i)}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {options.length < 6 && (
                <button type="button" onClick={addOption}
                  className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium">
                  + Add option
                </button>
              )}
            </div>
          )}

          {/* ── True / False ── */}
          {qType === 'true_false' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Correct Answer</label>
              <div className="flex gap-3">
                {[true, false].map(val => (
                  <button key={String(val)} type="button"
                    onClick={() => setOptions([{ text: 'True', isCorrect: val }, { text: 'False', isCorrect: !val }])}
                    className={cn(
                      'flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                      options[0]?.isCorrect === val
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    )}>
                    {val ? 'True' : 'False'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Fill in Blank ── */}
          {qType === 'fill_blank' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Correct Answer <span className="text-gray-400 font-normal text-xs">(use ___ in the question text to mark the blank)</span>
              </label>
              <input type="text" value={correctText} onChange={e => setCorrectText(e.target.value)}
                placeholder="Expected answer..." className={inputCls} />
            </div>
          )}

          {/* ── Short Answer / Essay — no extra fields needed, graded manually ── */}

          {/* ── Matching ── */}
          {qType === 'matching' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Matching Pairs</label>
              <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-500 mb-1">
                <span className="px-1">Prompt (shown to student)</span>
                <span className="px-1">Correct Match</span>
              </div>
              <div className="space-y-2">
                {pairs.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={p.left} onChange={e => setPairField(i, 'left', e.target.value)}
                      placeholder={`Prompt ${i + 1}`} className={cn(inputCls, 'flex-1')} />
                    <span className="text-gray-400 flex-shrink-0">↔</span>
                    <input type="text" value={p.right} onChange={e => setPairField(i, 'right', e.target.value)}
                      placeholder={`Match ${i + 1}`} className={cn(inputCls, 'flex-1')} />
                    {pairs.length > 2 && (
                      <button type="button" onClick={() => removePair(i)}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addPair}
                className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium">
                + Add pair
              </button>
            </div>
          )}

          {/* ── Ordering ── */}
          {qType === 'ordering' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Items in Correct Order{' '}
                <span className="text-gray-400 font-normal text-xs">(top = first · students will see these shuffled randomly)</span>
              </label>
              <div className="space-y-2">
                {orderItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-medium flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <input type="text" value={item} onChange={e => setOrderItem(i, e.target.value)}
                      placeholder={`Item ${i + 1}`} className={cn(inputCls, 'flex-1')} />
                    {orderItems.length > 2 && (
                      <button type="button" onClick={() => removeOrderItem(i)}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addOrderItem}
                className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium">
                + Add item
              </button>
            </div>
          )}

          {/* ── Explanation ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Explanation <span className="text-gray-400 font-normal text-xs">(optional — shown to students after submitting if explanations are enabled)</span>
            </label>
            <textarea rows={2} value={explanation} onChange={e => setExpl(e.target.value)}
              placeholder="Why is this the correct answer?"
              className={cn(inputCls, 'resize-none')} />
          </div>

          {/* ── Points + Difficulty + Per-question timer ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 border-t border-gray-100">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
              <input type="number" min={1} value={points} onChange={e => setPoints(Number(e.target.value))}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
              <select value={difficulty} onChange={e => setDiff(e.target.value as Difficulty)}
                className={cn(inputCls, 'bg-white')}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time limit <span className="text-gray-400 font-normal text-xs">(sec, 0=none)</span>
              </label>
              <input type="number" min={0} value={timeLimitSeconds}
                onChange={e => setTimeLimitSeconds(Number(e.target.value))}
                className={inputCls} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={!text.trim()} onClick={() => mutation.mutate()}>
            {isEdit ? 'Save Changes' : 'Create & Add to Quiz'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Questions Tab ─────────────────────────────────────────────────────────────

function QuestionsTab({ quizId, quiz }: { quizId: string; quiz: QuizDetail }) {
  const qc = useQueryClient();
  const [showBank, setShowBank]         = useState(false);
  const [showCreate, setShowCreate]     = useState(false);
  const [editingQ, setEditingQ]         = useState<QuizQuestion | null>(null);
  const [dragIdx, setDragIdx]           = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx]   = useState<number | null>(null);
  const [error, setError]               = useState('');
  const [csvSuccess, setCsvSuccess]     = useState('');
  const csvInputRef                     = useState(() => ({ current: null as HTMLInputElement | null }))[0];

  const csvMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/quizzes/questions/bulk-import', fd);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['question-bank'] });
      const { imported, skipped } = res.data.data;
      setCsvSuccess(`Imported ${imported} question(s)${skipped > 0 ? `, ${skipped} skipped` : ''}.`);
      setTimeout(() => setCsvSuccess(''), 5000);
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'CSV import failed'),
  });

  const currentQuestions = quiz.questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(q => q.questionId)
    .filter(Boolean);

  const currentIds = currentQuestions.map(q => q._id);

  const reorderMutation = useMutation({
    mutationFn: (newIds: string[]) => {
      const questions = newIds.map((id, i) => ({ questionId: id, order: i }));
      return api.put(`/quizzes/${quizId}/questions`, { questions });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz', quizId] }),
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to reorder'),
  });

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const next = [...currentIds];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(toIdx, 0, moved);
    reorderMutation.mutate(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const removeMutation = useMutation({
    mutationFn: (removeId: string) => {
      const remaining = currentIds
        .filter(id => id !== removeId)
        .map((id, i) => ({ questionId: id, order: i }));
      return api.put(`/quizzes/${quizId}/questions`, { questions: remaining });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz', quizId] }),
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to remove question'),
  });

  const TYPE_BADGE: Partial<Record<QuestionType, 'default' | 'info' | 'warning' | 'success' | 'danger'>> = {
    multiple_choice: 'info',
    multiple_select: 'info',
    true_false: 'default',
    fill_blank: 'warning',
    short_answer: 'warning',
    essay: 'danger',
    matching: 'success',
    ordering: 'success',
    image: 'default',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          {currentQuestions.length} question{currentQuestions.length !== 1 ? 's' : ''} ·{' '}
          {quiz.totalPoints} total points
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowBank(true)}>
            From Bank
          </Button>
          <Button size="sm" variant="outline" loading={csvMutation.isPending}
            onClick={() => csvInputRef.current?.click()}>
            Import CSV
          </Button>
          <input
            ref={el => { csvInputRef.current = el; }}
            type="file" accept=".csv" className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) { csvMutation.mutate(file); e.target.value = ''; }
            }}
          />
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + New Question
          </Button>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {csvSuccess && <Alert variant="success">{csvSuccess}</Alert>}

      {currentQuestions.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="font-medium text-gray-900">No questions yet</p>
            <p className="text-sm text-gray-500 mt-1">Add questions from the question bank.</p>
            <Button className="mt-4" onClick={() => setShowBank(true)}>Add Questions</Button>
          </div>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-50">
          {currentQuestions.map((q, i) => (
            <div
              key={q._id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              className={`flex items-start gap-3 px-4 py-3.5 group transition-colors ${dragOverIdx === i && dragIdx !== i ? 'bg-primary-50' : ''}`}
            >
              {/* Drag handle */}
              <span className="flex-shrink-0 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing mt-1 select-none text-lg leading-none">
                ⠿
              </span>
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-medium flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 line-clamp-2">{q.text}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={TYPE_BADGE[q.type] ?? 'default'}>
                    {q.type.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-xs text-gray-400">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-gray-400 capitalize">{q.difficulty}</span>
                  {q.explanation && <span className="text-xs text-blue-400">has explanation</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setEditingQ(q)}>Edit</Button>
                <Button
                  size="sm" variant="danger"
                  loading={removeMutation.isPending}
                  onClick={() => { if (confirm('Remove this question?')) removeMutation.mutate(q._id); }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBank && (
        <QuestionBankModal
          quizId={quizId}
          currentIds={currentIds}
          onClose={() => setShowBank(false)}
          onAdded={() => qc.invalidateQueries({ queryKey: ['quiz', quizId] })}
        />
      )}

      {showCreate && (
        <CreateQuestionModal
          quizId={quizId}
          currentIds={currentIds}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['quiz', quizId] })}
        />
      )}

      {editingQ && (
        <CreateQuestionModal
          quizId={quizId}
          currentIds={currentIds}
          initialData={editingQ}
          onClose={() => setEditingQ(null)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['quiz', quizId] }); setEditingQ(null); }}
        />
      )}
    </div>
  );
}

// ─── Attempt Detail Modal ─────────────────────────────────────────────────────

interface DetailAnswer {
  _id: string;
  questionId: {
    _id: string; text: string; type: string; points: number;
    options: Array<{ text: string; isCorrect?: boolean }>;
    correctAnswer?: string;
    matchingPairs?: Array<{ left: string; right: string }>;
    correctOrder?: string[];
    explanation?: string;
  };
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
  matchingAnswer?: Array<{ left: string; right: string }>;
  orderingAnswer?: string[];
  isCorrect?: boolean | null;
  pointsAwarded: number;
  maxPoints: number;
}

interface DetailAttempt {
  _id: string;
  status: string;
  score: number; maxScore: number; percentage: number; passed: boolean;
  submittedAt?: string; timeSpentSeconds?: number;
  userId?: { firstName: string; lastName: string; email: string };
  answers: DetailAnswer[];
}

function AttemptDetailModal({ quizId, attemptId, onClose }: {
  quizId: string; attemptId: string; onClose: () => void;
}) {
  const { data, isLoading } = useQuery<DetailAttempt>({
    queryKey: ['attempt-detail', attemptId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${quizId}/attempts/${attemptId}`);
      return data.data.attempt as DetailAttempt;
    },
  });

  const verdict = (ans: DetailAnswer) => {
    if (ans.isCorrect === true)  return 'correct';
    if (ans.isCorrect === false) return 'incorrect';
    // isCorrect is null — essay always needs manual grading; other types had a grading gap
    return ans.questionId?.type === 'essay' ? 'pending' : 'ungraded';
  };

  const studentAnswerText = (ans: DetailAnswer): string => {
    const q = ans.questionId;
    if (!q) return '—';
    switch (q.type) {
      case 'multiple_choice':
      case 'true_false':
      case 'image': {
        const opt = q.options.find(o => (o as any)._id?.toString() === ans.selectedOptionId);
        return opt?.text ?? '—';
      }
      case 'multiple_select': {
        const ids = new Set(ans.selectedOptionIds ?? []);
        const selected = q.options.filter(o => ids.has((o as any)._id?.toString()));
        return selected.length ? selected.map(o => o.text).join(', ') : '—';
      }
      case 'fill_blank':
      case 'short_answer':
      case 'essay':
        return ans.textAnswer?.trim() || '—';
      case 'ordering':
        return ans.orderingAnswer?.join(' → ') || '—';
      case 'matching':
        return ans.matchingAnswer?.map(p => `${p.left} → ${p.right}`).join(', ') || '—';
      default: return '—';
    }
  };

  const correctAnswerText = (q: DetailAnswer['questionId']): string | null => {
    switch (q.type) {
      case 'multiple_choice':
      case 'true_false':
      case 'image': {
        const opt = q.options.find(o => o.isCorrect);
        return opt?.text ?? null;
      }
      case 'multiple_select':
        return q.options.filter(o => o.isCorrect).map(o => o.text).join(', ') || null;
      case 'fill_blank':
        return q.correctAnswer ?? null;
      case 'ordering':
        return q.correctOrder?.join(' → ') ?? null;
      case 'matching':
        return q.matchingPairs?.map(p => `${p.left} → ${p.right}`).join(', ') ?? null;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Attempt Review</h3>
            {data && (
              <p className="text-xs text-gray-500 mt-0.5">
                {data.userId ? `${data.userId.firstName} ${data.userId.lastName} · ${data.userId.email}` : ''}
                {' · '}{data.percentage}% · {data.score}/{data.maxScore} pts · {data.passed ? '✓ Passed' : '✗ Failed'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : !data?.answers?.length ? (
            <p className="text-sm text-gray-400 text-center py-8">No answers recorded.</p>
          ) : (
            data.answers.map((ans, i) => {
              const q = ans.questionId;
              const v = verdict(ans);
              const studentAns = studentAnswerText(ans);
              const correctAns = correctAnswerText(q);
              return (
                <div key={ans._id} className={`rounded-xl border px-4 py-3.5 space-y-2 ${
                  v === 'correct'   ? 'border-green-200 bg-green-50/30' :
                  v === 'incorrect' ? 'border-red-200 bg-red-50/30' :
                  v === 'pending'   ? 'border-amber-200 bg-amber-50/30' :
                  'border-gray-200'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5 ${
                      v === 'correct'   ? 'bg-green-100 text-green-700' :
                      v === 'incorrect' ? 'bg-red-100 text-red-600' :
                      v === 'pending'   ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{q?.text ?? '—'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400 capitalize">{q?.type?.replace(/_/g, ' ')}</span>
                        {v === 'correct'   && <span className="text-xs text-green-600 font-medium">✓ Correct</span>}
                        {v === 'incorrect' && <span className="text-xs text-red-500 font-medium">✗ Incorrect</span>}
                        {v === 'pending'   && <span className="text-xs text-amber-600 font-medium">Pending grading</span>}
                        <span className="text-xs text-gray-400 ml-auto">{ans.pointsAwarded}/{ans.maxPoints} pts</span>
                      </div>
                    </div>
                  </div>

                  <div className="ml-8 space-y-1 text-sm">
                    <div className={`px-3 py-2 rounded-lg ${
                      v === 'correct'   ? 'bg-green-100 text-green-800' :
                      v === 'incorrect' ? 'bg-red-50 text-red-700' :
                      v === 'pending'   ? 'bg-amber-50 text-amber-800' :
                      'bg-gray-50 text-gray-700'
                    }`}>
                      <span className="font-medium text-xs opacity-70 block mb-0.5">Student answer</span>
                      {studentAns}
                    </div>
                    {v === 'incorrect' && correctAns && (
                      <div className="px-3 py-2 rounded-lg bg-green-50 text-green-800">
                        <span className="font-medium text-xs opacity-70 block mb-0.5">Correct answer</span>
                        {correctAns}
                      </div>
                    )}
                    {q?.explanation && (
                      <div className="px-3 py-2 rounded-lg bg-blue-50 text-blue-800 text-xs">
                        <span className="font-medium">Explanation: </span>{q.explanation}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Instructor: Attempts Tab ─────────────────────────────────────────────────

function GradeModal({
  quizId,
  attempt,
  onClose,
  onGraded,
}: {
  quizId: string;
  attempt: AttemptSummary;
  onClose: () => void;
  onGraded: () => void;
}) {
  // Fetch full attempt so we can read the student's actual essay text and
  // know exactly which answers are essay type — don't rely on quiz definition.
  const { data: detail, isLoading } = useQuery<DetailAttempt>({
    queryKey: ['attempt-detail', attempt._id],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${quizId}/attempts/${attempt._id}`);
      return data.data.attempt as DetailAttempt;
    },
  });

  // Show essay always; show short_answer when no correctAnswer is set (no keyword to auto-grade)
  const essayAnswers = (detail?.answers ?? []).filter(a => {
    const type = a.questionId?.type;
    if (type === 'essay') return true;
    if (type === 'short_answer' && !(a.questionId?.correctAnswer?.trim())) return true;
    return false;
  });

  const [grades, setGrades] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  // Pre-fill grades once detail loads (supports re-grading with existing points)
  useEffect(() => {
    if (essayAnswers.length > 0 && Object.keys(grades).length === 0) {
      setGrades(Object.fromEntries(
        essayAnswers.map(a => [a.questionId._id, String(a.pointsAwarded ?? 0)])
      ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [essayAnswers.length]);

  const allGraded = essayAnswers.length > 0 &&
    essayAnswers.every(a => grades[a.questionId._id] !== '' && grades[a.questionId._id] !== undefined);

  const mutation = useMutation({
    mutationFn: () => {
      const gradesArr = essayAnswers.map(a => ({
        questionId: a.questionId._id,
        pointsAwarded: parseFloat(grades[a.questionId._id] ?? '0') || 0,
      }));
      return api.patch(`/quizzes/${quizId}/attempts/${attempt._id}/grade`, { grades: gradesArr });
    },
    onSuccess: () => { onGraded(); onClose(); },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Grading failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg sm:mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Grade Essay Answers</h3>
            {!isLoading && essayAnswers.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {essayAnswers.length} question{essayAnswers.length > 1 ? 's' : ''} need grading — save after all are done
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
          {error && <Alert variant="error">{error}</Alert>}

          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : essayAnswers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No essay questions found in this attempt.</p>
          ) : (
            essayAnswers.map((ans, idx) => {
              const q = ans.questionId;
              const val = grades[q._id] ?? '';
              const pts = parseFloat(val) || 0;
              return (
                <div key={q._id} className="space-y-2 pb-5 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${q.type === 'essay' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {q.type === 'essay' ? 'Essay' : 'Short Answer'}{essayAnswers.length > 1 ? ` ${idx + 1}/${essayAnswers.length}` : ''}
                    </span>
                    <span className="text-xs text-gray-400">{q.points} pt{q.points !== 1 ? 's' : ''} max</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{q.text}</p>
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap min-h-[60px]">
                    {ans.textAnswer?.trim()
                      ? ans.textAnswer
                      : <span className="text-gray-400 italic">No answer provided</span>
                    }
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">Points awarded:</label>
                    <input
                      type="number"
                      min={0}
                      max={q.points}
                      value={val}
                      onChange={(e) => setGrades(prev => ({ ...prev, [q._id]: e.target.value }))}
                      className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="0"
                    />
                    <span className="text-sm text-gray-400">/ {q.points}</span>
                    {val !== '' && (
                      <span className={`text-xs font-medium ${pts >= q.points ? 'text-green-600' : pts > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                        {pts >= q.points ? 'Full marks' : pts > 0 ? 'Partial' : 'Zero'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
          {!isLoading && essayAnswers.length > 1 && !allGraded && (
            <p className="text-xs text-amber-600 mb-3 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Please grade all {essayAnswers.length} questions before saving.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button loading={mutation.isPending} disabled={isLoading || essayAnswers.length === 0} onClick={() => mutation.mutate()}>
              Save Grades
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttemptsTab({ quizId, quiz }: { quizId: string; quiz: QuizDetail }) {
  const qc = useQueryClient();
  const [gradingAttempt, setGradingAttempt] = useState<AttemptSummary | null>(null);
  const [viewingAttemptId, setViewingAttemptId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['quiz-attempts', quizId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${quizId}/attempts?limit=100`);
      return data.data as { attempts: AttemptSummary[]; total: number };
    },
  });

  const attempts = data?.attempts ?? [];

  const statusBadge = (s: AttemptSummary['status']) => {
    const map: Record<AttemptSummary['status'], { label: string; v: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
      in_progress:      { label: 'In Progress',    v: 'info' },
      submitted:        { label: 'Submitted',       v: 'default' },
      auto_graded:      { label: 'Graded',          v: 'success' },
      manually_graded:  { label: 'Graded',          v: 'success' },
      pending_manual:   { label: 'Needs Grading',   v: 'warning' },
    };
    const { label, v } = map[s] ?? { label: s, v: 'default' };
    return <Badge variant={v}>{label}</Badge>;
  };

  const exportCSV = () => {
    const rows = [
      ['Student', 'Email', 'Score', 'Percentage', 'Passed', 'Status', 'Date', 'Time (min)'],
      ...attempts.map(a => [
        a.userId ? `${a.userId.firstName} ${a.userId.lastName}` : '—',
        a.userId?.email ?? '—',
        `${a.score}/${a.maxScore}`,
        `${a.percentage}%`,
        a.passed ? 'Yes' : 'No',
        a.status,
        a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—',
        a.timeSpentSeconds !== undefined ? (a.timeSpentSeconds / 60).toFixed(1) : '—',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${quiz.title}-attempts.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-gray-500">{data?.total ?? 0} total attempts</p>
          {(() => {
            const n = attempts.filter(a => a.status === 'pending_manual').length;
            return n > 0 ? (
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {n} need{n === 1 ? 's' : ''} grading
              </span>
            ) : null;
          })()}
        </div>
        {attempts.length > 0 && (
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </Button>
        )}
      </div>

      {attempts.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="font-medium text-gray-900">No attempts yet</p>
            <p className="text-sm text-gray-500 mt-1">Attempts will appear here once students take this quiz.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="sm:hidden space-y-3">
            {attempts.map(a => {
              const u = a.userId;
              const scoreText = a.status === 'in_progress' || a.status === 'submitted'
                ? '—' : a.status === 'pending_manual' ? 'Partial' : `${a.percentage}% (${a.score}/${a.maxScore})`;
              return (
                <div key={a._id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-xs font-medium text-primary-700 flex-shrink-0">
                        {u?.firstName?.[0]}{u?.lastName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {u ? `${u.firstName} ${u.lastName}` : '—'}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(a.submittedAt ?? a.startedAt)}</p>
                      </div>
                    </div>
                    {statusBadge(a.status)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 font-medium">{scoreText}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setViewingAttemptId(a._id)}>View</Button>
                      {a.status === 'pending_manual' && (
                        <Button size="sm" onClick={() => setGradingAttempt(a)}
                          className="bg-amber-500 hover:bg-amber-600 text-white border-0">
                          Grade
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Score</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {attempts.map(a => {
                    const u = a.userId;
                    return (
                      <tr key={a._id} className="hover:bg-gray-50">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center text-xs font-medium text-primary-700 flex-shrink-0">
                              {u?.firstName?.[0]}{u?.lastName?.[0]}
                            </div>
                            <span className="font-medium text-gray-900">
                              {u ? `${u.firstName} ${u.lastName}` : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-700">
                          {a.status === 'in_progress' || a.status === 'submitted'
                            ? '—'
                            : a.status === 'pending_manual'
                            ? 'Partial'
                            : `${a.percentage}% (${a.score}/${a.maxScore})`}
                        </td>
                        <td className="px-4 py-3.5">{statusBadge(a.status)}</td>
                        <td className="px-4 py-3.5 text-gray-500">
                          {formatDate(a.submittedAt ?? a.startedAt)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setViewingAttemptId(a._id)}>
                              View
                            </Button>
                            {a.status === 'pending_manual' && (
                              <Button size="sm" variant="outline" onClick={() => setGradingAttempt(a)}>
                                Grade
                              </Button>
                            )}
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

      {gradingAttempt && (
        <GradeModal
          quizId={quizId}
          attempt={gradingAttempt}
          onClose={() => setGradingAttempt(null)}
          onGraded={() => qc.invalidateQueries({ queryKey: ['quiz-attempts', quizId] })}
        />
      )}

      {viewingAttemptId && (
        <AttemptDetailModal
          quizId={quizId}
          attemptId={viewingAttemptId}
          onClose={() => setViewingAttemptId(null)}
        />
      )}
    </div>
  );
}

// ─── Instructor View ──────────────────────────────────────────────────────────

type InstructorTab = 'questions' | 'settings' | 'attempts';

function InstructorView() {
  const params = useParams();
  const router = useRouter();
  const quizId = params.id as string;
  const qc = useQueryClient();
  const [tab, setTab] = useState<InstructorTab>('questions');
  const [actionError, setActionError] = useState('');

  const { data: quiz, isLoading } = useQuery({
    queryKey: ['quiz', quizId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${quizId}`);
      return data.data.quiz as QuizDetail;
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => api.patch(`/quizzes/${quizId}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz', quizId] }),
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Action failed');
      setTimeout(() => setActionError(''), 4000);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.patch(`/quizzes/${quizId}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quiz', quizId] }),
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Action failed');
      setTimeout(() => setActionError(''), 4000);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api.post(`/quizzes/${quizId}/duplicate`),
    onSuccess: (res) => {
      const newId: string = res.data.data.quiz._id;
      router.push(`/quizzes/${newId}`);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Duplicate failed');
      setTimeout(() => setActionError(''), 4000);
    },
  });

  if (isLoading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (!quiz) return (
    <div className="flex flex-col items-center justify-center py-24">
      <p className="text-gray-500">Quiz not found.</p>
      <Button className="mt-4" variant="outline" onClick={() => router.push('/quizzes')}>Back</Button>
    </div>
  );

  const TABS: { key: InstructorTab; label: string }[] = [
    { key: 'questions', label: `Questions (${quiz.totalQuestions})` },
    { key: 'settings', label: 'Settings' },
    { key: 'attempts', label: `Attempts (${quiz.attemptCount})` },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.push('/quizzes')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0 mt-0.5">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">{quiz.title}</h1>
                <Badge variant={STATUS_BADGE[quiz.status] ?? 'default'}>{quiz.status}</Badge>
                <Badge variant="default" className="capitalize">{quiz.gradingType}</Badge>
              </div>
              <p className="text-sm text-gray-500">
                {quiz.totalQuestions} questions · {quiz.totalPoints} pts · Pass {quiz.settings.passingScore}%
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              <Button variant="outline" size="sm"
                onClick={() => router.push(`/quizzes/${quizId}?preview=1`)}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Preview
              </Button>
              <Button variant="outline" size="sm" loading={duplicateMutation.isPending}
                onClick={() => duplicateMutation.mutate()}>
                Duplicate
              </Button>
              {quiz.status === 'draft' && (
                <Button size="sm" loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
                  Publish
                </Button>
              )}
              {quiz.status === 'published' && (
                <Button size="sm" variant="outline" loading={archiveMutation.isPending}
                  onClick={() => { if (confirm('Archive this quiz?')) archiveMutation.mutate(); }}>
                  Archive
                </Button>
              )}
              {quiz.status === 'archived' && (
                <Button size="sm" variant="outline" loading={publishMutation.isPending}
                  onClick={() => publishMutation.mutate()}>
                  Restore
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => {
              setTab(key);
              if (key === 'attempts') qc.invalidateQueries({ queryKey: ['quiz', quizId] });
            }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'questions' && <QuestionsTab quizId={quizId} quiz={quiz} />}
      {tab === 'settings'  && <SettingsTab  quizId={quizId} quiz={quiz} />}
      {tab === 'attempts'  && <AttemptsTab  quizId={quizId} quiz={quiz} />}
    </div>
  );
}

// ─── Page Entry Point ─────────────────────────────────────────────────────────

export default function QuizDetailPage() {
  const user = useAuthStore((s) => s.user);
  const searchParams = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  if (user?.role === 'student' || isPreview) return <StudentView isPreview={isPreview} />;
  return <InstructorView />;
}
