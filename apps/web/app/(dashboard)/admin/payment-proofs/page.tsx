'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ManualStatus = 'pending' | 'awaiting_review' | 'completed' | 'rejected';

interface ManualPayment {
  _id: string;
  status: ManualStatus;
  amount: number;
  currency: string;
  proofImageUrl: string | null;
  proofUploadedAt: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  userId: { _id: string; firstName: string; lastName: string; email: string } | null;
  courseId?: { _id: string; title: string; thumbnail?: string } | null;
  bundleId?: { _id: string; title: string } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(status: ManualStatus) {
  const map = {
    pending:          { variant: 'default' as const, label: 'Awaiting Proof' },
    awaiting_review:  { variant: 'warning' as const, label: 'Pending Review' },
    completed:        { variant: 'success' as const, label: 'Approved' },
    rejected:         { variant: 'danger'  as const, label: 'Rejected' },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Approve Modal ─────────────────────────────────────────────────────────────

function ApproveModal({ payment, onConfirm, onCancel, loading }: {
  payment: ManualPayment; onConfirm: (reviewNote: string) => void; onCancel: () => void; loading: boolean;
}) {
  const [note, setNote] = useState('');
  const itemTitle = payment.courseId?.title ?? payment.bundleId?.title ?? '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Approve Payment</h2>
        <p className="text-sm text-gray-500">
          Enroll <span className="font-medium text-gray-800">{payment.userId ? `${payment.userId.firstName} ${payment.userId.lastName}` : 'this student'}</span> in{' '}
          <span className="font-medium text-gray-800">{itemTitle}</span> for {formatAmount(payment.amount, payment.currency)}?
        </p>
        <div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button onClick={() => onConfirm(note.trim())} loading={loading}>Approve &amp; Enroll</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Reject Modal ──────────────────────────────────────────────────────────────

const MIN_REJECT_CHARS = 10;

function RejectModal({ onConfirm, onCancel, loading }: {
  onConfirm: (note: string) => void; onCancel: () => void; loading: boolean;
}) {
  const [note, setNote] = useState('');
  const tooShort = note.trim().length < MIN_REJECT_CHARS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Reject Payment Proof</h2>
        <p className="text-sm text-gray-500">Explain why so the student knows what to fix before re-uploading.</p>
        <div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Screenshot doesn't show the transaction amount..."
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <p className={`text-xs mt-1 ${tooShort ? 'text-red-500' : 'text-gray-400'}`}>
            {note.trim().length}/{MIN_REJECT_CHARS} characters minimum
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm(note.trim())} loading={loading} disabled={tooShort}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Screenshot lightbox ───────────────────────────────────────────────────────

function ProofLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Payment proof" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const STATUS_TABS: { value: '' | ManualStatus; label: string }[] = [
  { value: 'awaiting_review', label: 'Pending Review' },
  { value: 'completed',       label: 'Approved' },
  { value: 'rejected',        label: 'Rejected' },
  { value: '',                label: 'All' },
];

export default function AdminPaymentProofsPage() {
  const qc = useQueryClient();
  const [kind, setKind]                 = useState<'course' | 'bundle'>('course');
  const [statusFilter, setStatusFilter] = useState<'' | ManualStatus>('awaiting_review');
  const [page, setPage]                 = useState(1);
  const [approveTarget, setApproveTarget] = useState<ManualPayment | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl]     = useState<string | null>(null);

  const listUrl    = kind === 'course' ? '/payments/manual' : '/payments/bundles/manual';
  const actionBase = kind === 'course' ? '/payments' : '/payments/bundles';

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-payment-proofs', kind, statusFilter, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const res = await api.get(listUrl, { params });
      return res.data.data as { payments: ManualPayment[]; total: number; page: number; limit: number };
    },
  });

  const payments   = data?.payments ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-payment-proofs'] });

  const approveMutation = useMutation({
    mutationFn: ({ paymentId, reviewNote }: { paymentId: string; reviewNote: string }) =>
      api.post(`${actionBase}/${paymentId}/approve`, { reviewNote }),
    onSuccess: () => { setApproveTarget(null); invalidate(); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ paymentId, reviewNote }: { paymentId: string; reviewNote: string }) =>
      api.post(`${actionBase}/${paymentId}/reject`, { reviewNote }),
    onSuccess: () => { setRejectTarget(null); invalidate(); },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Proofs</h1>
        <p className="text-sm text-gray-500 mt-0.5">Review manually-submitted bank/JazzCash/EasyPaisa payment screenshots</p>
      </div>

      {error && <Alert variant="error">Failed to load payment proofs.</Alert>}
      {approveMutation.isError && <Alert variant="error">Failed to approve payment. Please try again.</Alert>}
      {rejectMutation.isError && <Alert variant="error">Failed to reject payment. Please try again.</Alert>}

      <div className="grid grid-cols-2 gap-2 max-w-xs">
        {(['course', 'bundle'] as const).map(k => (
          <button key={k} type="button" onClick={() => { setKind(k); setPage(1); }}
            className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
              kind === k ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>
            {k === 'course' ? 'Course Purchases' : 'Bundle Purchases'}
          </button>
        ))}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button key={tab.value} onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === tab.value ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : payments.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <p className="text-gray-500">No payment proofs found.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{total} payment{total !== 1 ? 's' : ''}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">{kind === 'course' ? 'Course' : 'Bundle'}</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Proof</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Uploaded</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => {
                    const isActing =
                      (approveMutation.isPending && approveMutation.variables?.paymentId === p._id) ||
                      (rejectMutation.isPending && rejectMutation.variables?.paymentId === p._id);
                    const itemTitle = p.courseId?.title ?? p.bundleId?.title ?? '—';

                    return (
                      <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{p.userId ? `${p.userId.firstName} ${p.userId.lastName}` : '—'}</p>
                          <p className="text-xs text-gray-400">{p.userId?.email ?? ''}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900 max-w-[160px] truncate">{itemTitle}</p>
                          {p.reviewNote && <p className="text-xs text-gray-400 mt-0.5 italic max-w-[200px] truncate">Note: {p.reviewNote}</p>}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{formatAmount(p.amount, p.currency)}</td>
                        <td className="px-4 py-3">
                          {p.proofImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.proofImageUrl} alt="Payment proof thumbnail"
                              onClick={() => setLightboxUrl(p.proofImageUrl)}
                              className="w-12 h-12 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80" />
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(p.proofUploadedAt)}</td>
                        <td className="px-4 py-3">{statusBadge(p.status)}</td>
                        <td className="px-4 py-3">
                          {p.status === 'awaiting_review' && (
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" loading={isActing && approveMutation.variables?.paymentId === p._id}
                                disabled={isActing} onClick={() => setApproveTarget(p)}>
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" disabled={isActing} onClick={() => setRejectTarget(p._id)}>
                                Reject
                              </Button>
                            </div>
                          )}
                          {p.status !== 'awaiting_review' && (
                            <p className="text-xs text-gray-400 text-right">{formatDate(p.reviewedAt)}</p>
                          )}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {page} of {totalPages} · {total} total</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {approveTarget && (
        <ApproveModal
          payment={approveTarget}
          loading={approveMutation.isPending}
          onCancel={() => setApproveTarget(null)}
          onConfirm={(reviewNote) => approveMutation.mutate({ paymentId: approveTarget._id, reviewNote })}
        />
      )}

      {rejectTarget && (
        <RejectModal
          loading={rejectMutation.isPending}
          onCancel={() => setRejectTarget(null)}
          onConfirm={(reviewNote) => rejectMutation.mutate({ paymentId: rejectTarget, reviewNote })}
        />
      )}

      {lightboxUrl && <ProofLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
