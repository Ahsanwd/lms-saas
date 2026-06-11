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

interface RefundRequest {
  _id: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  adminNote?: string;
  resolvedAt?: string;
  createdAt: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  userId: { _id: string; firstName: string; lastName: string; email: string } | null;
  courseId: { _id: string; title: string } | null;
  paymentId: {
    _id: string;
    amount: number;
    currency: string;
    receiptNumber?: string;
    provider: string;
    paidAt?: string;
  } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(status: RefundRequest['status']) {
  const map = {
    pending:  { variant: 'warning'  as const, label: 'Pending'  },
    approved: { variant: 'success'  as const, label: 'Approved' },
    rejected: { variant: 'danger'   as const, label: 'Rejected' },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Approve Modal ─────────────────────────────────────────────────────────────

function ApproveModal({
  request,
  onConfirm,
  onCancel,
  loading,
}: {
  request: RefundRequest;
  onConfirm: (refundAmount: number | null) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const maxCents       = request.paymentId?.amount ?? 0;
  const currency       = request.paymentId?.currency ?? 'USD';
  const suggestedCents = request.requestedAmount ?? maxCents;

  const [isPartial, setIsPartial]     = useState(request.requestedAmount !== null && request.requestedAmount < maxCents);
  const [amountCents, setAmountCents] = useState<number>(suggestedCents);

  const amountDollars = amountCents / 100;
  const maxDollars    = maxCents / 100;
  const isValid       = isPartial ? amountCents > 0 && amountCents <= maxCents : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Approve Refund</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Payment total: <span className="font-medium text-gray-800">{formatAmount(maxCents, currency)}</span>
            {request.requestedAmount !== null && (
              <> · Student requested: <span className="font-medium text-gray-800">{formatAmount(request.requestedAmount, currency)}</span></>
            )}
          </p>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="refundType" checked={!isPartial} onChange={() => setIsPartial(false)} className="accent-primary-600" />
            <span className="text-sm font-medium text-gray-800">Full refund — {formatAmount(maxCents, currency)}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="refundType" checked={isPartial} onChange={() => setIsPartial(true)} className="accent-primary-600" />
            <span className="text-sm font-medium text-gray-800">Partial refund</span>
          </label>

          {isPartial && (
            <div className="ml-6">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{currency.toUpperCase()}</span>
                <input
                  type="number" min={0.01} max={maxDollars} step={0.01}
                  value={amountDollars}
                  onChange={e => setAmountCents(Math.round(Number(e.target.value) * 100))}
                  className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>
              {!isValid && (
                <p className="text-xs text-red-500 mt-1">Amount must be between $0.01 and {formatAmount(maxCents, currency)}.</p>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {isPartial
            ? 'A partial refund will update payment status but keep the student enrolled.'
            : 'A full refund will reverse the payment and unenroll the student from the course.'}
        </p>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button onClick={() => onConfirm(isPartial ? amountCents : null)} loading={loading} disabled={!isValid}>
            Confirm Refund
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Reject Modal ──────────────────────────────────────────────────────────────

const MIN_REJECT_CHARS = 10;

function RejectModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (note: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [note, setNote] = useState('');
  const tooShort = note.trim().length < MIN_REJECT_CHARS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Reject Refund Request</h2>
        <p className="text-sm text-gray-500">Provide a reason so the student understands why their request was declined.</p>
        <div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain why the request is being rejected..."
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
            Reject Request
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: '',         label: 'All'      },
  { value: 'pending',  label: 'Pending'  },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function TenantRefundsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage]                 = useState(1);
  const [approveTarget, setApproveTarget] = useState<RefundRequest | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tenant-refund-requests', statusFilter, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/refund-requests', { params });
      return res.data.data as {
        requests: RefundRequest[];
        total: number;
        page: number;
        limit: number;
      };
    },
  });

  const requests   = data?.requests ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tenant-refund-requests'] });

  const approveMutation = useMutation({
    mutationFn: ({ requestId, refundAmount }: { requestId: string; refundAmount: number | null }) =>
      api.post(`/refund-requests/${requestId}/approve`, refundAmount !== null ? { refundAmount } : {}),
    onSuccess: () => { setApproveTarget(null); invalidate(); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, adminNote }: { requestId: string; adminNote: string }) =>
      api.post(`/refund-requests/${requestId}/reject`, { adminNote }),
    onSuccess: () => { setRejectTarget(null); invalidate(); },
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Refund Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">Review and action student refund requests for your courses</p>
      </div>

      {error && <Alert variant="error">Failed to load refund requests.</Alert>}
      {approveMutation.isError && <Alert variant="error">Failed to approve refund. Please try again.</Alert>}

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === tab.value
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.value === 'pending' && total > 0 && statusFilter === 'pending' && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold w-5 h-5">
                {total > 99 ? '99+' : total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <p className="text-gray-500">
              {statusFilter === 'pending' ? 'No pending refund requests.' : 'No requests found.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {statusFilter === 'pending'
                ? `${total} pending request${total !== 1 ? 's' : ''}`
                : `${total} request${total !== 1 ? 's' : ''}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Course</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Submitted</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Reason</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((r) => {
                    const isActing =
                      (approveMutation.isPending && approveMutation.variables?.requestId === r._id) ||
                      (rejectMutation.isPending && rejectMutation.variables?.requestId === r._id);

                    return (
                      <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {r.userId ? `${r.userId.firstName} ${r.userId.lastName}` : '—'}
                          </p>
                          <p className="text-xs text-gray-400">{r.userId?.email ?? ''}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900 max-w-[160px] truncate">{r.courseId?.title ?? '—'}</p>
                          {r.paymentId?.receiptNumber && (
                            <p className="text-xs font-mono text-gray-400">{r.paymentId.receiptNumber}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {r.paymentId ? formatAmount(r.paymentId.amount, r.paymentId.currency) : '—'}
                          </p>
                          {r.requestedAmount !== null && r.paymentId && r.requestedAmount < r.paymentId.amount && (
                            <p className="text-xs text-amber-600">
                              Wants {formatAmount(r.requestedAmount, r.paymentId.currency)}
                            </p>
                          )}
                          {r.approvedAmount !== null && r.paymentId && (
                            <p className="text-xs text-green-600">
                              Refunded {formatAmount(r.approvedAmount, r.paymentId.currency)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(r.createdAt)}</td>
                        <td className="px-4 py-3">
                          <p className="text-gray-700 max-w-[200px] line-clamp-2 text-xs">{r.reason}</p>
                          {r.adminNote && (
                            <p className="text-xs text-gray-400 mt-0.5 italic">Note: {r.adminNote}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">{statusBadge(r.status)}</td>
                        <td className="px-4 py-3">
                          {r.status === 'pending' && (
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                loading={isActing && approveMutation.variables?.requestId === r._id}
                                disabled={isActing}
                                onClick={() => setApproveTarget(r)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isActing}
                                onClick={() => setRejectTarget(r._id)}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                          {r.status !== 'pending' && (
                            <p className="text-xs text-gray-400 text-right">{formatDate(r.resolvedAt)}</p>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {page} of {totalPages} · {total} total</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Approve modal */}
      {approveTarget && (
        <ApproveModal
          request={approveTarget}
          loading={approveMutation.isPending}
          onCancel={() => setApproveTarget(null)}
          onConfirm={(refundAmount) => approveMutation.mutate({ requestId: approveTarget._id, refundAmount })}
        />
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          loading={rejectMutation.isPending}
          onCancel={() => setRejectTarget(null)}
          onConfirm={(adminNote) => rejectMutation.mutate({ requestId: rejectTarget, adminNote })}
        />
      )}
    </div>
  );
}
