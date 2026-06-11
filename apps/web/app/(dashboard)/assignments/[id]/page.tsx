'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { Assignment, Submission, SubmissionComment, RubricCriterion, RubricScore } from '@/types';
import { GradeQueue } from './GradeQueue';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function statusBadge(status: string) {
  const map: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
    published: 'success', draft: 'warning', archived: 'danger',
    submitted: 'default', late: 'warning', graded: 'success',
  };
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>;
}

function isPDF(url: string | null, name: string | null) {
  if (!url) return false;
  return name?.toLowerCase().endsWith('.pdf') || url.toLowerCase().includes('.pdf');
}

// ─── Rubric Builder (shared by Create + Edit) ─────────────────────────────────

function RubricBuilder({ rubric, onChange }: { rubric: RubricCriterion[]; onChange: (r: RubricCriterion[]) => void }) {
  const total = rubric.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0);
  return (
    <div className="space-y-3">
      {rubric.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No criteria — rubric is disabled for this assignment.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_90px_32px] gap-2 text-xs font-medium text-gray-500 px-1">
            <span>Criterion</span><span className="text-center">Max Pts</span><span />
          </div>
          {rubric.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_32px] gap-2 items-center">
              <input value={r.criterion}
                onChange={(e) => onChange(rubric.map((x, j) => j === i ? { ...x, criterion: e.target.value } : x))}
                placeholder="e.g. Research & Analysis"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <input type="number" min={0} value={r.maxPoints}
                onChange={(e) => onChange(rubric.map((x, j) => j === i ? { ...x, maxPoints: Number(e.target.value) } : x))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <button type="button" onClick={() => onChange(rubric.filter((_, j) => j !== i))}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors text-lg">
                ×
              </button>
            </div>
          ))}
          <div className="flex justify-end pt-1">
            <span className="text-sm font-semibold text-gray-700">
              Total: <span className="text-primary-600">{total} pts</span>
            </span>
          </div>
        </div>
      )}
      <Button type="button" variant="outline" size="sm"
        onClick={() => onChange([...rubric, { criterion: '', maxPoints: 10 }])}>
        + Add Criterion
      </Button>
    </div>
  );
}

// ─── Countdown Timer (#4) ─────────────────────────────────────────────────────

