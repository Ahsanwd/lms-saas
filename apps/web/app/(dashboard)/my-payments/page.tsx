'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CourseRef {
  _id: string;
  title: string;
  thumbnail?: string;
}

interface Payment {
  _id: string;
  courseId: CourseRef | null;
  amount: number;
  currency: string;
  discountAmount?: number;
  couponCode?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  provider: 'stripe' | 'paypal' | 'mock';
  receiptNumber?: string;
  paidAt?: string;
  refundedAt?: string;
  createdAt: string;
}

interface RefundRequestStatus {
  _id: string;
  paymentId: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  adminNote?: string;
}

interface PagedResult {
  payments: Payment[];
  total: number;
  page: number;
  limit: number;
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
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function statusBadge(status: Payment['status']) {
  const map: Record<Payment['status'], { variant: 'default' | 'success' | 'warning' | 'danger'; label: string }> = {
    completed: { variant: 'success', label: 'Completed' },
    pending:   { variant: 'warning', label: 'Pending'   },
    failed:    { variant: 'danger',  label: 'Failed'    },
    refunded:  { variant: 'default', label: 'Refunded'  },
  };
  const { variant, label } = map[status] ?? { variant: 'default', label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

function providerBadge(provider: Payment['provider']) {
  const map: Record<Payment['provider'], string> = {
    stripe: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    paypal: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    mock:   'bg-gray-100 text-gray-500 border border-gray-200',
  };
  const label = provider === 'mock' ? 'Demo' : provider.charAt(0).toUpperCase() + provider.slice(1);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[provider] ?? map.mock}`}>
      {label}
    </span>
  );
}

function refundStatusBadge(refReq: RefundRequestStatus | undefined, paymentStatus: Payment['status']) {
  if (paymentStatus === 'refunded' && refReq?.status === 'approved') {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        Refund Approved
      </span>
    );
  }
  if (refReq?.status === 'pending') {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
        Refund Pending
      </span>
    );
  }
  if (refReq?.status === 'rejected') {
    return (
      <span
        title={refReq.adminNote ? `Rejected: ${refReq.adminNote}` : 'Refund request rejected'}
        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200 cursor-help"
      >
        Request Rejected
      </span>
    );
  }
  return null;
}

// ─── Refund Request Modal ──────────────────────────────────────────────────────

function RefundModal({
  payment, onConfirm, onCancel, loading,
}: {
  payment: Payment;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Request Refund</h2>
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <p className="font-medium text-gray-900">{payment.courseId?.title ?? 'Course'}</p>
          <p className="text-gray-500 mt-0.5">{formatAmount(payment.amount, payment.currency)}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason for refund <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please explain why you are requesting a refund..."
            rows={4}
            maxLength={1000}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{reason.length}/1000</p>
        </div>
        <p className="text-xs text-gray-400">
          Your request will be reviewed by an admin. Approved refunds will revoke your course access.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button onClick={() => onConfirm(reason)} loading={loading} disabled={reason.trim().length < 10}>
            Submit Request
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Bar ────────────────────────────────────────────────────────────────

interface Filters { provider: string; dateFrom: string; dateTo: string }

function FilterBar({
  filters, onChange, onClear,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
}) {
  const hasActive = filters.provider || filters.dateFrom || filters.dateTo;
  return (
    <div className="flex flex-wrap items-end gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
        <select
          value={filters.provider}
          onChange={e => onChange({ ...filters, provider: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All methods</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
          <option value="mock">Demo</option>
        </select>
      </div>
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => onChange({ ...filters, dateTo: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      {hasActive && (
        <button
          onClick={onClear}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <p className="text-sm text-gray-500">
        Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          ← Prev
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = totalPages <= 5 ? i + 1 : Math.max(1, page - 2) + i;
          if (p > totalPages) return null;
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`w-8 h-8 text-sm rounded-lg border transition-colors ${
                p === page ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          );
        })}
        <button
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 20;
const EMPTY_FILTERS: Filters = { provider: '', dateFrom: '', dateTo: '' };

