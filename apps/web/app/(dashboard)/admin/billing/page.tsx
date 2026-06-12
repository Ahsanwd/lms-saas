'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';
import { formatDate } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Plan {
  _id: string; name: string; slug: string;
  price: { monthly: number; yearly: number };
  limits: { students: number; instructors: number; courses: number; storageGB: number; maxSessions: number };
  features: string[];
  dbMode: 'shared' | 'dedicated';
}
interface TenantRef { _id: string; name: string; subdomain: string; }
interface Subscription {
  _id: string;
  tenantId: TenantRef;
  planId: Plan;
  billingCycle: 'monthly' | 'yearly';
  status: 'active' | 'trial' | 'cancelled' | 'expired';
  isOnTrial: boolean;
  currentPeriodEnd: string;
  createdAt: string;
}
interface Invoice {
  _id: string; invoiceNumber: string;
  tenantId: TenantRef; planId: Plan;
  billingCycle: string;
  subtotal: number; discountAmount: number; taxRate?: number; taxAmount?: number; total: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  dueDate: string; paidAt: string | null; createdAt: string;
}
interface Coupon {
  _id: string; code: string; description: string | null;
  discountType: 'percentage' | 'fixed'; discountValue: number;
  usedCount: number; maxUses: number; isActive: boolean; expiresAt: string | null;
}
interface MonthlyEntry { _id: { year: number; month: number }; revenue: number; count: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, 'default' | 'success' | 'danger' | 'warning'> = {
  active: 'success', trial: 'warning', cancelled: 'default', expired: 'danger',
  paid: 'success', pending: 'warning', overdue: 'danger',
};
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(n: number) { return `$${Number(n ?? 0).toFixed(2)}`; }
function fmtK(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return fmt(n);
}

// ── Shared: SelectInput ───────────────────────────────────────────────────────
function SelectInput({ value, onChange, children, className = '' }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white ${className}`}>
      {children}
    </select>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text', className = '', ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onChange: (v: string) => void }) {
  return (
    <input {...rest} type={type} value={value as string} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`} />
  );
}

