'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AxiosError } from 'axios';

interface CourseCoupon {
  _id: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  applicableCourses: { _id: string; title: string }[];
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface CourseOption { _id: string; title: string }

type StatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'exhausted' | 'inactive';

// ── Helpers ───────────────────────────────────────────────────────────────────

function couponStatus(c: CourseCoupon): 'active' | 'expiring' | 'expired' | 'exhausted' | 'inactive' {
  if (!c.isActive) return 'inactive';
  const expired   = c.expiresAt ? new Date(c.expiresAt) < new Date() : false;
  const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;
  if (expired)   return 'expired';
  if (exhausted) return 'exhausted';
  // Expiring soon = within 7 days
  if (c.expiresAt) {
    const daysLeft = (new Date(c.expiresAt).getTime() - Date.now()) / 86_400_000;
    if (daysLeft <= 7) return 'expiring';
  }
  return 'active';
}

function expiryLabel(expiresAt: string | null): { text: string; cls: string } {
  if (!expiresAt) return { text: 'No expiry', cls: 'text-gray-400' };
  const now  = Date.now();
  const exp  = new Date(expiresAt).getTime();
  const diff = (exp - now) / 86_400_000;

  if (diff < 0) {
    const daysAgo = Math.abs(Math.floor(diff));
    return { text: `Expired ${daysAgo}d ago`, cls: 'text-red-500 font-medium' };
  }
  if (diff < 1)  return { text: 'Expires today', cls: 'text-red-600 font-semibold' };
  if (diff <= 3) return { text: `in ${Math.ceil(diff)}d`, cls: 'text-orange-500 font-medium' };
  if (diff <= 7) return { text: `in ${Math.ceil(diff)}d`, cls: 'text-amber-500' };
  return {
    text: new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    cls: 'text-gray-500',
  };
}

// ── Usage Progress Bar ────────────────────────────────────────────────────────

function UsageBar({ used, max }: { used: number; max: number }) {
  if (max === 0) {
    return (
      <span className="text-sm text-gray-500">
        {used} <span className="text-gray-300">/ ∞</span>
      </span>
    );
  }
  const pct = Math.min((used / max) * 100, 100);
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-orange-400' : pct >= 50 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="space-y-1 min-w-[80px]">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-xs font-semibold', pct >= 100 ? 'text-red-600' : 'text-gray-700')}>
          {used} / {max}
        </span>
        <span className={cn('text-xs', pct >= 100 ? 'text-red-500' : 'text-gray-400')}>
          {pct >= 100 ? 'Full' : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, color, onClick, active,
}: {
  label: string; value: number; color: string; onClick: () => void; active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 min-w-[100px] rounded-xl px-4 py-3 text-left border-2 transition-all',
        active ? 'border-primary-400 bg-primary-50' : 'border-gray-100 bg-white hover:border-gray-200'
      )}
    >
      <p className={cn('text-xl font-bold', color)}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </button>
  );
}

// ── Coupon Form Modal ─────────────────────────────────────────────────────────