function CountdownTimer({ dueDate }: { dueDate: string }) {
  const [remaining, setRemaining] = useState('');
  const [urgency, setUrgency]     = useState<'normal' | 'amber' | 'red'>('normal');

  useEffect(() => {
    function tick() {
      const diff = new Date(dueDate).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Past due'); setUrgency('red'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h < 1)       setUrgency('red');
      else if (h < 24) setUrgency('amber');
      else             setUrgency('normal');
      const parts = [];
      if (h >= 24) parts.push(`${Math.floor(h / 24)}d ${h % 24}h`);
      else         parts.push(`${h}h ${m}m ${s}s`);
      setRemaining(parts.join(' '));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dueDate]);

  const colors = {
    normal: 'text-green-700 bg-green-50 border-green-200',
    amber:  'text-amber-700 bg-amber-50 border-amber-200',
    red:    'text-red-700 bg-red-50 border-red-200',
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${colors[urgency]}`}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {remaining}
    </div>
  );
}

// ─── Grade Distribution Chart (#6) ───────────────────────────────────────────

function GradeDistributionChart({ submissions, totalMarks }: { submissions: Submission[]; totalMarks: number }) {
  const graded = submissions.filter(s => s.status === 'graded' && s.marks !== null);
  if (graded.length < 2) return null;

  const bands = 5;
  const step  = totalMarks / bands;
  const buckets = Array.from({ length: bands }, (_, i) => ({
    label: `${Math.round(i * step)}–${Math.round((i + 1) * step)}`,
    count: graded.filter(s => {
      const pct = ((s.marks ?? 0) / totalMarks) * totalMarks;
      return pct >= i * step && (i === bands - 1 ? pct <= (i + 1) * step : pct < (i + 1) * step);
    }).length,
  }));

  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const avg = graded.reduce((sum, s) => sum + (s.marks ?? 0), 0) / graded.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Grade Distribution</CardTitle>
          <span className="text-sm text-gray-500">
            Avg: <span className="font-semibold text-gray-800">{avg.toFixed(1)}/{totalMarks}</span>
            <span className="ml-2 text-gray-400">({Math.round((avg / totalMarks) * 100)}%)</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 h-28">
          {buckets.map((b) => (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs font-medium text-gray-600">{b.count}</span>
              <div
                className="w-full bg-primary-500 rounded-t transition-all"
                style={{ height: `${Math.max(4, (b.count / maxCount) * 80)}px` }}
              />
              <span className="text-[10px] text-gray-400 text-center leading-tight">{b.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Edit Assignment Modal ────────────────────────────────────────────────────

interface EditModalProps {
  assignment: Assignment;
  onClose: () => void;
  onSaved: (a: Assignment) => void;
}

function EditAssignmentModal({ assignment, onClose, onSaved }: EditModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title:               assignment.title,
    description:         assignment.description ?? '',
    instructions:        assignment.instructions ?? '',
    dueDate:             assignment.dueDate ? assignment.dueDate.slice(0, 16) : '',
    totalMarks:          String(assignment.totalMarks),
    allowLateSubmission: assignment.allowLateSubmission,
    maxSubmissions:      String(assignment.maxSubmissions ?? 0),
  });
  const [rubric, setRubric] = useState<RubricCriterion[]>(assignment.rubric ?? []);
  const [allowedFileTypes, setAllowedFileTypes] = useState<string[]>(assignment.allowedFileTypes ?? []);

  const FILE_TYPE_OPTIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'jpg', 'png', 'mp4'];
  function toggleFileType(ext: string) {
    setAllowedFileTypes(prev => prev.includes(ext) ? prev.filter(t => t !== ext) : [...prev, ext]);
  }
  const [file, setFile]     = useState<File | null>(null);
  const [error, setError]   = useState('');

  const hasRubric   = rubric.some(r => r.criterion.trim());
  const rubricTotal = rubric.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      const validRubric = rubric.filter(r => r.criterion.trim());
      fd.append('rubric', JSON.stringify(validRubric));
      fd.append('allowedFileTypes', JSON.stringify(allowedFileTypes));
      if (file) fd.append('attachment', file);
      const res = await api.patch(`/assignments/${assignment._id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data.assignment as Assignment;
    },
    onSuccess: (updated) => { onSaved(updated); onClose(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to update assignment');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Edit Assignment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instructions</label>
            <textarea value={form.instructions} onChange={(e) => setForm(f => ({ ...f, instructions: e.target.value }))}
              rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="datetime-local" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Marks
                {hasRubric && <span className="ml-1 text-xs text-primary-600 font-normal">(auto: {rubricTotal})</span>}
              </label>
              <Input type="number" min={1}
                value={hasRubric ? String(rubricTotal) : form.totalMarks}
                readOnly={hasRubric}
                onChange={(e) => !hasRubric && setForm(f => ({ ...f, totalMarks: e.target.value }))}
                className={hasRubric ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''} />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.allowLateSubmission}
              onChange={(e) => setForm(f => ({ ...f, allowLateSubmission: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <span className="text-sm text-gray-700">Allow late submissions</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Submission Limit
              <span className="ml-1.5 font-normal text-gray-400 text-xs">0 = unlimited</span>
            </label>
            <select value={form.maxSubmissions}
              onChange={(e) => setForm(f => ({ ...f, maxSubmissions: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="0">Unlimited</option>
              <option value="1">1 submission (no resubmission)</option>
              <option value="2">2 submissions</option>
              <option value="3">3 submissions</option>
              <option value="5">5 submissions</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Grading Rubric</label>
            <RubricBuilder rubric={rubric} onChange={setRubric} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Allowed File Types
              <span className="ml-1.5 text-xs font-normal text-gray-400">(none = any type accepted)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {FILE_TYPE_OPTIONS.map(ext => (
                <button
                  key={ext}
                  type="button"
                  onClick={() => toggleFileType(ext)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold border transition-colors ${
                    allowedFileTypes.includes(ext)
                      ? 'bg-primary-100 border-primary-400 text-primary-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  .{ext}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Replace Attachment</label>
            <input ref={fileRef} type="file" className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file
              ? <div className="flex items-center gap-2 text-sm"><span className="truncate text-gray-700">{file.name}</span><button onClick={() => setFile(null)} className="text-red-500 text-xs">Remove</button></div>
              : <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Choose File</Button>
            }
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Grade Modal with PDF preview (#7) ───────────────────────────────────────

interface GradeModalProps {
  submission: Submission;
  assignment: Assignment;
  onClose: () => void;
  onGraded: () => void;
}

function GradeModal({ submission, assignment, onClose, onGraded }: GradeModalProps) {
  const { totalMarks, rubric } = assignment;
  const hasRubric = Array.isArray(rubric) && rubric.length > 0;

  const student = typeof submission.studentId === 'string' ? null : submission.studentId;
  const [marks, setMarks]       = useState(String(submission.marks ?? ''));
  const [feedback, setFeedback] = useState(submission.feedback ?? '');
  const [error, setError]       = useState('');
  const [showPDF, setShowPDF]   = useState(false);

  // Rubric scores state — seed from existing rubricScores or zeros
  const [rubricScores, setRubricScores] = useState<RubricScore[]>(() =>
    rubric?.map((r) => {
      const existing = submission.rubricScores?.find(s => s.criterion === r.criterion);
      return { criterion: r.criterion, maxPoints: r.maxPoints, awardedPoints: existing?.awardedPoints ?? 0 };
    }) ?? []
  );

  const rubricTotal = rubricScores.reduce((sum, r) => sum + r.awardedPoints, 0);

  const hasPDF = isPDF(submission.fileUrl, submission.originalFileName);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = hasRubric
        ? { rubricScores, feedback }
        : { marks: Number(marks), feedback };
      await api.patch(`/assignments/${assignment._id}/submissions/${submission._id}/grade`, body);
    },
    onSuccess: () => { onGraded(); onClose(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to grade submission');
    },
  });

  function handleGrade() {
    setError('');
    if (hasRubric) {
      for (const r of rubricScores) {
        if (r.awardedPoints < 0) return setError(`awardedPoints cannot be negative for "${r.criterion}"`);
        if (r.awardedPoints > r.maxPoints) return setError(`Score exceeds max for "${r.criterion}"`);
      }
    } else {
      if (marks === '' || isNaN(Number(marks))) return setError('Enter a valid marks value');
      if (Number(marks) < 0)          return setError('Marks cannot be negative');
      if (Number(marks) > totalMarks) return setError(`Marks cannot exceed ${totalMarks}`);
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full flex gap-0 ${showPDF ? 'max-w-5xl' : 'max-w-lg'}`}>
        {/* PDF preview panel (#7) */}
        {showPDF && submission.fileUrl && (
          <div className="flex-1 border-r border-gray-200 flex flex-col rounded-l-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 truncate">{submission.originalFileName}</span>
              <button onClick={() => setShowPDF(false)} className="text-gray-400 hover:text-gray-600 text-xs ml-2">Hide</button>
            </div>
            <iframe src={submission.fileUrl} className="flex-1 w-full" style={{ minHeight: '550px' }} title="Submission PDF" />
          </div>
        )}

        {/* Grade panel */}
        <div className={showPDF ? 'w-80 flex flex-col' : 'w-full flex flex-col'}>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Grade Submission</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          <div className="p-6 space-y-4 flex-1 overflow-y-auto">
            {error && <Alert variant="error">{error}</Alert>}

            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p><span className="font-medium">Student:</span> {student ? `${student.firstName} ${student.lastName}` : '—'}</p>
              <p><span className="font-medium">Submitted:</span> {formatDate(submission.submittedAt)}</p>
              <p><span className="font-medium">Status:</span> {statusBadge(submission.status)}</p>
            </div>

            {submission.submissionText && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Text Response</p>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {submission.submissionText}
                </div>
              </div>
            )}

            {submission.fileUrl && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Submitted File</p>
                <div className="flex items-center gap-2">
                  <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:underline truncate flex-1">
                    {submission.originalFileName ?? 'Download file'} ↗
                  </a>
                  {hasPDF && (
                    <button onClick={() => setShowPDF(v => !v)}
                      className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-0.5 whitespace-nowrap">
                      {showPDF ? 'Hide PDF' : 'Preview PDF'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {hasRubric ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Rubric Scoring</label>
                  <span className="text-sm font-semibold text-primary-600">
                    {rubricTotal} / {totalMarks}
                    <span className="text-xs text-gray-400 ml-1">
                      ({Math.round((rubricTotal / totalMarks) * 100)}%)
                    </span>
                  </span>
                </div>
                <div className="space-y-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  {rubricScores.map((r, i) => (
                    <div key={r.criterion}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{r.criterion}</span>
                        <span className="text-xs text-gray-400">/ {r.maxPoints}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-400 rounded-full transition-all"
                            style={{ width: `${Math.min(100, r.maxPoints > 0 ? (r.awardedPoints / r.maxPoints) * 100 : 0)}%` }} />
                        </div>
                        <input
                          type="number" min={0} max={r.maxPoints} value={r.awardedPoints}
                          onChange={(e) => setRubricScores(prev =>
                            prev.map((x, j) => j === i ? { ...x, awardedPoints: Number(e.target.value) } : x)
                          )}
                          className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Live total progress bar */}
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, totalMarks > 0 ? (rubricTotal / totalMarks) * 100 : 0)}%` }} />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Marks <span className="text-gray-400 font-normal">/ {totalMarks}</span>
                </label>
                <Input type="number" min={0} max={totalMarks} value={marks}
                  onChange={(e) => setMarks(e.target.value)} placeholder={`0 – ${totalMarks}`} />
                {marks && !isNaN(Number(marks)) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {Math.round((Number(marks) / totalMarks) * 100)}%
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Feedback (optional)</label>
              <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
                rows={4} placeholder="Provide feedback to the student..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleGrade} loading={mutation.isPending}>Save Grade</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Comments Thread (#9) ─────────────────────────────────────────────────────

interface CommentsThreadProps {
  assignmentId: string;
  submissionId: string;
  comments: SubmissionComment[];
  currentUserId: string;
  onCommentAdded: (comments: SubmissionComment[]) => void;
}

function CommentsThread({ assignmentId, submissionId, comments, currentUserId, onCommentAdded }: CommentsThreadProps) {
  const [text, setText]   = useState('');
  const [error, setError] = useState('');
  const bottomRef         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        `/assignments/${assignmentId}/submissions/${submissionId}/comments`,
        { text: text.trim() }
      );
      return res.data.data.submission as Submission;
    },
    onSuccess: (updated) => {
      setText('');
      setError('');
      onCommentAdded(updated.comments ?? []);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to post comment');
    },
  });

  function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    mutation.mutate();
  }

  function commentUser(c: SubmissionComment) {
    if (typeof c.userId === 'string') return { name: 'User', isMe: c.userId === currentUserId, role: '' };
    return {
      name: `${c.userId.firstName} ${c.userId.lastName}`.trim(),
      isMe: c.userId._id === currentUserId,
      role: c.userId.role,
    };
  }

  const roleLabel: Record<string, string> = {
    instructor: 'Instructor', tenant_admin: 'Admin', student: 'Student', super_admin: 'Admin',
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">
          Private Comments {comments.length > 0 && <span className="text-gray-400 font-normal">({comments.length})</span>}
        </h3>
      </div>

      {/* Thread */}
      <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-3 bg-white">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No comments yet. Start the conversation.</p>
        ) : (
          comments.map((c) => {
            const { name, isMe, role } = commentUser(c);
            return (
              <div key={c._id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  isMe ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-700">{isMe ? 'You' : name}</span>
                    {role && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{roleLabel[role] ?? role}</span>}
                    <span className="text-[10px] text-gray-400">{formatDate(c.createdAt)}</span>
                  </div>
                  <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    isMe ? 'bg-primary-50 text-primary-900 rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                  }`}>
                    {c.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <form onSubmit={handlePost} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment..."
            maxLength={2000}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <Button type="submit" size="sm" loading={mutation.isPending} disabled={!text.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}

// ─── Comments Modal (instructor opens per-row) ────────────────────────────────

interface CommentsModalProps {
  submission: Submission;
  assignmentId: string;
  currentUserId: string;
  onClose: () => void;
  onCommentAdded: (submissionId: string, comments: SubmissionComment[]) => void;
}

function CommentsModal({ submission, assignmentId, currentUserId, onClose, onCommentAdded }: CommentsModalProps) {
  const [comments, setComments] = useState<SubmissionComment[]>(submission.comments ?? []);
  const student = typeof submission.studentId === 'string' ? null : submission.studentId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Private Comments</h2>
            {student && <p className="text-xs text-gray-500">{student.firstName} {student.lastName}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4">
          <CommentsThread
            assignmentId={assignmentId}
            submissionId={submission._id}
            comments={comments}
            currentUserId={currentUserId}
            onCommentAdded={(updated) => {
              setComments(updated);
              onCommentAdded(submission._id, updated);
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Instructor / Admin View ──────────────────────────────────────────────────

interface NotSubmittedStudent {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface InstructorViewProps {
  assignment: Assignment;
  onUpdate: (a: Assignment) => void;
}

// ── Grant Extension Modal ──────────────────────────────────────────────────────

interface ExtensionModalProps {
  assignment: Assignment;
  student: NotSubmittedStudent;
  onClose: () => void;
  onGranted: () => void;
}

function GrantExtensionModal({ assignment, student, onClose, onGranted }: ExtensionModalProps) {
  const minDate = new Date(Date.now() + 60_000).toISOString().slice(0, 16);
  const [extDate, setExtDate] = useState(minDate);
  const [note, setNote]       = useState('');
  const [error, setError]     = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`/assignments/${assignment._id}/extensions`, {
      studentId: student._id, extendedDueDate: extDate, note: note.trim() || undefined,
    }),
    onSuccess: () => { onGranted(); onClose(); },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to grant extension');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Grant Deadline Extension</h2>
        <p className="text-sm text-gray-500">
          For <span className="font-medium text-gray-800">{student.firstName} {student.lastName}</span>
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">New Due Date</label>
          <input type="datetime-local" value={extDate} min={minDate}
            onChange={e => setExtDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Medical extension"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>Grant Extension</Button>
        </div>
      </div>
    </div>
  );
}

function InstructorView({ assignment, onUpdate }: InstructorViewProps) {
  const queryClient = useQueryClient();
  const { user }    = useAuthStore();
  const [editing, setEditing]                       = useState(false);
  const [gradingSubmission, setGradingSubmission]   = useState<Submission | null>(null);
  const [commentsSubmission, setCommentsSubmission] = useState<Submission | null>(null);
  const [gradeQueueOpen, setGradeQueueOpen]         = useState(false);
  const [subPage, setSubPage]                       = useState(1);
  const [subStatus, setSubStatus]                   = useState('');
  const [activeTab, setActiveTab]                   = useState<'overview' | 'submissions'>('overview');
  const [extensionStudent, setExtensionStudent]     = useState<NotSubmittedStudent | null>(null);

  const course     = typeof assignment.courseId    === 'string' ? null : assignment.courseId;
  const instructor = typeof assignment.instructorId === 'string' ? null : assignment.instructorId;

  const [templateSaved, setTemplateSaved] = useState(false);

  const publishMutation = useMutation({
    mutationFn: () => api.patch(`/assignments/${assignment._id}/publish`),
    onSuccess: (res) => onUpdate(res.data.data.assignment),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: () =>
      api.post(`/assignment-templates/from-assignment/${assignment._id}`),
    onSuccess: () => {
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/assignments/${assignment._id}`),
    onSuccess: () => { window.location.href = '/assignments'; },
  });

  // Submissions
  const { data: subsData, isLoading: subsLoading, refetch: refetchSubs } = useQuery({
    queryKey: ['assignment-submissions', assignment._id, subPage, subStatus],
    queryFn: async () => {
      const params: Record<string, string | number> = { page: subPage, limit: 50 };
      if (subStatus) params.status = subStatus;
      const res = await api.get(`/assignments/${assignment._id}/submissions`, { params });
      return res.data.data as {
        submissions: Submission[];
        stats: { totalSubmissions: number; graded: number };
        pagination: { total: number; page: number; limit: number };
      };
    },
    enabled: activeTab === 'submissions',
  });

  // Not-submitted list (#5)
  const { data: notSubData } = useQuery({
    queryKey: ['not-submitted', assignment._id],
    queryFn: async () => {
      const res = await api.get(`/assignments/${assignment._id}/not-submitted`);
      return res.data.data as { notSubmitted: NotSubmittedStudent[]; total: number };
    },
    enabled: activeTab === 'submissions',
  });

  const [localSubmissions, setLocalSubmissions] = useState<Submission[]>([]);

  // Keep local copy in sync with query data so comment updates are reflected immediately
  useEffect(() => {
    if (subsData?.submissions) setLocalSubmissions(subsData.submissions);
  }, [subsData?.submissions]);

  const submissions   = localSubmissions.length ? localSubmissions : (subsData?.submissions ?? []);
  const stats         = subsData?.stats;
  const subTotalPages = Math.ceil((subsData?.pagination.total ?? 0) / 50);
  const notSubmitted  = notSubData?.notSubmitted ?? [];

  function exportCSV() {
    if (!submissions.length) return;
    const rows = [
      ['Student', 'Email', 'Status', 'Marks', 'Submitted At', 'Feedback'],
      ...submissions.map((s) => {
        const st = typeof s.studentId === 'string' ? null : s.studentId;
        return [st ? `${st.firstName} ${st.lastName}` : '', st?.email ?? '',
          s.status, s.marks ?? '', formatDate(s.submittedAt), s.feedback ?? ''];
      }),
    ];
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href  = url;
    link.download = `${assignment.title}-submissions.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
            {statusBadge(assignment.status)}
          </div>
          {course     && <p className="text-sm text-gray-500">Course: {course.title}</p>}
          {instructor && <p className="text-sm text-gray-400">By {instructor.firstName} {instructor.lastName}</p>}
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap items-center">
          {templateSaved && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Template saved
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="outline" size="sm"
            loading={saveTemplateMutation.isPending}
            onClick={() => saveTemplateMutation.mutate()}
            title="Save this assignment as a reusable template">
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Save Template
          </Button>
          <Button
            variant={assignment.status === 'published' ? 'secondary' : 'primary'}
            size="sm" loading={publishMutation.isPending}
            onClick={() => publishMutation.mutate()}
          >
            {assignment.status === 'published' ? 'Unpublish' : 'Publish'}
          </Button>
          <Button variant="danger" size="sm"
            onClick={() => { if (confirm('Delete this assignment?')) deleteMutation.mutate(); }}
            loading={deleteMutation.isPending}>
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          {(['overview', 'submissions'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                activeTab === tab ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab}
              {tab === 'submissions' && assignment.submissionCount > 0 && (
                <span className="ml-1.5 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                  {assignment.submissionCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            {assignment.description && (
              <Card>
                <CardHeader><CardTitle>Description</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-gray-700">{assignment.description}</p></CardContent>
              </Card>
            )}
            {assignment.instructions && (
              <Card>
                <CardHeader><CardTitle>Instructions</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-gray-700 whitespace-pre-wrap">{assignment.instructions}</p></CardContent>
              </Card>
            )}
            {assignment.attachmentUrl && (
              <Card>
                <CardHeader><CardTitle>Attachment</CardTitle></CardHeader>
                <CardContent>
                  <a href={assignment.attachmentUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary-600 hover:underline">
                    Download Reference File ↗
                  </a>
                </CardContent>
              </Card>
            )}

            {assignment.rubric?.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Grading Rubric</CardTitle>
                    <span className="text-xs text-gray-400">{assignment.totalMarks} pts total</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100">
                    {assignment.rubric.map((r) => (
                      <div key={r.criterion} className="flex items-center justify-between px-5 py-3 text-sm">
                        <span className="text-gray-700">{r.criterion}</span>
                        <span className="font-medium text-gray-900">{r.maxPoints} pts</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ['Due Date',         assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : '—'],
                  ['Total Marks',      assignment.totalMarks],
                  ['Late Submission',  assignment.allowLateSubmission ? 'Allowed' : 'Not Allowed'],
                  ['Submission Limit', assignment.maxSubmissions === 0 ? 'Unlimited' : `${assignment.maxSubmissions} per student`],
                  ['Submissions',      assignment.submissionCount],
                  ['Graded',           assignment.gradedCount],
                ].map(([label, val]) => (
                  <div key={String(label)} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className={`font-medium ${label === 'Due Date' && isOverdue(assignment.dueDate) ? 'text-red-600' : 'text-gray-900'}`}>{val}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Submissions Tab */}
      {activeTab === 'submissions' && (
        <div className="space-y-4">
          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Submitted',    value: stats.totalSubmissions, color: 'text-blue-600' },
                { label: 'Graded',       value: stats.graded,           color: 'text-green-600' },
                { label: 'Pending',      value: stats.totalSubmissions - stats.graded, color: 'text-amber-600' },
                { label: 'Not Submitted',value: notSubmitted.length,    color: 'text-red-600' },
              ].map(({ label, value, color }) => (
                <Card key={label}>
                  <CardContent className="py-4 text-center">
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Grade distribution chart (#6) */}
          <GradeDistributionChart submissions={submissions} totalMarks={assignment.totalMarks} />

          {/* Filters + Actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <select value={subStatus} onChange={(e) => { setSubStatus(e.target.value); setSubPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="late">Late</option>
              <option value="graded">Graded</option>
            </select>
            <div className="flex gap-2">
              {submissions.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setGradeQueueOpen(true)}>
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Start Grading
                </Button>
              )}
              {submissions.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
              )}
            </div>
          </div>

          {/* Submissions table */}
          {subsLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : submissions.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-gray-500">No submissions yet.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Submitted</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Marks</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {submissions.map((s) => {
                        const st = typeof s.studentId === 'string' ? null : s.studentId;
                        return (
                          <tr key={s._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{st ? `${st.firstName} ${st.lastName}` : '—'}</p>
                              <p className="text-xs text-gray-400">{st?.email ?? ''}</p>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{formatDate(s.submittedAt)}</td>
                            <td className="px-4 py-3">{statusBadge(s.status)}</td>
                            <td className="px-4 py-3 text-gray-700">
                              {s.marks !== null ? `${s.marks} / ${assignment.totalMarks}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {s.fileUrl && (
                                <a href={s.fileUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-primary-600 text-xs hover:underline mr-3">
                                  File ↗
                                </a>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => setCommentsSubmission(s)} className="mr-1">
                                <span className="flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                  {s.comments?.length > 0 ? s.comments.length : ''}
                                </span>
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setGradingSubmission(s)}>
                                {s.status === 'graded' ? 'Re-grade' : 'Grade'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {subTotalPages > 1 && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={subPage <= 1} onClick={() => setSubPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={subPage >= subTotalPages} onClick={() => setSubPage(p => p + 1)}>Next</Button>
            </div>
          )}

          {/* Not-submitted list (#5) */}
          {notSubmitted.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-700">
                  Not Submitted ({notSubmitted.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-red-50 border-b border-red-100">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-red-700">Student</th>
                      <th className="px-4 py-2.5 text-left font-medium text-red-700">Email</th>
                      <th className="px-4 py-2.5 text-right font-medium text-red-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {notSubmitted.map((s) => {
                      const hasExt = assignment.extensions?.some(e => e.studentId === s._id);
                      return (
                        <tr key={s._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{s.firstName} {s.lastName}</td>
                          <td className="px-4 py-3 text-gray-500">{s.email}</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="outline" size="sm"
                              className={hasExt ? 'text-amber-700 border-amber-300' : ''}
                              onClick={() => setExtensionStudent(s)}>
                              {hasExt ? 'Edit Extension' : 'Grant Extension'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Modals */}
      {editing && (
        <EditAssignmentModal assignment={assignment} onClose={() => setEditing(false)} onSaved={onUpdate} />
      )}
      {gradingSubmission && (
        <GradeModal
          submission={gradingSubmission}
          assignment={assignment}
          onClose={() => setGradingSubmission(null)}
          onGraded={() => {
            refetchSubs();
            queryClient.invalidateQueries({ queryKey: ['assignment', assignment._id] });
            queryClient.invalidateQueries({ queryKey: ['not-submitted', assignment._id] });
          }}
        />
      )}
      {extensionStudent && (
        <GrantExtensionModal
          assignment={assignment}
          student={extensionStudent}
          onClose={() => setExtensionStudent(null)}
          onGranted={() => {
            queryClient.invalidateQueries({ queryKey: ['assignment', assignment._id] });
            queryClient.invalidateQueries({ queryKey: ['not-submitted', assignment._id] });
          }}
        />
      )}
      {commentsSubmission && (
        <CommentsModal
          submission={commentsSubmission}
          assignmentId={assignment._id}
          currentUserId={user?._id ?? ''}
          onClose={() => setCommentsSubmission(null)}
          onCommentAdded={(submissionId, updatedComments) => {
            setLocalSubmissions((prev) =>
              prev.map((s) => s._id === submissionId ? { ...s, comments: updatedComments } : s)
            );
          }}
        />
      )}

      {/* Grade Queue (#2) */}
      {gradeQueueOpen && submissions.length > 0 && (
        <GradeQueue
          submissions={submissions}
          assignment={assignment}
          onClose={() => { setGradeQueueOpen(false); refetchSubs(); }}
          onGraded={(submissionId, patch) => {
            setLocalSubmissions((prev) =>
              prev.map((s) => s._id === submissionId ? { ...s, ...patch } : s)
            );
            queryClient.invalidateQueries({ queryKey: ['assignment', assignment._id] });
          }}
        />
      )}
    </div>
  );
}

// ─── Comments Thread Card (student — wraps CommentsThread in a Card) ─────────

interface CommentsThreadCardProps {
  assignmentId: string;
  submission: Submission;
  currentUserId: string;
  onCommentAdded: (comments: SubmissionComment[]) => void;
}

function CommentsThreadCard({ assignmentId, submission, currentUserId, onCommentAdded }: CommentsThreadCardProps) {
  const [comments, setComments] = useState<SubmissionComment[]>(submission.comments ?? []);

  return (
    <Card>
      <CardContent className="p-0">
        <CommentsThread
          assignmentId={assignmentId}
          submissionId={submission._id}
          comments={comments}
          currentUserId={currentUserId}
          onCommentAdded={(updated) => {
            setComments(updated);
            onCommentAdded(updated);
          }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Student View ─────────────────────────────────────────────────────────────

const DRAFT_KEY = (assignmentId: string, userId: string) =>
  `lms_assignment_draft_${assignmentId}_${userId}`;

interface StudentViewProps { assignment: Assignment }

function StudentView({ assignment }: StudentViewProps) {
  const fileRef     = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { user }    = useAuthStore();

  const [text, setText]         = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  // Draft autosave state (#3)
  const [draftSaved, setDraftSaved]       = useState(false);
  const [showRestore, setShowRestore]     = useState(false);
  const [restoredText, setRestoredText]   = useState('');

  const draftKey = user ? DRAFT_KEY(assignment._id, user._id) : '';

  // On mount: check localStorage for a saved draft (#3)
  useEffect(() => {
    if (!draftKey) return;
    const saved = localStorage.getItem(draftKey);
    if (saved) { setRestoredText(saved); setShowRestore(true); }
  }, [draftKey]);

  // Autosave to localStorage on text change (debounced 1.5s) (#3)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTextChange = useCallback((val: string) => {
    setText(val);
    setDraftSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      if (draftKey && val.trim()) {
        localStorage.setItem(draftKey, val);
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      }
    }, 1500);
  }, [draftKey]);

  function clearDraft() {
    if (draftKey) localStorage.removeItem(draftKey);
  }

  const course = typeof assignment.courseId === 'string' ? null : assignment.courseId;
  const effectiveDueDate = assignment.myExtension?.extendedDueDate ?? assignment.dueDate;
  const overdue  = isOverdue(effectiveDueDate);
  const dueFuture = effectiveDueDate && !overdue;

  const { data: myData, isLoading } = useQuery({
    queryKey: ['my-submission', assignment._id],
    queryFn: async () => {
      const res = await api.get(`/assignments/${assignment._id}/my-submission`);
      return res.data.data as { submission: Submission | null };
    },
  });

  const submission    = myData?.submission ?? null;
  const limitReached  = assignment.maxSubmissions > 0 &&
    (submission?.attemptCount ?? 0) >= assignment.maxSubmissions;
  const canSubmit     = assignment.status === 'published' &&
    (!overdue || assignment.allowLateSubmission) &&
    submission?.status !== 'graded' &&
    !limitReached;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (text.trim()) fd.append('submissionText', text.trim());
      if (file) fd.append('file', file);
      const res = await api.post(`/assignments/${assignment._id}/submit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data.submission;
    },
    onSuccess: () => {
      clearDraft();
      setSuccess('Submission saved successfully!');
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['my-submission', assignment._id] });
      queryClient.invalidateQueries({ queryKey: ['my-submissions-bulk'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Submission failed');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!text.trim() && !file && !submission?.fileUrl)
      return setError('Please add a text response or upload a file.');
    submitMutation.mutate();
  }

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
          {submission && statusBadge(submission.status)}
          {!submission && overdue && <Badge variant="danger">Overdue</Badge>}
        </div>
        {course && <p className="text-sm text-gray-500">Course: {course.title}</p>}
        {/* Countdown timer (#4) */}
        {dueFuture && !submission && (
          <CountdownTimer dueDate={effectiveDueDate!} />
        )}
      </div>

      {/* Meta */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="grid grid-cols-3 gap-4 text-sm text-center">
            <div>
              <p className="text-gray-500">Due Date</p>
              {assignment.myExtension ? (
                <div className="mt-0.5 space-y-0.5">
                  <p className="font-medium text-amber-700 text-xs line-through">
                    {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : '—'}
                  </p>
                  <p className="font-semibold text-green-700 text-sm">
                    {new Date(assignment.myExtension.extendedDueDate).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-green-600">Extended</p>
                </div>
              ) : (
                <p className={`font-medium mt-0.5 ${overdue ? 'text-red-600' : 'text-gray-900'}`}>
                  {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : '—'}
                </p>
              )}
            </div>
            <div>
              <p className="text-gray-500">Total Marks</p>
              <p className="font-medium text-gray-900 mt-0.5">{assignment.totalMarks}</p>
            </div>
            <div>
              <p className="text-gray-500">Late Submission</p>
              <p className="font-medium text-gray-900 mt-0.5">{assignment.allowLateSubmission ? 'Allowed' : 'Not Allowed'}</p>
            </div>
          </div>

          {/* Attempt counter — only show when a limit is set */}
          {assignment.maxSubmissions > 0 && (
            <div className="border-t border-gray-100 pt-3">
              {(() => {
                const used = submission?.attemptCount ?? 0;
                const max  = assignment.maxSubmissions;
                const remaining = max - used;
                const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
                const color = remaining <= 1 ? 'bg-red-500' : remaining <= 2 ? 'bg-amber-400' : 'bg-primary-500';
                const textColor = remaining <= 1 ? 'text-red-600' : remaining <= 2 ? 'text-amber-600' : 'text-gray-700';
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Submissions used</span>
                      <span className={`font-semibold ${textColor}`}>
                        {used} / {max}
                        {remaining === 0 && ' — limit reached'}
                        {remaining === 1 && ' — last submission'}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      {(assignment.description || assignment.instructions) && (
        <Card>
          <CardHeader><CardTitle>Instructions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {assignment.description  && <p className="text-sm text-gray-600">{assignment.description}</p>}
            {assignment.instructions && <p className="text-sm text-gray-700 whitespace-pre-wrap">{assignment.instructions}</p>}
          </CardContent>
        </Card>
      )}

      {/* Reference file */}
      {assignment.attachmentUrl && (
        <Card>
          <CardHeader><CardTitle>Reference File</CardTitle></CardHeader>
          <CardContent>
            <a href={assignment.attachmentUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary-600 hover:underline">
              Download Reference File ↗
            </a>
          </CardContent>
        </Card>
      )}

      {/* Graded result */}
      {submission?.status === 'graded' && (
        <Card>
          <CardHeader><CardTitle>Your Result</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary-600">{submission.marks}</p>
                <p className="text-xs text-gray-400">/ {assignment.totalMarks}</p>
              </div>
              <div className="flex-1">
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((submission.marks ?? 0) / assignment.totalMarks) * 100)}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {Math.round(((submission.marks ?? 0) / assignment.totalMarks) * 100)}% · graded {formatDate(submission.gradedAt)}
                </p>
              </div>
            </div>
            {/* Rubric breakdown */}
            {submission.rubricScores?.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                  Rubric Breakdown
                </div>
                <div className="divide-y divide-gray-100">
                  {submission.rubricScores.map((r) => (
                    <div key={r.criterion} className="px-3 py-2.5 flex items-center gap-3">
                      <span className="flex-1 text-sm text-gray-700">{r.criterion}</span>
                      <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-400 rounded-full"
                          style={{ width: `${r.maxPoints > 0 ? Math.min(100, (r.awardedPoints / r.maxPoints) * 100) : 0}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-800 w-16 text-right">
                        {r.awardedPoints} / {r.maxPoints}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {submission.feedback && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-700 mb-1">Instructor Feedback</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{submission.feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rubric preview (#4) — shown before submission so students know how they'll be graded */}
      {assignment.rubric?.length > 0 && submission?.status !== 'graded' && (
        <Card>
          <CardHeader><CardTitle>Grading Rubric</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {assignment.rubric.map((r) => (
                <div key={r.criterion} className="px-4 py-3 flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-700 flex-1">{r.criterion}</span>
                  <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{r.maxPoints} pts</span>
                </div>
              ))}
              <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Total</span>
                <span className="text-sm font-bold text-gray-900">{assignment.totalMarks} pts</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Draft restore prompt (#3) */}
      {showRestore && canSubmit && (
        <Alert variant="warning">
          <div className="flex items-center justify-between">
            <span className="text-sm">You have an unsaved draft. Restore it?</span>
            <div className="flex gap-2 ml-4">
              <button onClick={() => { setText(restoredText); setShowRestore(false); }}
                className="text-sm font-medium text-amber-800 hover:underline">Restore</button>
              <button onClick={() => { clearDraft(); setShowRestore(false); }}
                className="text-sm text-amber-700 hover:underline">Discard</button>
            </div>
          </div>
        </Alert>
      )}

      {/* Submission form */}
      {canSubmit && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{submission ? 'Update Your Submission' : 'Submit Assignment'}</CardTitle>
              {draftSaved && <span className="text-xs text-green-600 font-medium">Draft saved</span>}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error   && <Alert variant="error">{error}</Alert>}
              {success && <Alert variant="success">{success}</Alert>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Text Response</label>
                <textarea value={text} onChange={(e) => handleTextChange(e.target.value)} rows={7}
                  placeholder={submission?.submissionText ?? 'Write your response here...'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                {submission?.submissionText && !text && (
                  <p className="text-xs text-gray-400 mt-1">Leave blank to keep existing response.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File Upload</label>
                {submission?.fileUrl && !file && (
                  <div className="flex items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-500">Current:</span>
                    <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer"
                      className="text-primary-600 hover:underline">
                      {submission.originalFileName ?? 'Submitted file'} ↗
                    </a>
                  </div>
                )}
                <input ref={fileRef} type="file" className="hidden"
                  accept={
                    assignment.allowedFileTypes?.length
                      ? assignment.allowedFileTypes.map(t => `.${t}`).join(',')
                      : '.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.jpg,.jpeg,.png,.webp'
                  }
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file
                  ? <div className="flex items-center gap-2"><span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <button type="button" onClick={() => setFile(null)} className="text-red-500 text-xs">Remove</button></div>
                  : <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      {submission?.fileUrl ? 'Replace File' : 'Upload File'}
                    </Button>
                }
                {assignment.allowedFileTypes?.length > 0 ? (
                  <p className="text-xs text-amber-700 mt-1 font-medium">
                    Accepted: {assignment.allowedFileTypes.map(t => t.toUpperCase()).join(', ')} — max 50 MB
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, ZIP — max 50 MB</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="submit" loading={submitMutation.isPending}>
                  {submission ? 'Update Submission' : 'Submit Assignment'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Already submitted (not graded) */}
      {submission && submission.status !== 'graded' && (
        <Card>
          <CardHeader><CardTitle>Your Submission</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-gray-500">Submitted:</span> {formatDate(submission.submittedAt)}</p>
            <p><span className="text-gray-500">Status:</span> {statusBadge(submission.status)}</p>
            {submission.submissionText && (
              <div>
                <p className="text-gray-500 mb-1">Your response:</p>
                <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-2">{submission.submissionText}</p>
              </div>
            )}
            {submission.fileUrl && (
              <p><span className="text-gray-500">File:</span>{' '}
                <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  {submission.originalFileName ?? 'View file'} ↗
                </a>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {overdue && !assignment.allowLateSubmission && !submission && (
        <Alert variant="error">The submission deadline has passed and late submissions are not allowed.</Alert>
      )}

      {limitReached && submission?.status !== 'graded' && (
        <Alert variant="error">
          You have used all {assignment.maxSubmissions} allowed submission{assignment.maxSubmissions > 1 ? 's' : ''} for this assignment.
        </Alert>
      )}

      {/* Comments thread (#9) — visible once a submission exists */}
      {submission && user && (
        <CommentsThreadCard
          assignmentId={assignment._id}
          submission={submission}
          currentUserId={user._id}
          onCommentAdded={(updated) => {
            queryClient.setQueryData(
              ['my-submission', assignment._id],
              (old: { assignment: Assignment; submission: Submission } | undefined) =>
                old ? { ...old, submission: { ...old.submission, comments: updated } } : old
            );
          }}
        />
      )}
    </div>
  );
}

// ─── Root Page ────────────────────────────────────────────────────────────────

export default function AssignmentDetailPage() {
  const { id }      = useParams<{ id: string }>();
  const { user }    = useAuthStore();
  const queryClient = useQueryClient();

  const { data: assignment, isLoading, isPending, error } = useQuery({
    queryKey: ['assignment', id],
    queryFn: async () => {
      const res = await api.get(`/assignments/${id}`);
      return res.data.data.assignment as Assignment;
    },
  });

  function handleUpdate(updated: Assignment) {
    queryClient.setQueryData(['assignment', id], updated);
  }

  const isManager = user?.role === 'tenant_admin' || user?.role === 'instructor';

  if (isLoading || isPending) return (
    <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  );

  if (error || !assignment) return (
    <div className="p-6"><Alert variant="error">Assignment not found or you do not have access.</Alert></div>
  );

  if (isManager) return <InstructorView assignment={assignment} onUpdate={handleUpdate} />;
  return <StudentView assignment={assignment} />;
}
