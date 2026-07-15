'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import type { Assignment, Submission, RubricScore } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    submitted: 'bg-blue-100 text-blue-700',
    late:      'bg-amber-100 text-amber-700',
    graded:    'bg-green-100 text-green-700',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

function isPDF(url: string | null, name: string | null) {
  if (!url) return false;
  return name?.toLowerCase().endsWith('.pdf') || url.toLowerCase().includes('.pdf');
}

// ─── Grade Queue ──────────────────────────────────────────────────────────────

export interface GradeQueueProps {
  submissions: Submission[];
  assignment: Assignment;
  onClose: () => void;
  onGraded: (submissionId: string, updated: Partial<Submission>) => void;
}

export function GradeQueue({ submissions, assignment, onClose, onGraded }: GradeQueueProps) {
  const hasRubric = Array.isArray(assignment.rubric) && assignment.rubric.length > 0;

  // Sort: ungraded/late first, graded last
  const sorted = [
    ...submissions.filter(s => s.status !== 'graded'),
    ...submissions.filter(s => s.status === 'graded'),
  ];

  const [localSubs, setLocalSubs] = useState<Submission[]>(sorted);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [marks, setMarks]         = useState('');
  const [feedback, setFeedback]   = useState('');
  const [rubricScores, setRubricScores] = useState<RubricScore[]>([]);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [showPDF, setShowPDF]     = useState(false);
  const [done, setDone]           = useState(false);
  // True when this submission's rubricScores were graded under a rubric
  // that's since been edited/renamed — matching by criterion NAME (no
  // stable id in the schema) means a renamed criterion silently resets to 0.
  const [rubricChangedSinceGrading, setRubricChangedSinceGrading] = useState(false);

  const current = localSubs[currentIndex] ?? null;
  const total   = localSubs.length;
  const gradedCount = localSubs.filter(s => s.status === 'graded').length;

  // Seed form whenever current submission changes
  const seedForm = useCallback((sub: Submission | null) => {
    if (!sub) return;
    setMarks(String(sub.marks ?? ''));
    setFeedback(sub.feedback ?? '');
    setRubricScores(
      assignment.rubric?.map(r => {
        const ex = sub.rubricScores?.find(s => s.criterion === r.criterion);
        return { criterion: r.criterion, maxPoints: r.maxPoints, awardedPoints: ex?.awardedPoints ?? 0 };
      }) ?? []
    );
    const currentCriteria = new Set((assignment.rubric ?? []).map(r => r.criterion));
    setRubricChangedSinceGrading(
      !!sub.rubricScores?.length && sub.rubricScores.some(s => !currentCriteria.has(s.criterion))
    );
    setError('');
    setShowPDF(false);
  }, [assignment.rubric]);

  useEffect(() => {
    seedForm(localSubs[currentIndex] ?? null);
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  function goTo(index: number) {
    setCurrentIndex(Math.max(0, Math.min(total - 1, index)));
  }

  const rubricTotal = rubricScores.reduce((sum, r) => sum + r.awardedPoints, 0);
  const finalMarks  = hasRubric ? rubricTotal : Number(marks);

  function validate(): string | null {
    if (hasRubric) {
      for (const r of rubricScores) {
        if (r.awardedPoints < 0)        return `Score cannot be negative for "${r.criterion}"`;
        if (r.awardedPoints > r.maxPoints) return `Score exceeds max for "${r.criterion}"`;
      }
    } else {
      if (marks === '' || isNaN(Number(marks))) return 'Enter a valid marks value';
      if (Number(marks) < 0)                    return 'Marks cannot be negative';
      if (Number(marks) > assignment.totalMarks) return `Marks cannot exceed ${assignment.totalMarks}`;
    }
    return null;
  }

  async function saveGrade(advance: boolean) {
    const err = validate();
    if (err) return setError(err);
    if (!current) return;

    setSaving(true);
    setError('');
    try {
      const body = hasRubric
        ? { rubricScores, feedback }
        : { marks: Number(marks), feedback };

      await api.patch(
        `/assignments/${assignment._id}/submissions/${current._id}/grade`,
        body
      );

      const patch: Partial<Submission> = {
        marks: finalMarks, feedback,
        status: 'graded',
        gradedAt: new Date().toISOString(),
        ...(hasRubric ? { rubricScores } : {}),
      };

      setLocalSubs(prev => prev.map(s => s._id === current._id ? { ...s, ...patch } : s));
      onGraded(current._id, patch);

      if (advance) {
        const next = currentIndex + 1;
        if (next >= total) {
          setDone(true);
        } else {
          setCurrentIndex(next);
        }
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to save grade');
    } finally {
      setSaving(false);
    }
  }

  const student = current && typeof current.studentId !== 'string' ? current.studentId : null;
  const hasPDF  = current ? isPDF(current.fileUrl, current.originalFileName) : false;

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft')  goTo(currentIndex - 1);
      if (e.key === 'ArrowRight') goTo(currentIndex + 1);
      if (e.key === 'Escape')     onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, total]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">Grade Queue — {assignment.title}</h1>
            <p className="text-xs text-gray-500">
              {gradedCount} of {total} graded
              <span className="text-gray-300 mx-2">·</span>
              <span className="text-gray-400">← → to navigate · Esc to close</span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="w-40 h-1.5 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
            <div className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${total > 0 ? (gradedCount / total) * 100 : 0}%` }} />
          </div>
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
            {currentIndex + 1} / {total}
          </span>
        </div>
      </div>

      {done ? (
        /* ── All done screen ── */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">All submissions graded!</h2>
            <p className="text-sm text-gray-500 mt-1">{gradedCount} of {total} submissions have been graded.</p>
          </div>
          <Button onClick={onClose}>Back to Submissions</Button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* ── Sidebar ── */}
          <aside className="w-56 border-r border-gray-200 overflow-y-auto flex-shrink-0 bg-gray-50">
            {localSubs.map((s, i) => {
              const st = typeof s.studentId === 'string' ? null : s.studentId;
              const name = st ? `${st.firstName} ${st.lastName}` : 'Student';
              const isActive = i === currentIndex;
              return (
                <button key={s._id} onClick={() => goTo(i)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-200 transition-colors ${
                    isActive ? 'bg-primary-50 border-l-2 border-l-primary-500' : 'hover:bg-white'
                  }`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs font-medium truncate ${isActive ? 'text-primary-700' : 'text-gray-800'}`}>
                      {name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${statusColor(s.status)}`}>
                      {s.status}
                    </span>
                  </div>
                  {s.marks !== null && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {s.marks} / {assignment.totalMarks}
                    </p>
                  )}
                </button>
              );
            })}
          </aside>

          {/* ── Main grading area ── */}
          <div className="flex-1 flex overflow-hidden">
            {/* Submission content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Student info bar */}
              {current && (
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">
                      {student ? `${student.firstName} ${student.lastName}` : 'Student'}
                    </h2>
                    <p className="text-xs text-gray-500">
                      Submitted {formatDate(current.submittedAt)}
                      {current.status === 'late' && (
                        <span className="ml-2 text-amber-600 font-medium">· Late</span>
                      )}
                    </p>
                  </div>
                  {current.status === 'graded' && current.marks !== null && (
                    <div className="text-right">
                      <span className="text-lg font-bold text-green-600">{current.marks}</span>
                      <span className="text-sm text-gray-400"> / {assignment.totalMarks}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Text response */}
              {current?.submissionText && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Text Response</p>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                    {current.submissionText}
                  </div>
                </div>
              )}

              {/* File submission */}
              {current?.fileUrl && (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted File</p>
                    <a href={current.fileUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary-600 hover:underline">
                      Open in new tab ↗
                    </a>
                    {hasPDF && (
                      <button onClick={() => setShowPDF(v => !v)}
                        className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-0.5">
                        {showPDF ? 'Hide PDF' : 'Preview PDF'}
                      </button>
                    )}
                  </div>
                  {!hasPDF && (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      {current.originalFileName ?? 'Submitted file'}
                    </div>
                  )}
                  {hasPDF && showPDF && (
                    <iframe src={current.fileUrl} className="w-full rounded-lg border border-gray-200"
                      style={{ height: '500px' }} title="Submission" />
                  )}
                </div>
              )}

              {!current?.submissionText && !current?.fileUrl && (
                <div className="text-sm text-gray-400 italic py-4">No submission content.</div>
              )}
            </div>

            {/* ── Right grading panel ── */}
            <div className="w-80 border-l border-gray-200 flex flex-col flex-shrink-0 bg-white">
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <h3 className="text-sm font-semibold text-gray-700">Grade</h3>

                {error && <Alert variant="error">{error}</Alert>}

                {/* Rubric or simple marks */}
                {hasRubric ? (
                  <div className="space-y-3">
                    {rubricChangedSinceGrading && (
                      <Alert variant="warning">
                        This assignment's rubric was changed since this submission was last graded —
                        one or more previous criterion scores couldn't be matched and were reset to 0.
                        Review all scores below before saving.
                      </Alert>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">Rubric Scoring</span>
                      <span className="text-sm font-bold text-primary-600">
                        {rubricTotal} / {assignment.totalMarks}
                        <span className="text-xs text-gray-400 font-normal ml-1">
                          ({assignment.totalMarks > 0 ? Math.round((rubricTotal / assignment.totalMarks) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                    <div className="space-y-3">
                      {rubricScores.map((r, i) => (
                        <div key={r.criterion}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">{r.criterion}</span>
                            <span className="text-xs text-gray-400">/ {r.maxPoints}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-primary-400 rounded-full transition-all"
                                style={{ width: `${r.maxPoints > 0 ? Math.min(100, (r.awardedPoints / r.maxPoints) * 100) : 0}%` }} />
                            </div>
                            <input type="number" min={0} max={r.maxPoints} value={r.awardedPoints}
                              onChange={(e) => setRubricScores(prev =>
                                prev.map((x, j) => j === i ? { ...x, awardedPoints: Number(e.target.value) } : x)
                              )}
                              className="w-14 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary-500" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${assignment.totalMarks > 0 ? Math.min(100, (rubricTotal / assignment.totalMarks) * 100) : 0}%` }} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Marks <span className="text-gray-400 font-normal">/ {assignment.totalMarks}</span>
                    </label>
                    <input type="number" min={0} max={assignment.totalMarks} value={marks}
                      onChange={(e) => setMarks(e.target.value)}
                      placeholder={`0 – ${assignment.totalMarks}`}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    {marks && !isNaN(Number(marks)) && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-500 rounded-full"
                            style={{ width: `${Math.min(100, (Number(marks) / assignment.totalMarks) * 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 w-10 text-right">
                          {Math.round((Number(marks) / assignment.totalMarks) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Feedback */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Feedback (optional)</label>
                  <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
                    rows={5} placeholder="Provide feedback to the student..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                </div>

                {/* Previous grade indicator */}
                {current?.status === 'graded' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700">
                    Previously graded: {current.marks} / {assignment.totalMarks}
                    {current.gradedAt && ` on ${formatDate(current.gradedAt)}`}
                  </div>
                )}
              </div>

              {/* Navigation footer */}
              <div className="border-t border-gray-200 p-4 space-y-2">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={currentIndex <= 0}
                    onClick={() => goTo(currentIndex - 1)} className="flex-1">
                    ← Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={currentIndex >= total - 1}
                    onClick={() => goTo(currentIndex + 1)} className="flex-1">
                    Skip →
                  </Button>
                </div>
                <Button size="sm" loading={saving} onClick={() => saveGrade(true)} className="w-full">
                  {currentIndex >= total - 1 ? 'Save & Finish' : 'Save & Next →'}
                </Button>
                <Button variant="ghost" size="sm" loading={saving} onClick={() => saveGrade(false)} className="w-full text-gray-500">
                  Save Only
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