// ── Revenue Card ──────────────────────────────────────────────────────────────
function RevenueCard() {
  const { data, isLoading } = useQuery<{
    overall: { totalRevenue: number; totalInvoices: number; avgInvoice: number };
    monthlyRevenue: MonthlyEntry[];
    activeSubscriptions: number;
  }>({
    queryKey: ['admin-revenue'],
    queryFn: async () => {
      const { data } = await api.get('/admin/billing/revenue?months=6');
      return data.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-6"><Spinner /></div>;
  if (!data) return null;

  const cards = [
    { label: 'Total Revenue',          value: fmtK(data.overall.totalRevenue),     sub: `${data.overall.totalInvoices} invoices` },
    { label: 'Avg Invoice',            value: fmt(data.overall.avgInvoice),          sub: 'per paid invoice' },
    { label: 'Active Subscriptions',   value: data.activeSubscriptions.toString(),   sub: 'tenants on a plan' },
  ];

  const monthly = [...(data.monthlyRevenue ?? [])].sort((a, b) =>
    a._id.year !== b._id.year ? a._id.year - b._id.year : a._id.month - b._id.month
  );
  const maxRev = Math.max(...monthly.map(m => m.revenue), 1);

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{c.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Monthly revenue bar chart */}
      {monthly.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-700 mb-4">Revenue — Last 6 Months</p>
          <div className="flex items-end gap-3 h-28">
            {monthly.map(m => {
              const pct = (m.revenue / maxRev) * 100;
              return (
                <div key={`${m._id.year}-${m._id.month}`} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-[10px] text-gray-500 font-medium">{fmtK(m.revenue)}</span>
                  <div className="w-full rounded-t-md bg-primary-500 transition-all" style={{ height: `${Math.max(pct, 4)}%` }} />
                  <span className="text-[10px] text-gray-400">{MONTH_NAMES[m._id.month - 1]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subscriptions Tab ─────────────────────────────────────────────────────────
function CreateSubscriptionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState('');
  const [planId, setPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isOnTrial, setIsOnTrial] = useState(false);
  const [trialDays, setTrialDays] = useState('14');
  const [error, setError] = useState('');

  const { data: tenants } = useQuery<TenantRef[]>({
    queryKey: ['admin-tenants-list'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tenants?limit=200');
      return data.data?.tenants ?? data.data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data } = await api.get('/admin/billing/plans');
      return data.data?.plans ?? [];
    },
    staleTime: 300_000,
  });

  const selectedPlan = plans?.find(p => p._id === planId);
  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);
  const trialEnd = isOnTrial ? new Date(now.getTime() + Number(trialDays) * 86400000) : null;

  const mutation = useMutation({
    mutationFn: () => api.post('/admin/billing/subscriptions', {
      tenantId, planId, billingCycle,
      periodStart: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
      isOnTrial,
      trialEnd: trialEnd?.toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      qc.invalidateQueries({ queryKey: ['admin-revenue'] });
      onClose();
    },
    onError: (err: AxiosError<{ message: string }>) => setError(err.response?.data?.message ?? 'Failed to create subscription'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Subscription</h2>
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
            <SelectInput value={tenantId} onChange={setTenantId} className="w-full">
              <option value="">Select a tenant…</option>
              {(tenants ?? []).map(t => (
                <option key={t._id} value={t._id}>{t.name} ({t.subdomain})</option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <SelectInput value={planId} onChange={setPlanId} className="w-full">
              <option value="">Select a plan…</option>
              {(plans ?? []).map(p => (
                <option key={p._id} value={p._id}>{p.name} — ${p.price.monthly}/mo · ${p.price.yearly}/yr</option>
              ))}
            </SelectInput>
          </div>
          {selectedPlan && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600 space-y-1">
              <p className="font-medium text-gray-800">{selectedPlan.name}</p>
              <p className="text-xs text-gray-500">
                {billingCycle === 'monthly' ? fmt(selectedPlan.price.monthly) : fmt(selectedPlan.price.yearly)} / {billingCycle}
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
            <SelectInput value={billingCycle} onChange={v => setBillingCycle(v as 'monthly' | 'yearly')} className="w-full">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </SelectInput>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="onTrial" checked={isOnTrial} onChange={e => setIsOnTrial(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <label htmlFor="onTrial" className="text-sm font-medium text-gray-700">Start on trial</label>
            {isOnTrial && (
              <div className="flex items-center gap-2 ml-2">
                <TextInput value={trialDays} onChange={setTrialDays} type="number" className="!w-20" min="1" />
                <span className="text-sm text-gray-500">days</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={!tenantId || !planId}
            onClick={() => mutation.mutate()}>Create Subscription</Button>
        </div>
      </div>
    </div>
  );
}

function SubscriptionsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<{ subscriptions: Subscription[]; pagination: { total: number } }>({
    queryKey: ['admin-subscriptions', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/admin/billing/subscriptions?${params}`);
      return data.data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => { setActingId(id); return api.patch(`/admin/billing/subscriptions/${id}/cancel`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      qc.invalidateQueries({ queryKey: ['admin-revenue'] });
      setActingId(null); setActionError('');
    },
    onError: (err: AxiosError<{ message: string }>) => { setActingId(null); setActionError(err.response?.data?.message ?? 'Action failed'); },
  });

  const renewMutation = useMutation({
    mutationFn: (id: string) => { setActingId(id); return api.patch(`/admin/billing/subscriptions/${id}/renew`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      qc.invalidateQueries({ queryKey: ['admin-revenue'] });
      setActingId(null); setActionError('');
    },
    onError: (err: AxiosError<{ message: string }>) => { setActingId(null); setActionError(err.response?.data?.message ?? 'Action failed'); },
  });

  const subs = data?.subscriptions ?? [];

  return (
    <div className="space-y-4">
      {actionError && <Alert variant="error">{actionError}</Alert>}
      <div className="flex items-center gap-3">
        <SelectInput value={statusFilter} onChange={setStatusFilter}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </SelectInput>
        <span className="text-sm text-gray-500">{data?.pagination?.total ?? 0} total</span>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowCreate(true)}>+ New Subscription</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : subs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-2xl mb-2">📋</p>
          <p className="text-gray-500 text-sm">No subscriptions found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tenant</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Plan</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cycle</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Renews</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subs.map(s => {
                const isActing = actingId === s._id;
                return (
                  <tr key={s._id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{s.tenantId?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{s.tenantId?.subdomain}</p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {s.planId?.name ?? '—'}
                      {s.isOnTrial && <span className="ml-1.5 text-xs text-amber-600 font-medium">trial</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 capitalize">{s.billingCycle}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={STATUS_BADGE[s.status] ?? 'default'}>{s.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{formatDate(s.currentPeriodEnd)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2 justify-end">
                        {s.status === 'cancelled' || s.status === 'expired' ? (
                          <Button size="sm" variant="outline"
                            loading={isActing && renewMutation.isPending}
                            onClick={() => renewMutation.mutate(s._id)}>Renew</Button>
                        ) : (
                          <Button size="sm" variant="outline"
                            loading={isActing && cancelMutation.isPending}
                            onClick={() => {
                              if (confirm(`Cancel subscription for ${s.tenantId?.name}?`))
                                cancelMutation.mutate(s._id);
                            }}>Cancel</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateSubscriptionModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ── Invoices Tab ──────────────────────────────────────────────────────────────
function CreateInvoiceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState('');
  const [planId, setPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [subtotal, setSubtotal] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [description, setDescription] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  const { data: tenants } = useQuery<TenantRef[]>({
    queryKey: ['admin-tenants-list'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tenants?limit=200');
      return data.data?.tenants ?? data.data ?? [];
    },
    staleTime: 60_000,
  });
  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data } = await api.get('/admin/billing/plans');
      return data.data?.plans ?? [];
    },
    staleTime: 300_000,
  });

  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const mutation = useMutation({
    mutationFn: () => api.post('/admin/billing/invoices', {
      tenantId, planId,
      subtotal: Number(subtotal),
      taxRate: taxRate ? Number(taxRate) : 0,
      billingCycle,
      periodStart: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
      couponCode: couponCode.trim() || undefined,
      dueDate: dueDate || undefined,
      description: description.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-invoices'] });
      qc.invalidateQueries({ queryKey: ['admin-revenue'] });
      onClose();
    },
    onError: (err: AxiosError<{ message: string }>) => setError(err.response?.data?.message ?? 'Failed to create invoice'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Invoice</h2>
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
            <SelectInput value={tenantId} onChange={setTenantId} className="w-full">
              <option value="">Select a tenant…</option>
              {(tenants ?? []).map(t => <option key={t._id} value={t._id}>{t.name} ({t.subdomain})</option>)}
            </SelectInput>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <SelectInput value={planId} onChange={setPlanId} className="w-full">
              <option value="">Select a plan…</option>
              {(plans ?? []).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </SelectInput>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <TextInput value={subtotal} onChange={setSubtotal} type="number" min="0" step="0.01" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
              <TextInput value={taxRate} onChange={setTaxRate} type="number" min="0" max="100" step="0.01" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
              <SelectInput value={billingCycle} onChange={setBillingCycle} className="w-full">
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </SelectInput>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Coupon (optional)</label>
              <TextInput value={couponCode} onChange={v => setCouponCode(v.toUpperCase().replace(/\s/g, ''))}
                placeholder="SUMMER20" className="font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <TextInput value={dueDate} onChange={setDueDate} type="date" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <TextInput value={description} onChange={setDescription} placeholder="e.g. Manual invoice for enterprise plan" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending}
            disabled={!tenantId || !planId || !subtotal}
            onClick={() => mutation.mutate()}>Create Invoice</Button>
        </div>
      </div>
    </div>
  );
}

function InvoicesTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(inv: Invoice) {
    setDownloadingId(inv._id);
    try {
      const response = await api.get(`/admin/billing/invoices/${inv._id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${inv.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }

  const { data, isLoading } = useQuery<{ invoices: Invoice[]; pagination: { total: number } }>({
    queryKey: ['admin-invoices', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/admin/billing/invoices?${params}`);
      return data.data;
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => { setActingId(id); return api.patch(`/admin/billing/invoices/${id}/pay`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-invoices'] }); qc.invalidateQueries({ queryKey: ['admin-revenue'] }); setActingId(null); setActionError(''); },
    onError: (err: AxiosError<{ message: string }>) => { setActingId(null); setActionError(err.response?.data?.message ?? 'Action failed'); },
  });

  const cancelInvoiceMutation = useMutation({
    mutationFn: (id: string) => { setActingId(id); return api.patch(`/admin/billing/invoices/${id}/cancel`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-invoices'] }); setActingId(null); setActionError(''); },
    onError: (err: AxiosError<{ message: string }>) => { setActingId(null); setActionError(err.response?.data?.message ?? 'Action failed'); },
  });

  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-4">
      {actionError && <Alert variant="error">{actionError}</Alert>}
      <div className="flex items-center gap-3">
        <SelectInput value={statusFilter} onChange={setStatusFilter}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </SelectInput>
        <span className="text-sm text-gray-500">{data?.pagination?.total ?? 0} total</span>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowCreate(true)}>+ New Invoice</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-2xl mb-2">🧾</p>
          <p className="text-gray-500 text-sm">No invoices found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice #</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tenant</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Plan</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Due</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map(inv => {
                const isActing = actingId === inv._id;
                return (
                  <tr key={inv._id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-600">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{inv.tenantId?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{inv.tenantId?.subdomain}</p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{inv.planId?.name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-gray-900 font-medium">
                      {fmt(inv.total)}
                      {inv.discountAmount > 0 && (
                        <span className="ml-1 text-xs text-green-600">-{fmt(inv.discountAmount)}</span>
                      )}
                      {inv.taxAmount && inv.taxAmount > 0 ? (
                        <span className="ml-1 text-xs text-gray-400">+{fmt(inv.taxAmount)} tax</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={STATUS_BADGE[inv.status] ?? 'default'}>{inv.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{formatDate(inv.dueDate)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline"
                          loading={downloadingId === inv._id}
                          onClick={() => handleDownload(inv)}>PDF</Button>
                        {(inv.status === 'pending' || inv.status === 'overdue') && (<>
                          <Button size="sm" variant="outline"
                            loading={isActing && markPaidMutation.isPending}
                            onClick={() => markPaidMutation.mutate(inv._id)}>Mark Paid</Button>
                          <Button size="sm" variant="danger"
                            loading={isActing && cancelInvoiceMutation.isPending}
                            onClick={() => {
                              if (confirm('Cancel this invoice?')) cancelInvoiceMutation.mutate(inv._id);
                            }}>Cancel</Button>
                        </>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ── Coupons Tab ───────────────────────────────────────────────────────────────
function CreateCouponModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post('/admin/billing/coupons', {
      code: code.toUpperCase().trim(),
      description: description.trim() || null,
      discountType,
      discountValue: Number(discountValue),
      maxUses: maxUses ? Number(maxUses) : 0,
      expiresAt: expiresAt || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-coupons'] }); onClose(); },
    onError: (err: AxiosError<{ message: string }>) => setError(err.response?.data?.message ?? 'Failed to create coupon'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Coupon</h2>
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <TextInput autoFocus value={code}
              onChange={v => setCode(v.toUpperCase().replace(/\s/g, ''))}
              placeholder="e.g. SUMMER20" className="font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <TextInput value={description} onChange={setDescription} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount type</label>
              <SelectInput value={discountType} onChange={v => setDiscountType(v as 'percentage' | 'fixed')} className="w-full">
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed ($)</option>
              </SelectInput>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value {discountType === 'percentage' ? '(%)' : '($)'}
              </label>
              <TextInput value={discountValue} onChange={setDiscountValue} type="number" min="1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max uses (0 = unlimited)</label>
              <TextInput value={maxUses} onChange={setMaxUses} type="number" min="0" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires at</label>
              <TextInput value={expiresAt} onChange={setExpiresAt} type="date" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending}
            disabled={!code.trim() || !discountValue}
            onClick={() => mutation.mutate()}>
            Create Coupon
          </Button>
        </div>
      </div>
    </div>
  );
}

function CouponsTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actingAction, setActingAction] = useState<'toggle' | 'delete' | null>(null);
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery<{ coupons: Coupon[]; pagination: { total: number } }>({
    queryKey: ['admin-coupons'],
    queryFn: async () => {
      const { data } = await api.get('/admin/billing/coupons?limit=50');
      return data.data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => {
      setActingId(id); setActingAction('toggle');
      return api.patch(`/admin/billing/coupons/${id}`, { isActive });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-coupons'] }); setActingId(null); setActingAction(null); setActionError(''); },
    onError: (err: AxiosError<{ message: string }>) => { setActingId(null); setActingAction(null); setActionError(err.response?.data?.message ?? 'Action failed'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => { setActingId(id); setActingAction('delete'); return api.delete(`/admin/billing/coupons/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-coupons'] }); setActingId(null); setActingAction(null); setActionError(''); },
    onError: (err: AxiosError<{ message: string }>) => { setActingId(null); setActingAction(null); setActionError(err.response?.data?.message ?? 'Action failed'); },
  });

  const coupons = data?.coupons ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{data?.pagination?.total ?? 0} coupons</span>
        <Button size="sm" onClick={() => setShowCreate(true)}>+ New Coupon</Button>
      </div>
      {actionError && <Alert variant="error">{actionError}</Alert>}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : coupons.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-2xl mb-2">🏷️</p>
          <p className="text-gray-500 text-sm">No coupons yet.</p>
          <Button className="mt-4" size="sm" onClick={() => setShowCreate(true)}>Create First Coupon</Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Code</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Discount</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Uses</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Expires</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {coupons.map(c => {
                const isActing = actingId === c._id;
                return (
                  <tr key={c._id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5">
                      <p className="font-mono font-medium text-gray-900">{c.code}</p>
                      {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {c.discountType === 'percentage' ? `${c.discountValue}%` : `$${c.discountValue}`}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {c.usedCount}
                      {c.maxUses > 0 ? (
                        <span className={`text-xs ml-1 ${c.usedCount >= c.maxUses ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                          / {c.maxUses}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 ml-1">/ ∞</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">
                      {c.expiresAt ? formatDate(c.expiresAt) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={c.isActive ? 'success' : 'default'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline"
                          loading={isActing && actingAction === 'toggle' && toggleMutation.isPending}
                          onClick={() => toggleMutation.mutate({ id: c._id, isActive: !c.isActive })}>
                          {c.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        {c.usedCount === 0 && (
                          <Button size="sm" variant="danger"
                            loading={isActing && actingAction === 'delete' && deleteMutation.isPending}
                            onClick={() => {
                              if (confirm(`Delete coupon ${c.code}?`)) deleteMutation.mutate(c._id);
                            }}>Delete</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <CreateCouponModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ── Plans Tab ─────────────────────────────────────────────────────────────────
function PlansTab() {
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data } = await api.get('/admin/billing/plans');
      return data.data?.plans ?? [];
    },
    staleTime: 300_000,
  });

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  const list = plans ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{list.length} plans configured</p>
      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-2xl mb-2">📦</p>
          <p className="text-gray-500 text-sm">No plans configured yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map(p => (
            <div key={p._id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{p.slug}</p>
                </div>
                <Badge variant={p.dbMode === 'dedicated' ? 'success' : 'default'}>
                  {p.dbMode}
                </Badge>
              </div>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-2xl font-bold text-gray-900">{fmt(p.price.monthly)}</span>
                <span className="text-sm text-gray-400">/mo</span>
                <span className="text-sm text-gray-400">·</span>
                <span className="text-sm font-medium text-gray-600">{fmt(p.price.yearly)}/yr</span>
              </div>
              <div className="space-y-1 text-sm text-gray-600 mb-4">
                <p>👤 {p.limits.students === -1 ? 'Unlimited' : p.limits.students} students</p>
                <p>🎓 {p.limits.instructors === -1 ? 'Unlimited' : p.limits.instructors} instructors</p>
                <p>📚 {p.limits.courses === -1 ? 'Unlimited' : p.limits.courses} courses</p>
                <p>💾 {p.limits.storageGB === -1 ? 'Unlimited' : `${p.limits.storageGB} GB`} storage</p>
                <p>🔐 {p.limits.maxSessions === -1 ? 'Unlimited' : p.limits.maxSessions} sessions</p>
              </div>
              {p.features.length > 0 && (
                <ul className="space-y-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-500">
                      <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = 'subscriptions' | 'invoices' | 'coupons' | 'plans';

export default function AdminBillingPage() {
  const [tab, setTab] = useState<Tab>('subscriptions');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'subscriptions', label: 'Subscriptions' },
    { key: 'invoices',      label: 'Invoices'       },
    { key: 'coupons',       label: 'Coupons'        },
    { key: 'plans',         label: 'Plans'          },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage subscriptions, invoices, coupons, and plans.</p>
      </div>

      <RevenueCard />

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
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

      {tab === 'subscriptions' && <SubscriptionsTab />}
      {tab === 'invoices'      && <InvoicesTab />}
      {tab === 'coupons'       && <CouponsTab />}
      {tab === 'plans'         && <PlansTab />}
    </div>
  );
}
