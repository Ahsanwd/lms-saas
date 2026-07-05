'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Badge, Spinner, Card, Alert } from '@/components/ui';
import { AxiosError } from 'axios';
import { cn } from '@/lib/utils';
import type { Role } from '@/types';

interface TenantUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  status: 'active' | 'suspended' | 'unverified';
  avatar?: string;
  lastLoginAt?: string;
  createdAt: string;
}

const ROLE_BADGE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  tenant_admin: 'warning',
  instructor: 'success',
  student: 'default',
};

const STATUS_BADGE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  active: 'success',
  suspended: 'danger',
  unverified: 'warning',
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'instructor', label: 'Instructor' },
  { value: 'student', label: 'Student' },
  { value: 'tenant_admin', label: 'Admin' },
];

const CSV_TEMPLATE = `firstName,lastName,email,role
John,Doe,john@example.com,student
Jane,Smith,jane@example.com,instructor
Bob,Admin,bob@example.com,tenant_admin`;

// ── CSV parser (client-side preview) ─────────────────────────────────────────
function parseCsvPreview(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 1) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map(h => h.replace(/"/g, ''));
  const rows = lines.slice(1, 6).map(line => { // preview first 5 rows
    const vals = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').replace(/^"|"$/g, ''); });
    return row;
  });

  return { headers, rows };
}

// ── Download template helper ──────────────────────────────────────────────────
function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'users-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import Modal ──────────────────────────────────────────────────────────────
interface ImportResult {
  imported: number;
  failed: { row: number; email: string; reason: string }[];
}

interface ValidationResult {
  total: number;
  validCount: number;
  invalidCount: number;
  valid: { row: number; firstName: string; lastName: string; email: string; role: string }[];
  invalid: { row: number; email: string; reason: string }[];
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv')) { setError('Please select a .csv file'); return; }
    setFile(f);
    setError('');
    setValidationResult(null);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setPreview(parseCsvPreview(text));
    };
    reader.readAsText(f);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/users/bulk-import/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as ValidationResult;
    },
    onSuccess: (data) => setValidationResult(data),
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Validation failed');
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/users/bulk-import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as ImportResult;
    },
    onSuccess: (data) => {
      setImportResult(data);
      if (data.imported > 0) qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Import failed');
    },
  });

  const hasRequiredCols = preview ? ['firstName', 'lastName', 'email'].every(h =>
    preview.headers.some(ph => ph.toLowerCase() === h.toLowerCase())
  ) : false;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bulk Import Users</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {importResult ? 'Import complete' : validationResult ? 'Review validation results before importing' : 'Upload a CSV to invite multiple users at once'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step 3: Import done ── */}
          {importResult ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{importResult.imported}</p>
                  <p className="text-sm text-green-700 font-medium mt-1">Invitations Sent</p>
                </div>
                <div className={cn('border rounded-xl p-4 text-center', importResult.failed.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
                  <p className={cn('text-3xl font-bold', importResult.failed.length > 0 ? 'text-red-600' : 'text-gray-400')}>{importResult.failed.length}</p>
                  <p className={cn('text-sm font-medium mt-1', importResult.failed.length > 0 ? 'text-red-700' : 'text-gray-500')}>Failed</p>
                </div>
              </div>
              {importResult.failed.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Failed rows</p>
                  <div className="border border-red-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-red-50 border-b border-red-100">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wide w-16">Row</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wide">Email</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wide">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50">
                        {importResult.failed.map((f, i) => (
                          <tr key={i} className="hover:bg-red-50/50">
                            <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{f.row}</td>
                            <td className="px-4 py-2.5 text-gray-700">{f.email}</td>
                            <td className="px-4 py-2.5 text-red-600">{f.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

          ) : validationResult ? (
            /* ── Step 2: Validation results ── */
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-700">{validationResult.total}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total rows</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{validationResult.validCount}</p>
                  <p className="text-xs text-green-700 mt-0.5">Ready to import</p>
                </div>
                <div className={cn('border rounded-xl p-3 text-center', validationResult.invalidCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
                  <p className={cn('text-2xl font-bold', validationResult.invalidCount > 0 ? 'text-red-600' : 'text-gray-400')}>{validationResult.invalidCount}</p>
                  <p className={cn('text-xs mt-0.5', validationResult.invalidCount > 0 ? 'text-red-700' : 'text-gray-500')}>Will be skipped</p>
                </div>
              </div>

              {validationResult.invalidCount > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Rows with errors</p>
                  <div className="border border-red-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-red-50 border-b border-red-100">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wide w-16">Row</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wide">Email</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wide">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50">
                        {validationResult.invalid.map((r, i) => (
                          <tr key={i} className="hover:bg-red-50/50">
                            <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{r.row}</td>
                            <td className="px-4 py-2.5 text-gray-700">{r.email}</td>
                            <td className="px-4 py-2.5 text-red-600">{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {validationResult.validCount > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    Valid rows — will be imported
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      (showing {Math.min(10, validationResult.valid.length)} of {validationResult.validCount})
                    </span>
                  </p>
                  <div className="border border-green-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-green-50 border-b border-green-100">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-green-700 uppercase tracking-wide w-12">Row</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-green-700 uppercase tracking-wide">Name</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-green-700 uppercase tracking-wide">Email</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-green-700 uppercase tracking-wide">Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-green-50">
                        {validationResult.valid.slice(0, 10).map((r, i) => (
                          <tr key={i} className="hover:bg-green-50/50">
                            <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{r.row}</td>
                            <td className="px-4 py-2.5 text-gray-700">{r.firstName} {r.lastName}</td>
                            <td className="px-4 py-2.5 text-gray-600">{r.email}</td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 capitalize">
                                {r.role || 'student'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {validationResult.validCount === 0 && (
                <Alert variant="error">No valid rows found. Fix the errors above and re-upload the file.</Alert>
              )}

              <button
                className="text-sm text-primary-600 hover:text-primary-700 underline"
                onClick={() => { setValidationResult(null); setError(''); }}
              >
                ← Change file
              </button>
            </div>

          ) : (
            /* ── Step 1: Select file ── */
            <>
              <div className="flex items-center justify-between bg-primary-50 border border-primary-100 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-primary-800">Need a template?</p>
                  <p className="text-xs text-primary-600 mt-0.5">Required columns: firstName, lastName, email, role</p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-white border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Template
                </button>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                  dragging ? 'border-primary-400 bg-primary-50' :
                  file ? 'border-green-400 bg-green-50' :
                  'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                {file ? (
                  <div className="space-y-1">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="font-medium text-gray-800 text-sm">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB · click to change</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-700">Drop CSV file here or click to browse</p>
                    <p className="text-xs text-gray-400">Only .csv files · max 5 MB</p>
                  </div>
                )}
              </div>

              {error && <Alert variant="error">{error}</Alert>}

              {preview && preview.rows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">
                      Preview <span className="ml-1.5 text-xs font-normal text-gray-400">(first {preview.rows.length} rows)</span>
                    </p>
                    {!hasRequiredCols && (
                      <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        Missing required columns
                      </span>
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            {preview.headers.map(h => (
                              <th key={h} className={cn(
                                'text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap',
                                ['firstname', 'lastname', 'email'].includes(h.toLowerCase()) ? 'text-primary-700' : 'text-gray-500'
                              )}>
                                {h}{['firstname', 'lastname', 'email'].includes(h.toLowerCase()) && <span className="ml-1 text-primary-400">*</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {preview.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              {preview.headers.map(h => (
                                <td key={h} className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                                  {row[h] || <span className="text-gray-300 italic text-xs">empty</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    Role options: <span className="font-medium text-gray-600">student</span>, <span className="font-medium text-gray-600">instructor</span>, <span className="font-medium text-gray-600">tenant_admin</span>. Defaults to student if blank.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {importResult ? (
            <>
              <p className="text-sm text-gray-500">
                {importResult.imported > 0 ? 'Invited users will receive an email to set their password.' : 'No users were imported.'}
              </p>
              <Button onClick={onClose}>Done</Button>
            </>
          ) : validationResult ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                disabled={validationResult.validCount === 0 || importMutation.isPending}
                loading={importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                {importMutation.isPending ? 'Importing…' : `Import ${validationResult.validCount} user${validationResult.validCount !== 1 ? 's' : ''}`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                disabled={!file || !hasRequiredCols || validateMutation.isPending}
                loading={validateMutation.isPending}
                onClick={() => validateMutation.mutate()}
              >
                {validateMutation.isPending ? 'Validating…' : 'Validate CSV'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Invite Modal ──────────────────────────────────────────────────────────────
const EXPIRY_OPTIONS = [
  { value: 24,  label: '24 hours' },
  { value: 48,  label: '48 hours' },
  { value: 72,  label: '3 days (default)' },
  { value: 168, label: '1 week' },
  { value: 336, label: '2 weeks' },
  { value: 720, label: '30 days' },
];

function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: tenantDefault } = useQuery<number | undefined>({
    queryKey: ['tenant-invite-expiry'],
    queryFn: () => api.get('/tenant').then(r => (r.data.data.tenant ?? r.data.data)?.settings?.defaultInviteExpiryHours),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (tenantDefault) setExpiresInHours(tenantDefault);
  }, [tenantDefault]);

  const mutation = useMutation({
    mutationFn: () => api.post('/users/invite', { name, email, role, expiresInHours }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setInviteUrl(res.data?.data?.inviteUrl ?? '');
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Failed to send invitation');
    },
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inviteUrl) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Invite Created</h2>
              <p className="text-sm text-gray-500">Share this link with {email}</p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
            <p className="text-xs text-gray-500 mb-1.5 font-medium">Invite Link</p>
            <p className="text-xs text-gray-700 break-all font-mono leading-relaxed">{inviteUrl}</p>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={handleCopy}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
                copied
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              )}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Link
                </>
              )}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`You've been invited! Click this link to create your account:\n${inviteUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Link expires in {expiresInHours >= 168 ? `${expiresInHours / 168} week(s)` : expiresInHours >= 24 ? `${expiresInHours / 24} day(s)` : `${expiresInHours} hour(s)`}.
            {' '}Student must click the link and set their password.
          </p>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Invite User</h2>
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              autoFocus
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invite link expires in</label>
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={mutation.isPending}
            disabled={!name.trim() || !email.trim()}
            onClick={() => mutation.mutate()}
          >
            Send Invite
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Role Change Modal ─────────────────────────────────────────────────────────
function RoleModal({ user, onClose }: { user: TenantUser; onClose: () => void }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>(user.role);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.patch(`/users/${user._id}/role`, { role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Failed to update role');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Change Role</h2>
        <p className="text-sm text-gray-500 mb-4">{user.firstName} {user.lastName} · {user.email}</p>
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white mb-6"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>Save</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [roleModal, setRoleModal] = useState<TenantUser | null>(null);
  const [actionError, setActionError] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: ['users', search, roleFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/users?${params}`);
      return data.data as { users: TenantUser[]; pagination: { total: number } };
    },
  });

  const handleError = (err: AxiosError<{ message: string }>) => {
    setActionError(err.response?.data?.message ?? 'Action failed');
    setTimeout(() => setActionError(''), 4000);
  };

  const suspendMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/suspend`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: handleError,
  });

  const unsuspendMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/unsuspend`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: handleError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: handleError,
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/users/export?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError('Export failed. Please try again.');
      setTimeout(() => setActionError(''), 4000);
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days  = Math.floor(diff / 86_400_000);
    if (mins  <  2) return 'just now';
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days  ===1) return 'yesterday';
    if (days  < 30) return `${days}d ago`;
    return formatDate(iso);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.pagination?.total ?? 0} total</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Export */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Export CSV
          </button>

          {/* Import */}
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Import CSV
          </button>

          {/* Invite */}
          <Button onClick={() => setInviteOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Invite User
          </Button>
        </div>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}
      {isError && (
        <Alert variant="error">
          Failed to load users: {(queryError as AxiosError<{ message: string }>)?.response?.data?.message ?? (queryError as Error)?.message ?? 'Unknown error'}
        </Alert>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">All Roles</option>
          <option value="tenant_admin">Admin</option>
          <option value="instructor">Instructor</option>
          <option value="student">Student</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="unverified">Unverified</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (data?.users?.length ?? 0) === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-gray-900 font-medium">No users found</p>
            <p className="text-gray-500 text-sm mt-1">Invite someone or import a CSV to get started.</p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setImportOpen(true)}>Import CSV</Button>
              <Button onClick={() => setInviteOpen(true)}>Invite User</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Last Login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data!.users.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-gray-100" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 text-primary-700 font-semibold text-xs uppercase">
                          {u.firstName?.[0] ?? u.email[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{u.firstName} {u.lastName}</p>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={ROLE_BADGE[u.role] ?? 'default'}>
                      {u.role === 'tenant_admin' ? 'Admin' : u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={STATUS_BADGE[u.status] ?? 'default'}>{u.status}</Badge>
                  </td>
                  <td className="px-4 py-4 text-gray-500">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-4 text-gray-500">
                    {u.lastLoginAt ? (
                      <span title={new Date(u.lastLoginAt).toLocaleString()}>
                        {formatRelative(u.lastLoginAt)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setRoleModal(u)}>Role</Button>
                      {u.status === 'suspended' ? (
                        <Button size="sm" variant="ghost" loading={unsuspendMutation.isPending}
                          onClick={() => unsuspendMutation.mutate(u._id)}>
                          Unsuspend
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" loading={suspendMutation.isPending}
                          onClick={() => suspendMutation.mutate(u._id)}>
                          <span className="text-amber-600">Suspend</span>
                        </Button>
                      )}
                      <Button size="sm" variant="danger"
                        onClick={() => {
                          if (confirm(`Delete ${u.firstName} ${u.lastName}? This cannot be undone.`))
                            deleteMutation.mutate(u._id);
                        }}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen  && <InviteModal onClose={() => setInviteOpen(false)} />}
      {importOpen  && <ImportModal onClose={() => setImportOpen(false)} />}
      {roleModal   && <RoleModal user={roleModal} onClose={() => setRoleModal(null)} />}
    </div>
  );
}
