'use client';

import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { Course, RubricCriterion, AssignmentTemplate } from '@/types';

// ─── Rubric Builder ───────────────────────────────────────────────────────────

interface RubricBuilderProps {
  rubric: RubricCriterion[];
  onChange: (rubric: RubricCriterion[]) => void;
}

function RubricBuilder({ rubric, onChange }: RubricBuilderProps) {
  const total = rubric.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0);
  return (
    <div className="space-y-3">
      {rubric.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No criteria added. Click "Add Criterion" to build a rubric.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_100px_32px] gap-2 text-xs font-medium text-gray-500 px-1">
            <span>Criterion</span>
            <span className="text-center">Max Points</span>
            <span />
          </div>
          {rubric.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_32px] gap-2 items-center">
              <input
                value={r.criterion}
                onChange={(e) => onChange(rubric.map((x, j) => j === i ? { ...x, criterion: e.target.value } : x))}
                placeholder="e.g. Research & Analysis"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <input
                type="number" min={0} value={r.maxPoints}
                onChange={(e) => onChange(rubric.map((x, j) => j === i ? { ...x, maxPoints: Number(e.target.value) } : x))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
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

// ─── Template Picker ──────────────────────────────────────────────────────────

interface TemplatePickerProps {
  onApply: (t: AssignmentTemplate) => void;
}

function TemplatePicker({ onApply }: TemplatePickerProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'instructor' || user?.role === 'tenant_admin' || user?.role === 'super_admin';

  const { data, isLoading } = useQuery({
    queryKey: ['assignment-templates'],
    queryFn: async () => {
      const res = await api.get('/assignment-templates');
      return res.data.data.templates as AssignmentTemplate[];
    },
    enabled: isManager,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assignment-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignment-templates'] }),
  });

  const templates = data ?? [];
  const [open, setOpen] = useState(false);

  // Don't render anything while loading or when no templates exist
  if (!isManager || isLoading || templates.length === 0) return null;

  return (
    <Card>
      <CardContent className="py-4">
        <div>
          <button type="button" onClick={() => setOpen(v => !v)}
            className="flex items-center gap-2 text-sm text-primary-600 font-medium hover:text-primary-700 w-full">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="flex-1 text-left">
              Start from a saved template
              <span className="ml-1.5 text-xs font-normal text-gray-400">({templates.length} available)</span>
            </span>
            <svg className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
              <div className="divide-y divide-gray-100">
                {templates.map((t) => (
                  <div key={t._id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.totalMarks} pts
                        {t.rubric?.length > 0 && ` · ${t.rubric.length} rubric criteria`}
                        {t.allowLateSubmission && ' · Late OK'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button type="button" size="sm" onClick={() => { onApply(t); setOpen(false); }}>
                        Use
                      </Button>
                      <button type="button"
                        onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(t._id); }}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateAssignmentPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title:               '',
    description:         '',
    instructions:        '',
    courseId:            '',
    dueDate:             '',
    totalMarks:          '100',
    allowLateSubmission: false,
    maxSubmissions:      '0',
  });
  const [rubric, setRubric] = useState<RubricCriterion[]>([]);
  const [file, setFile]     = useState<File | null>(null);
  const [error, setError]   = useState('');

  const hasRubric   = rubric.some(r => r.criterion.trim());
  const rubricTotal = rubric.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0);

  function applyTemplate(t: AssignmentTemplate) {
    setForm(f => ({
      ...f,
      title:               t.title,
      description:         t.description ?? '',
      instructions:        t.instructions ?? '',
      totalMarks:          String(t.totalMarks),
      allowLateSubmission: t.allowLateSubmission,
      maxSubmissions:      '0',
    }));
    setRubric(t.rubric ?? []);
  }

  const { data: coursesData } = useQuery({
    queryKey: ['courses-for-assignment'],
    queryFn: async () => {
      const res = await api.get('/courses', { params: { limit: 100, status: 'published' } });
      return res.data.data as { courses: Course[] };
    },
  });

  const courses = coursesData?.courses ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => formData.append(k, String(v)));
      const validRubric = rubric.filter(r => r.criterion.trim());
      if (validRubric.length > 0) {
        formData.append('rubric', JSON.stringify(validRubric));
        formData.delete('totalMarks');
      }
      if (file) formData.append('attachment', file);
      const res = await api.post('/assignments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data.assignment;
    },
    onSuccess: (assignment) => router.push(`/assignments/${assignment._id}`),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to create assignment');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError('Title is required');
    if (!form.courseId)     return setError('Please select a course');
    if (hasRubric && rubricTotal === 0) return setError('Rubric criteria must have maxPoints > 0');
    createMutation.mutate();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Assignment</h1>
        <p className="text-sm text-gray-500 mt-0.5">Fill in the details below to create a new assignment.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <Alert variant="error">{error}</Alert>}

        {/* Template picker — renders its own Card only when templates exist, null otherwise */}
        <TemplatePicker onApply={applyTemplate} />

        {/* Basic Info */}
        <Card>
          <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Week 3 — Data Structures Essay"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Course *</label>
              <select
                value={form.courseId}
                onChange={(e) => setForm(f => ({ ...f, courseId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select a course...</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>{c.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Brief description visible in the assignment list..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instructions</label>
              <textarea
                value={form.instructions}
                onChange={(e) => setForm(f => ({ ...f, instructions: e.target.value }))}
                rows={6}
                placeholder="Detailed instructions for students..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Marks
                  {hasRubric && (
                    <span className="ml-1.5 text-xs text-primary-600 font-normal">(auto from rubric: {rubricTotal})</span>
                  )}
                </label>
                <Input
                  type="number" min={1}
                  value={hasRubric ? String(rubricTotal) : form.totalMarks}
                  readOnly={hasRubric}
                  onChange={(e) => !hasRubric && setForm(f => ({ ...f, totalMarks: e.target.value }))}
                  className={hasRubric ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.allowLateSubmission}
                onChange={(e) => setForm(f => ({ ...f, allowLateSubmission: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Allow late submissions after due date</span>
            </label>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Submission Limit
                <span className="ml-1.5 font-normal text-gray-400 text-xs">0 = unlimited re-submissions</span>
              </label>
              <select
                value={form.maxSubmissions}
                onChange={(e) => setForm(f => ({ ...f, maxSubmissions: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="0">Unlimited</option>
                <option value="1">1 submission (no resubmission)</option>
                <option value="2">2 submissions</option>
                <option value="3">3 submissions</option>
                <option value="5">5 submissions</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Grading Rubric */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Grading Rubric</CardTitle>
                <p className="text-xs text-gray-400 mt-0.5">Optional — define criteria for rubric-based grading</p>
              </div>
              {hasRubric && (
                <span className="text-xs bg-primary-50 text-primary-700 font-medium px-2 py-1 rounded-full border border-primary-200">
                  {rubric.filter(r => r.criterion.trim()).length} criteria · {rubricTotal} pts
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <RubricBuilder rubric={rubric} onChange={setRubric} />
          </CardContent>
        </Card>

        {/* Attachment */}
        <Card>
          <CardHeader><CardTitle>Attachment (Optional)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-3">Upload a reference file for students (PDF, Word, Excel, ZIP — max 50 MB).</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-sm text-gray-700 flex-1 truncate">{file.name}</span>
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                  Remove
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>Choose File</Button>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={createMutation.isPending}>Create Assignment</Button>
        </div>
      </form>
    </div>
  );
}
