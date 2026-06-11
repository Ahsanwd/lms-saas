'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan   { _id: string; name: string; slug: string; }
interface Tenant {
  _id: string;
  name: string;
  subdomain: string;
  contactEmail: string;
  status: 'active' | 'suspended' | 'deleted';
  plan: Plan;
  isOnTrial: boolean;
  trialEndsAt: string | null;
  createdAt: string;
}

interface TenantStats {
  tenant: Tenant & { storageUsedBytes?: number };
  users: { students: number; instructors: number; admins: number; total: number };
}

const STATUS_BADGE: Record<string, 'default' | 'success' | 'danger' | 'warning'> = {
  active: 'success', suspended: 'danger', deleted: 'default',
};

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ─── Create Tenant Modal ──────────────────────────────────────────────────────

function CreateTenantModal({ plans, onClose }: { plans: Plan[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', subdomain: '', contactEmail: '', planId: plans[0]?._id ?? '' });
  const [error, setError] = useState('');

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: k === 'subdomain' ? e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') : e.target.value }));

  const mutation = useMutation({
    mutationFn: () => api.post('/admin/tenants', {
      name: form.name.trim(), subdomain: form.subdomain.trim(),
      contactEmail: form.contactEmail.trim(), planId: form.planId,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }); onClose(); },
    onError: (err: AxiosError<{ message: string }>) => setError(err.response?.data?.message ?? 'Failed to create tenant'),
  });

  const disabled = !form.name.trim() || !form.subdomain.trim() || !form.contactEmail.trim() || !form.planId;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">New Tenant</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          {[
            { label: 'Organisation name *', key: 'name', type: 'text', placeholder: 'Acme University' },
            { label: 'Subdomain *', key: 'subdomain', type: 'text', placeholder: 'acme (letters, numbers, hyphens)' },
            { label: 'Contact email *', key: 'contactEmail', type: 'email', placeholder: 'admin@acme.edu' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input autoFocus={key === 'name'} type={type} placeholder={placeholder}
                value={form[key as keyof typeof form]} onChange={f(key as keyof typeof form)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan *</label>
            <select value={form.planId} onChange={f('planId')}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              {plans.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={disabled} onClick={() => mutation.mutate()}>
            Create Tenant
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tenant Detail Modal ──────────────────────────────────────────────────────

function TenantDetailModal({
  tenant, plans, onClose, onChanged,
}: {
  tenant: Tenant; plans: Plan[]; onClose: () => void; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [changingPlan, setChangingPlan] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(tenant.plan?._id ?? '');
  const [actionError, setActionError] = useState('');

  const { data: statsData, isLoading: statsLoading } = useQuery<TenantStats>({
    queryKey: ['tenant-stats', tenant._id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/tenants/${tenant._id}/stats`);
      return data.data as TenantStats;
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: () => api.patch(`/admin/tenants/${tenant._id}/plan`, { planId: selectedPlan }),
    onSuccess: () => { setChangingPlan(false); onChanged(); setActionError(''); },
    onError: (err: AxiosError<{ message: string }>) => setActionError(err.response?.data?.message ?? 'Failed to change plan'),
  });

  const trialDaysLeft = tenant.isOnTrial && tenant.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold">
              {tenant.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{tenant.name}</p>
              <p className="text-xs text-gray-400 font-mono">{tenant.subdomain}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {actionError && <Alert variant="error">{actionError}</Alert>}

          {/* Key info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Status',    <Badge key="s" variant={STATUS_BADGE[tenant.status] ?? 'default'}>{tenant.status}</Badge>],
              ['Email',     tenant.contactEmail],
              ['Created',   formatDate(tenant.createdAt)],
              ['Plan',      `${tenant.plan?.name ?? '—'}${tenant.isOnTrial ? ' (Trial)' : ''}`],
              ...(trialDaysLeft !== null
                ? [['Trial ends', trialDaysLeft > 0 ? `${trialDaysLeft} days left` : 'Expired']]
                : []),
            ].map(([label, val]) => (
              <div key={String(label)}>
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <div className="font-medium text-gray-800">{val}</div>
              </div>
            ))}
          </div>

          {/* User stats */}
          {statsLoading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : statsData && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Users</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total',       value: statsData.users.total,       color: 'text-gray-900' },
                  { label: 'Students',    value: statsData.users.students,    color: 'text-blue-600' },
                  { label: 'Instructors', value: statsData.users.instructors, color: 'text-green-600' },
                  { label: 'Admins',      value: statsData.users.admins,      color: 'text-purple-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Change plan */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Change Plan</p>
            {changingPlan ? (
              <div className="flex gap-2">
                <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  {plans.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
                <Button size="sm" loading={changePlanMutation.isPending}
                  disabled={selectedPlan === tenant.plan?._id}
                  onClick={() => changePlanMutation.mutate()}>
                  Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setChangingPlan(false); setSelectedPlan(tenant.plan?._id ?? ''); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setChangingPlan(true)}>
                Switch from {tenant.plan?.name ?? 'current plan'}
              </Button>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AdminTenantsPage() {
  const qc = useQueryClient();
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]               = useState(1);
  const [showCreate, setShowCreate]   = useState(false);
  const [detailTenant, setDetailTenant] = useState<Tenant | null>(null);
  const [actionError, setActionError] = useState('');

  // Per-row action tracking — avoids loading spinner bleeding across all rows
  const [actingId, setActingId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  // Reset to page 1 when filter/search changes
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const { data, isLoading } = useQuery<{ tenants: Tenant[]; pagination: { total: number; pages: number } }>({
    queryKey: ['admin-tenants', debouncedSearch, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter)    params.set('status', statusFilter);
      const { data } = await api.get(`/admin/tenants?${params}`);
      return data.data;
    },
    placeholderData: (prev) => prev, // keep showing old data while loading next page
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data } = await api.get('/admin/billing/plans');
      return data.data.plans ?? [];
    },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['admin-tenants'] });
    qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    setActingId(null);
    setActionError('');
  }

  const suspendMutation = useMutation({
    mutationFn: (id: string) => { setActingId(id); return api.patch(`/admin/tenants/${id}/suspend`); },
    onSuccess: invalidate,
    onError: (err: AxiosError<{ message: string }>) => {
      setActingId(null);
      setActionError(err.response?.data?.message ?? 'Failed to suspend tenant');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => { setActingId(id); return api.patch(`/admin/tenants/${id}/restore`); },
    onSuccess: invalidate,
    onError: (err: AxiosError<{ message: string }>) => {
      setActingId(null);
      setActionError(err.response?.data?.message ?? 'Failed to restore tenant');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => { setActingId(id); return api.delete(`/admin/tenants/${id}`); },
    onSuccess: invalidate,
    onError: (err: AxiosError<{ message: string }>) => {
      setActingId(null);
      setActionError(err.response?.data?.message ?? 'Failed to delete tenant');
    },
  });

  const tenants    = data?.tenants ?? [];
  const total      = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.pages ?? 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} organisation{total !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Tenant
        </Button>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search name, subdomain, email…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      {isLoading && tenants.length === 0 ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : tenants.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium">No tenants found</p>
          <p className="text-gray-500 text-sm mt-1">
            {debouncedSearch || statusFilter ? 'Try adjusting your filters.' : 'Create your first tenant to get started.'}
          </p>
          {!debouncedSearch && !statusFilter && (
            <Button className="mt-4" onClick={() => setShowCreate(true)}>Create Tenant</Button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Organisation</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Subdomain</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Plan</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenants.map(t => {
                const isActing = actingId === t._id;
                const trialDaysLeft = t.isOnTrial && t.trialEndsAt
                  ? Math.max(0, Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / 86400000))
                  : null;

                return (
                  <tr key={t._id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setDetailTenant(t)}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{t.name}</p>
                          <p className="text-xs text-gray-400">{t.contactEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 font-mono text-xs">{t.subdomain}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-gray-800 font-medium">{t.plan?.name ?? '—'}</p>
                      {t.isOnTrial && (
                        <p className="text-xs mt-0.5">
                          <span className="text-amber-600 font-medium">Trial</span>
                          {trialDaysLeft !== null && (
                            <span className={`ml-1 ${trialDaysLeft <= 3 ? 'text-red-500' : 'text-gray-400'}`}>
                              · {trialDaysLeft > 0 ? `${trialDaysLeft}d left` : 'expired'}
                            </span>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={STATUS_BADGE[t.status] ?? 'default'}>{t.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">{formatDate(t.createdAt)}</td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2 justify-end">
                        {t.status === 'active' && (
                          <Button size="sm" variant="outline"
                            loading={isActing && suspendMutation.isPending}
                            onClick={() => {
                              if (confirm(`Suspend "${t.name}"? Their users will lose access.`))
                                suspendMutation.mutate(t._id);
                            }}>
                            Suspend
                          </Button>
                        )}
                        {t.status === 'suspended' && (
                          <Button size="sm" variant="outline"
                            loading={isActing && restoreMutation.isPending}
                            onClick={() => restoreMutation.mutate(t._id)}>
                            Restore
                          </Button>
                        )}
                        <Button size="sm" variant="danger"
                          loading={isActing && deleteMutation.isPending}
                          onClick={() => {
                            if (confirm(`Permanently delete "${t.name}"?\n\nThis will soft-delete the tenant and cannot be undone from the UI.`))
                              deleteMutation.mutate(t._id);
                          }}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}>← Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}>Next →</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateTenantModal plans={plans} onClose={() => setShowCreate(false)} />
      )}
      {detailTenant && (
        <TenantDetailModal
          tenant={detailTenant}
          plans={plans}
          onClose={() => setDetailTenant(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['admin-tenants'] });
            qc.invalidateQueries({ queryKey: ['tenant-stats', detailTenant._id] });
            setDetailTenant(null);
          }}
        />
      )}
    </div>
  );
}