export default function MyPaymentsPage() {
  const qc = useQueryClient();
  const [page, setPage]               = useState(1);
  const [filters, setFilters]         = useState<Filters>(EMPTY_FILTERS);
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [successMsg, setSuccessMsg]   = useState('');
  const [pdfLoading, setPdfLoading]   = useState<string | null>(null);

  const queryKey = ['my-payments', page, filters];

  const { data, isLoading, error } = useQuery<PagedResult>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
      if (filters.provider) params.set('provider', filters.provider);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo)   params.set('dateTo',   filters.dateTo);
      const res = await api.get(`/payments/my?${params}`);
      return res.data.data as PagedResult;
    },
  });

  const { data: myRequestsData } = useQuery({
    queryKey: ['my-refund-requests'],
    queryFn: async () => {
      const res = await api.get('/refund-requests/my');
      return res.data.data.requests as RefundRequestStatus[];
    },
  });

  const refundRequestMap = (myRequestsData ?? []).reduce<Record<string, RefundRequestStatus>>(
    (acc, r) => { acc[r.paymentId] = r; return acc; },
    {}
  );

  const refundMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      api.post('/refund-requests', { paymentId, reason }),
    onSuccess: () => {
      setRefundTarget(null);
      setSuccessMsg('Your refund request has been submitted. An admin will review it shortly.');
      qc.invalidateQueries({ queryKey: ['my-refund-requests'] });
      setTimeout(() => setSuccessMsg(''), 6000);
    },
  });

  const downloadPdf = async (paymentId: string, receiptNumber?: string) => {
    setPdfLoading(paymentId);
    try {
      const res = await api.get(`/payments/${paymentId}/receipt.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `receipt-${receiptNumber || paymentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user sees no broken state
    } finally {
      setPdfLoading(null);
    }
  };

  const applyFilters = (f: Filters) => { setFilters(f); setPage(1); };
  const clearFilters = ()             => { setFilters(EMPTY_FILTERS); setPage(1); };

  const payments    = data?.payments ?? [];
  const totalSpent  = payments.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
  const currency    = payments.find(p => p.status === 'completed')?.currency ?? 'usd';

  if (isLoading) return (
    <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment History</h1>
        <p className="text-sm text-gray-500 mt-0.5">All your course purchases and transactions</p>
      </div>

      {error       && <Alert variant="error">Failed to load payment history.</Alert>}
      {successMsg  && <Alert variant="success">{successMsg}</Alert>}
      {refundMutation.isError && <Alert variant="error">Failed to submit refund request. Please try again.</Alert>}

      {/* Summary stats */}
      {(data?.total ?? 0) > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Spent</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatAmount(totalSpent, currency)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Courses Purchased</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {payments.filter(p => p.status === 'completed').length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Transactions</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data?.total ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <FilterBar filters={filters} onChange={applyFilters} onClear={clearFilters} />

      {/* Table */}
      {payments.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <p className="text-gray-900 font-medium">
              {filters.provider || filters.dateFrom || filters.dateTo ? 'No transactions match these filters' : 'No purchases yet'}
            </p>
            {!(filters.provider || filters.dateFrom || filters.dateTo) && (
              <>
                <p className="text-sm text-gray-500 mt-1">Browse courses to get started.</p>
                <Link href="/courses" className="mt-4 inline-block">
                  <span className="text-sm text-primary-600 font-medium hover:underline">Browse Courses</span>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{data?.total ?? payments.length} transaction{(data?.total ?? payments.length) !== 1 ? 's' : ''}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Course</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Receipt #</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Method</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => {
                    const date   = p.paidAt ?? p.refundedAt ?? p.createdAt;
                    const refReq = refundRequestMap[p._id];

                    return (
                      <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {p.courseId?.thumbnail ? (
                              <img src={p.courseId.thumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 bg-gray-100" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0 flex items-center justify-center">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate max-w-[180px]">
                                {p.courseId?.title ?? 'Course Unavailable'}
                              </p>
                              {p.couponCode && (
                                <p className="text-xs text-green-600 mt-0.5">
                                  Coupon: {p.couponCode}
                                  {p.discountAmount ? ` (−${formatAmount(p.discountAmount, p.currency)})` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-500">
                            {p.receiptNumber ?? p._id.slice(-8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {formatAmount(p.amount, p.currency)}
                        </td>
                        <td className="px-4 py-3">{providerBadge(p.provider)}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(date)}</td>
                        <td className="px-4 py-3">{statusBadge(p.status)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {/* PDF download — available for completed and refunded payments */}
                            {(p.status === 'completed' || p.status === 'refunded') && (
                              <button
                                onClick={() => downloadPdf(p._id, p.receiptNumber)}
                                disabled={pdfLoading === p._id}
                                title="Download receipt PDF"
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {pdfLoading === p._id ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                )}
                              </button>
                            )}

                            {/* Refund status / request button */}
                            {refundStatusBadge(refReq, p.status)}
                            {p.status === 'completed' && !refReq && (
                              <Button variant="ghost" size="sm" onClick={() => setRefundTarget(p)}>
                                Request Refund
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

            {/* Pagination */}
            <Pagination
              page={page}
              total={data?.total ?? 0}
              limit={PAGE_LIMIT}
              onChange={setPage}
            />
          </CardContent>
        </Card>
      )}

      {/* Refund request modal */}
      {refundTarget && (
        <RefundModal
          payment={refundTarget}
          loading={refundMutation.isPending}
          onCancel={() => setRefundTarget(null)}
          onConfirm={(reason) => refundMutation.mutate({ paymentId: refundTarget._id, reason })}
        />
      )}
    </div>
  );
}