function CouponModal({
  coupon,
  courses,
  onClose,
}: {
  coupon?: CourseCoupon | null;
  courses: CourseOption[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!coupon;

  const [code,         setCode]         = useState(coupon?.code ?? '');
  const [description,  setDescription]  = useState(coupon?.description ?? '');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>(coupon?.discountType ?? 'percentage');
  const [discountValue, setDiscountValue] = useState(String(coupon?.discountValue ?? ''));
  const [selectedCourses, setSelectedCourses] = useState<string[]>(
    coupon?.applicableCourses.map(c => c._id) ?? []
  );
  const [maxUses,   setMaxUses]   = useState(String(coupon?.maxUses ?? '0'));
  const [expiresAt, setExpiresAt] = useState(
    coupon?.expiresAt ? coupon.expiresAt.split('T')[0] : ''
  );
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      isEdit
        ? api.patch(`/coupons/${coupon!._id}`, payload)
        : api.post('/coupons', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coupons'] });
      onClose();
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to save coupon'),
  });

  const handleSubmit = () => {
    if (!code.trim()) { setError('Code is required'); return; }
    if (!discountValue || Number(discountValue) <= 0) { setError('Discount value must be > 0'); return; }
    if (discountType === 'percentage' && Number(discountValue) > 100) { setError('Percentage cannot exceed 100'); return; }
    setError('');
    mutation.mutate({
      code: code.trim().toUpperCase(),
      description: description.trim(),
      discountType,
      discountValue: Number(discountValue),
      applicableCourses: selectedCourses,
      maxUses: Number(maxUses) || 0,
      expiresAt: expiresAt || null,
    });
  };

  const toggleCourse = (id: string) =>
    setSelectedCourses(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

  // Effective usage warning on edit
  const usagePct = coupon && coupon.maxUses > 0 ? (coupon.usedCount / coupon.maxUses) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Coupon' : 'Create Coupon'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          {/* Usage summary on edit */}
          {isEdit && coupon && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-medium">Usage so far</span>
                <span>{coupon.usedCount} {coupon.maxUses > 0 ? `/ ${coupon.maxUses}` : '(unlimited)'}</span>
              </div>
              {coupon.maxUses > 0 && (
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', usagePct >= 100 ? 'bg-red-500' : usagePct >= 80 ? 'bg-orange-400' : 'bg-green-500')}
                    style={{ width: `${Math.min(usagePct, 100)}%` }}
                  />
                </div>
              )}
              {coupon.expiresAt && (
                <p className={cn('text-xs', expiryLabel(coupon.expiresAt).cls)}>
                  {expiryLabel(coupon.expiresAt).text}
                </p>
              )}
            </div>
          )}

          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Coupon Code <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              disabled={isEdit}
              placeholder="SAVE20"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono uppercase disabled:bg-gray-50 disabled:text-gray-400"
            />
            {isEdit && <p className="text-xs text-gray-400 mt-1">Code cannot be changed after creation</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Summer sale discount"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Discount type + value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(['percentage', 'fixed'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDiscountType(t)}
                    className={cn(
                      'py-2 px-3 text-sm rounded-lg border-2 font-medium transition-colors',
                      discountType === t
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    )}
                  >
                    {t === 'percentage' ? '% Off' : '$ Fixed'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {discountType === 'percentage' ? 'Percent Off' : 'Amount Off ($)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">
                  {discountType === 'percentage' ? '%' : '$'}
                </span>
                <input
                  type="number"
                  min={1}
                  max={discountType === 'percentage' ? 100 : undefined}
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Max uses + Expiry */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Uses
                <span className="ml-1 text-xs font-normal text-gray-400">(0 = unlimited)</span>
              </label>
              <input
                type="number"
                min={0}
                value={maxUses}
                onChange={e => setMaxUses(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {Number(maxUses) > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Automatically enforced — stops accepting uses at {maxUses}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expiry Date
                <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                value={expiresAt}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {expiresAt && (
                <p className="text-xs text-gray-400 mt-1">
                  Automatically rejected after midnight on this date
                </p>
              )}
            </div>
          </div>

          {/* Applicable courses */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Applicable Courses
              <span className="ml-1 text-xs font-normal text-gray-400">(leave empty = all courses)</span>
            </label>
            {courses.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No published courses yet</p>
            ) : (
              <div className="border border-gray-200 rounded-xl max-h-44 overflow-y-auto divide-y divide-gray-50">
                {courses.map(c => (
                  <label key={c._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCourses.includes(c._id)}
                      onChange={() => toggleCourse(c._id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 truncate">{c.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} onClick={handleSubmit}>
            {isEdit ? 'Save Changes' : 'Create Coupon'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CouponsPage() {
  const qc = useQueryClient();
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editing,      setEditing]      = useState<CourseCoupon | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search,       setSearch]       = useState('');
  const [actionError,  setActionError]  = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['coupons'],
    queryFn: async () => {
      const { data } = await api.get('/coupons');
      return data.data as { coupons: CourseCoupon[] };
    },
  });

  const { data: coursesData } = useQuery({
    queryKey: ['courses-simple'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=200&status=published');
      return (data.data?.courses ?? []) as CourseOption[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/coupons/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupons'] }),
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Action failed');
      setTimeout(() => setActionError(''), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/coupons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupons'] }),
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Delete failed');
      setTimeout(() => setActionError(''), 3000);
    },
  });

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit   = (c: CourseCoupon) => { setEditing(c); setModalOpen(true); };

  const allCoupons = data?.coupons ?? [];
  const courses    = coursesData ?? [];

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const counts = { active: 0, expiring: 0, expired: 0, exhausted: 0, inactive: 0 };
    allCoupons.forEach(c => counts[couponStatus(c)]++);
    return counts;
  }, [allCoupons]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const coupons = useMemo(() => {
    let list = allCoupons;
    if (statusFilter !== 'all') list = list.filter(c => couponStatus(c) === statusFilter);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(c =>
        c.code.includes(q) ||
        c.description.toUpperCase().includes(q)
      );
    }
    return list;
  }, [allCoupons, statusFilter, search]);

  const STATUS_TABS: { key: StatusFilter; label: string; count: number; color: string }[] = [
    { key: 'all',       label: 'All',           count: allCoupons.length, color: 'text-gray-600' },
    { key: 'active',    label: 'Active',         count: stats.active,     color: 'text-green-600' },
    { key: 'expiring',  label: 'Expiring Soon',  count: stats.expiring,   color: 'text-amber-600' },
    { key: 'expired',   label: 'Expired',        count: stats.expired,    color: 'text-red-600' },
    { key: 'exhausted', label: 'Exhausted',      count: stats.exhausted,  color: 'text-red-600' },
    { key: 'inactive',  label: 'Inactive',       count: stats.inactive,   color: 'text-gray-400' },
  ];

  const STATUS_BADGE_STYLE: Record<string, string> = {
    active:    'bg-green-50 text-green-700',
    expiring:  'bg-amber-50 text-amber-700',
    expired:   'bg-red-50 text-red-600',
    exhausted: 'bg-red-50 text-red-600',
    inactive:  'bg-gray-100 text-gray-500',
  };

  const STATUS_LABEL: Record<string, string> = {
    active:    'Active',
    expiring:  'Expiring',
    expired:   'Expired',
    exhausted: 'Exhausted',
    inactive:  'Inactive',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Coupons</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Create discount codes — usage limits and expiry are enforced automatically
          </p>
        </div>
        <Button onClick={openCreate}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Coupon
        </Button>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      {/* Stat cards */}
      {!isLoading && allCoupons.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <StatCard label="Active"        value={stats.active}    color="text-green-600" onClick={() => setStatusFilter(statusFilter === 'active'    ? 'all' : 'active')}    active={statusFilter === 'active'} />
          <StatCard label="Expiring ≤7d"  value={stats.expiring}  color="text-amber-500" onClick={() => setStatusFilter(statusFilter === 'expiring'  ? 'all' : 'expiring')}  active={statusFilter === 'expiring'} />
          <StatCard label="Expired"       value={stats.expired}   color="text-red-500"   onClick={() => setStatusFilter(statusFilter === 'expired'   ? 'all' : 'expired')}   active={statusFilter === 'expired'} />
          <StatCard label="Exhausted"     value={stats.exhausted} color="text-red-500"   onClick={() => setStatusFilter(statusFilter === 'exhausted' ? 'all' : 'exhausted')} active={statusFilter === 'exhausted'} />
          <StatCard label="Inactive"      value={stats.inactive}  color="text-gray-400"  onClick={() => setStatusFilter(statusFilter === 'inactive'  ? 'all' : 'inactive')}  active={statusFilter === 'inactive'} />
        </div>
      )}

      {/* Search + status filter */}
      {!isLoading && allCoupons.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code or description…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Status tabs */}
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  statusFilter === tab.key
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    'ml-1.5 font-bold',
                    statusFilter === tab.key ? 'text-white/80' : tab.color
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : allCoupons.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <p className="font-medium text-gray-900">No coupons yet</p>
          <p className="text-sm text-gray-500 mt-1">Create your first discount code to offer deals on enrollments.</p>
          <Button className="mt-4" onClick={openCreate}>Create Coupon</Button>
        </div>
      ) : coupons.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center py-14 text-center">
          <p className="font-medium text-gray-700">No coupons match this filter</p>
          <button onClick={() => { setStatusFilter('all'); setSearch(''); }} className="text-sm text-primary-600 hover:underline mt-2">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Discount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Courses</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Expiry</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {coupons.map(c => {
                const status = couponStatus(c);
                const expiry = expiryLabel(c.expiresAt);
                const isExpiringWarning = status === 'expiring';

                return (
                  <tr key={c._id} className={cn('transition-colors', isExpiringWarning ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-gray-50')}>
                    {/* Code */}
                    <td className="px-5 py-4">
                      <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-sm">
                        {c.code}
                      </span>
                      {c.description && (
                        <p className="text-xs text-gray-400 mt-1 max-w-[160px] truncate">{c.description}</p>
                      )}
                    </td>

                    {/* Discount */}
                    <td className="px-4 py-4">
                      <span className={cn(
                        'font-semibold text-sm',
                        c.discountType === 'percentage' ? 'text-green-600' : 'text-blue-600'
                      )}>
                        {c.discountType === 'percentage'
                          ? `${c.discountValue}% off`
                          : `$${c.discountValue} off`}
                      </span>
                    </td>

                    {/* Courses */}
                    <td className="px-4 py-4 hidden md:table-cell">
                      {c.applicableCourses.length === 0 ? (
                        <span className="text-xs text-gray-400 italic">All courses</span>
                      ) : (
                        <div className="space-y-0.5">
                          {c.applicableCourses.slice(0, 2).map(course => (
                            <span key={course._id} className="block text-xs text-gray-600 truncate max-w-[140px]">
                              {course.title}
                            </span>
                          ))}
                          {c.applicableCourses.length > 2 && (
                            <span className="text-xs text-gray-400">+{c.applicableCourses.length - 2} more</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Usage bar */}
                    <td className="px-4 py-4">
                      <UsageBar used={c.usedCount} max={c.maxUses} />
                    </td>

                    {/* Expiry */}
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className={cn('text-xs', expiry.cls)}>{expiry.text}</span>
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-4">
                      <span className={cn(
                        'inline-block px-2.5 py-0.5 rounded-full text-xs font-medium',
                        STATUS_BADGE_STYLE[status]
                      )}>
                        {STATUS_LABEL[status]}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={toggleMutation.isPending}
                          onClick={() => toggleMutation.mutate({ id: c._id, isActive: !c.isActive })}
                        >
                          <span className={c.isActive ? 'text-amber-600' : 'text-green-600'}>
                            {c.isActive ? 'Deactivate' : 'Activate'}
                          </span>
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm(`Delete coupon ${c.code}?`)) deleteMutation.mutate(c._id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <CouponModal
          coupon={editing}
          courses={courses}
          onClose={() => { setModalOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
