'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';
import { AxiosError } from 'axios';

interface Course { _id: string; title: string }

interface FailedRenewal {
  _id: string;
  userId: { _id: string; firstName: string; lastName: string; email: string } | null;
  planId: { _id: string; name: string } | null;
  renewalAttempts: number;
  renewalFailReason: string | null;
  lastRenewalAttemptAt: string | null;
  gracePeriodEndsAt: string | null;
  currentPeriodEnd: string;
  billingCycle: string;
}

interface MembershipPlan {
  _id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  courseAccess: 'all' | 'selected';
  courses: Course[];
  features: string[];
  trialDays: number;
  sortOrder: number;
  isActive: boolean;
  subscribers: number;
}

const EMPTY_FORM = {
  name: '', description: '',
  monthlyPrice: '', yearlyPrice: '',
  courseAccess: 'all' as 'all' | 'selected',
  selectedCourses: [] as string[],
  features: [''],
  trialDays: '0',
  sortOrder: '0',
};

// ── Plan Modal ────────────────────────────────────────────────────────────────
function PlanModal({
  plan, courses, onClose, onSaved,
}: {
  plan: MembershipPlan | null;
  courses: Course[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!plan;
  const [form, setForm] = useState(
    plan ? {
      name: plan.name,
      description: plan.description,
      monthlyPrice: String(plan.monthlyPrice),
      yearlyPrice: String(plan.yearlyPrice),
      courseAccess: plan.courseAccess,
      selectedCourses: plan.courses.map(c => c._id),
      features: plan.features.length ? plan.features : [''],
      trialDays: String(plan.trialDays),
      sortOrder: String(plan.sortOrder),
    } : { ...EMPTY_FORM }
  );
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: object) =>
      isEdit
        ? api.put(`/membership/plans/${plan!._id}`, data)
        : api.post('/membership/plans', data),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to save'),
  });

  function set(k: string, v: unknown) { setForm(f => ({ ...f, [k]: v })); }

  function addFeature() { set('features', [...form.features, '']); }
  function setFeature(i: number, v: string) {
    const f = [...form.features]; f[i] = v; set('features', f);
  }
  function removeFeature(i: number) {
    set('features', form.features.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Name is required');
    if (form.monthlyPrice === '' || form.yearlyPrice === '') return setError('Both prices are required');
    mutation.mutate({
      name: form.name.trim(),
      description: form.description.trim(),
      monthlyPrice: Number(form.monthlyPrice),
      yearlyPrice: Number(form.yearlyPrice),
      courseAccess: form.courseAccess,
      courses: form.courseAccess === 'selected' ? form.selectedCourses : [],
      features: form.features.filter(f => f.trim()),
      trialDays: Number(form.trialDays) || 0,
      sortOrder: Number(form.sortOrder) || 0,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Edit Plan' : 'Create Membership Plan'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <Alert variant="error">{error}</Alert>}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Plan Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Pro Monthly"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="Short description shown to students"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50 resize-none" />
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Monthly Price (USD) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" min={0} step="0.01" value={form.monthlyPrice}
                  onChange={e => set('monthlyPrice', e.target.value)}
                  placeholder="9.99"
                  className="w-full pl-7 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Yearly Price (USD) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" min={0} step="0.01" value={form.yearlyPrice}
                  onChange={e => set('yearlyPrice', e.target.value)}
                  placeholder="99.99"
                  className="w-full pl-7 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
              </div>
            </div>
          </div>

          {/* Course access */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">Course Access</label>
            <div className="flex gap-3">
              {(['all', 'selected'] as const).map(v => (
                <button key={v} type="button" onClick={() => set('courseAccess', v)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    form.courseAccess === v
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {v === 'all' ? 'All Courses' : 'Selected Courses'}
                </button>
              ))}
            </div>
            {form.courseAccess === 'selected' && (
              <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-gray-50">
                {courses.length === 0 && <p className="text-xs text-gray-400">No published courses yet.</p>}
                {courses.map(c => (
                  <label key={c._id} className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox"
                      checked={form.selectedCourses.includes(c._id)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...form.selectedCourses, c._id]
                          : form.selectedCourses.filter(id => id !== c._id);
                        set('selectedCourses', next);
                      }}
                      className="rounded accent-primary-600" />
                    <span className="text-sm text-gray-700">{c.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Features */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Features (shown on plan card)</label>
            <div className="space-y-2">
              {form.features.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input value={f} onChange={e => setFeature(i, e.target.value)}
                    placeholder={`Feature ${i + 1}`}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
                  {form.features.length > 1 && (
                    <button type="button" onClick={() => removeFeature(i)}
                      className="px-2 text-gray-400 hover:text-red-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addFeature}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                + Add feature
              </button>
            </div>
          </div>

          {/* Trial + Sort */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Free Trial Days</label>
              <input type="number" min={0} value={form.trialDays}
                onChange={e => set('trialDays', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Sort Order</label>
              <input type="number" min={0} value={form.sortOrder}
                onChange={e => set('sortOrder', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
            </div>
          </div>
        </form>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            Cancel
          </button>
          <Button className="flex-1" loading={mutation.isPending}
            onClick={() => document.querySelector<HTMLFormElement>('form')?.requestSubmit()}>
            {isEdit ? 'Save Changes' : 'Create Plan'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Failed Renewals Panel ────────────────────────────────────────────────────
function FailedRenewalsPanel() {
  const { data, isLoading } = useQuery<{ items: FailedRenewal[]; total: number }>({
    queryKey: ['membership-failed-renewals'],
    queryFn: async () => {
      const { data } = await api.get('/membership/failed-renewals?limit=50');
      return data.data;
    },
  });

  const items = data?.items ?? [];

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <h2 className="text-sm font-bold text-gray-900">Failed Renewals</h2>
        <span className="ml-auto text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">
          {data?.total ?? items.length} past-due
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-semibold">Student</th>
              <th className="text-left px-5 py-3 font-semibold">Plan</th>
              <th className="text-left px-5 py-3 font-semibold">Attempts</th>
              <th className="text-left px-5 py-3 font-semibold">Last Error</th>
              <th className="text-left px-5 py-3 font-semibold">Grace Period Ends</th>
              <th className="text-left px-5 py-3 font-semibold">Last Attempt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(item => {
              const gracePast = item.gracePeriodEndsAt && new Date(item.gracePeriodEndsAt) < new Date();
              return (
                <tr key={item._id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">
                      {item.userId ? `${item.userId.firstName} ${item.userId.lastName}` : '—'}
                    </p>
                    <p className="text-xs text-gray-400">{item.userId?.email ?? ''}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-700">{item.planId?.name ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-xs ${
                      item.renewalAttempts >= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.renewalAttempts}×
                    </span>
                  </td>
                  <td className="px-5 py-3 max-w-[200px]">
                    <p className="text-xs text-red-600 truncate" title={item.renewalFailReason ?? ''}>
                      {item.renewalFailReason ?? '—'}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {item.gracePeriodEndsAt ? (
                      <span className={gracePast ? 'text-red-600 font-semibold' : 'text-amber-600'}>
                        {new Date(item.gracePeriodEndsAt).toLocaleDateString()}
                        {gracePast && ' (expired)'}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {item.lastRenewalAttemptAt
                      ? new Date(item.lastRenewalAttemptAt).toLocaleString()
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MembershipPlansPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<'create' | MembershipPlan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MembershipPlan | null>(null);

  const { data: plans = [], isLoading } = useQuery<MembershipPlan[]>({
    queryKey: ['membership-plans-admin'],
    queryFn: async () => {
      const { data } = await api.get('/membership/plans?all=true');
      return data.data.plans;
    },
  });

  const { data: allCourses = [] } = useQuery<Course[]>({
    queryKey: ['courses-list-simple'],
    queryFn: async () => {
      const { data } = await api.get('/courses?status=published&limit=200');
      return data.data.courses ?? [];
    },
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['membership-plans-admin'] });

  const toggleMut = useMutation({
    mutationFn: (id: string) => api.patch(`/membership/plans/${id}/toggle`),
    onSuccess: refetch,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/membership/plans/${id}`),
    onSuccess: () => { setDeleteTarget(null); refetch(); },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Membership Plans</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create plans students can subscribe to for course access.</p>
        </div>
        <Button onClick={() => setModal('create')}>+ New Plan</Button>
      </div>

      {/* Plans grid */}
      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9a2 2 0 10-4 0v5a2 2 0 01-2 2h6m-6-4h4m8 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <p className="text-gray-900 font-medium">No membership plans yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first plan to offer memberships to students.</p>
          <Button className="mt-5" onClick={() => setModal('create')}>Create First Plan</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map(plan => (
            <div key={plan._id}
              className={`bg-white rounded-2xl border-2 flex flex-col transition-all ${
                plan.isActive ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-70'
              }`}>
              {/* Card header */}
              <div className="px-5 pt-5 pb-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-gray-900">{plan.name}</h3>
                  <Badge variant={plan.isActive ? 'success' : 'default'}>
                    {plan.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                {plan.description && (
                  <p className="text-xs text-gray-400 mt-1">{plan.description}</p>
                )}
                {/* Prices */}
                <div className="flex gap-4 mt-3">
                  <div>
                    <p className="text-xl font-bold text-gray-900">${plan.monthlyPrice}<span className="text-sm font-normal text-gray-400">/mo</span></p>
                  </div>
                  <div className="border-l border-gray-100 pl-4">
                    <p className="text-xl font-bold text-gray-900">${plan.yearlyPrice}<span className="text-sm font-normal text-gray-400">/yr</span></p>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="px-5 py-4 flex-1 space-y-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253"/>
                  </svg>
                  {plan.courseAccess === 'all'
                    ? 'Access to all published courses'
                    : `${plan.courses.length} selected course(s)`}
                </div>
                {plan.trialDays > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    {plan.trialDays} day free trial
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs font-semibold text-primary-600">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/>
                  </svg>
                  {plan.subscribers} active subscriber{plan.subscribers !== 1 ? 's' : ''}
                </div>
                {plan.features.length > 0 && (
                  <ul className="space-y-1">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                        <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Actions */}
              <div className="px-5 pb-5 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => setModal(plan)}>
                  Edit
                </Button>
                <Button size="sm"
                  variant={plan.isActive ? 'outline' : 'outline'}
                  className="flex-1"
                  loading={toggleMut.isPending}
                  onClick={() => toggleMut.mutate(plan._id)}>
                  {plan.isActive ? 'Deactivate' : 'Activate'}
                </Button>
                <button
                  onClick={() => setDeleteTarget(plan)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Failed renewals — shown only when there are past-due subscriptions */}
      <FailedRenewalsPanel />

      {/* Create / Edit modal */}
      {modal && (
        <PlanModal
          plan={modal === 'create' ? null : modal}
          courses={allCourses}
          onClose={() => setModal(null)}
          onSaved={refetch}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Delete "{deleteTarget.name}"?</h3>
            <p className="text-sm text-gray-500">
              This action cannot be undone.
              {deleteTarget.subscribers > 0 && (
                <span className="block mt-1 text-red-600 font-medium">
                  This plan has {deleteTarget.subscribers} active subscriber(s) and cannot be deleted.
                </span>
              )}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" className="flex-1"
                loading={deleteMut.isPending}
                disabled={deleteTarget.subscribers > 0}
                onClick={() => deleteMut.mutate(deleteTarget._id)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
