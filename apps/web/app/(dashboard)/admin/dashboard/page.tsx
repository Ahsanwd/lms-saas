'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Spinner } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ExpiringSubscription {
  _id: string;
  tenantId: { name: string; subdomain: string };
  currentPeriodEnd: string;
  planId: { name: string };
}

interface AdminDashboard {
  tenants:  { total: number; active: number; suspended: number; trial: number };
  users:    { total: number; students: number; instructors: number; tenantAdmins: number };
  courses:  { total: number };
  revenue:  { total: number; monthly: number; invoiceCount: number };
  alerts:   { expiringSubscriptions: ExpiringSubscription[]; unpaidInvoices: unknown[] };
}

interface CronLog {
  _id: string;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: 'running' | 'success' | 'partial' | 'error';
  results: {
    trialsGracePeriod: number;
    subscriptionsGracePeriod: number;
    pastDueExpired: number;
    trialWarningsSent: number;
    subscriptionWarningsSent: number;
    errors: string[];
  };
}

const CRON_STATUS_COLOR: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  partial:  'bg-amber-100 text-amber-700',
  error:    'bg-red-100 text-red-700',
  running:  'bg-blue-100 text-blue-700',
};

function CronHealthCard() {
  const { data, isLoading } = useQuery<{ logs: CronLog[]; total: number }>({
    queryKey: ['admin', 'cron-logs'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/cron-logs?limit=5');
      return data.data;
    },
    refetchInterval: 60_000,
  });

  const logs = data?.logs ?? [];
  const latest = logs[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Cron Health — Expiry Job</CardTitle>
          {latest && (
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${CRON_STATUS_COLOR[latest.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {latest.status}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="text-sm text-gray-400">Loading…</div>}
        {!isLoading && !latest && (
          <p className="text-sm text-gray-400">No cron runs recorded yet.</p>
        )}
        {latest && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Trials → Grace',     value: latest.results.trialsGracePeriod },
                { label: 'Subs → Grace',        value: latest.results.subscriptionsGracePeriod },
                { label: 'Expired',             value: latest.results.pastDueExpired },
                { label: 'Trial Warnings',      value: latest.results.trialWarningsSent },
                { label: 'Sub Warnings',        value: latest.results.subscriptionWarningsSent },
                { label: 'Duration',            value: latest.durationMs != null ? `${latest.durationMs}ms` : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            {latest.results.errors.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
                <p className="text-xs font-semibold text-red-700 mb-1">Errors</p>
                <ul className="space-y-0.5">
                  {latest.results.errors.map((e, i) => (
                    <li key={i} className="text-xs text-red-600 font-mono">{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-gray-400">
              Last run: {formatDate(latest.startedAt)}
              {latest.finishedAt ? ` · Finished: ${formatDate(latest.finishedAt)}` : ' · Still running'}
            </p>
          </>
        )}

        {logs.length > 1 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent runs</p>
            <div className="space-y-2">
              {logs.slice(1).map(log => (
                <div key={log._id} className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatDate(log.startedAt)}</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium capitalize ${CRON_STATUS_COLOR[log.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminDashboardPage() {
  const router = useRouter();

  const { data: stats, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery<AdminDashboard>({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/admin/dashboard');
      return data.data.dashboard as AdminDashboard;
    },
    refetchInterval: 30_000,
  });

  const expiring = stats?.alerts?.expiringSubscriptions ?? [];

  const lastUpdatedLabel = dataUpdatedAt
    ? (() => {
        const secs = Math.floor((Date.now() - dataUpdatedAt) / 1000);
        if (secs < 10) return 'just now';
        if (secs < 60) return `${secs}s ago`;
        return `${Math.floor(secs / 60)}m ago`;
      })()
    : null;

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Super admin — all tenants.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {lastUpdatedLabel && (
            <span className="text-xs text-gray-400">Updated {lastUpdatedLabel}</span>
          )}
          <Button size="sm" variant="outline" loading={isFetching} onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'All Tenants',      path: '/admin/tenants',         color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
          { label: 'Billing & Subs',   path: '/admin/billing',         color: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
          { label: 'Unpaid Invoices',  path: '/admin/billing?tab=invoices', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
          { label: 'Activity Log',     path: '/activity',              color: 'bg-green-50 text-green-700 hover:bg-green-100' },
        ].map(({ label, path, color }) => (
          <button
            key={label}
            onClick={() => router.push(path)}
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-left transition-colors ${color}`}
          >
            {label} →
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Tenants"
          value={stats?.tenants?.total ?? 0}
          subtitle={`${stats?.tenants?.active ?? 0} active · ${stats?.tenants?.trial ?? 0} trial`}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          title="Total Users"
          value={stats?.users?.total ?? 0}
          subtitle={`${stats?.users?.students ?? 0} students · ${stats?.users?.instructors ?? 0} instructors`}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(stats?.revenue?.monthly ?? 0)}
          subtitle={`Total: ${formatCurrency(stats?.revenue?.total ?? 0)}`}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total Courses"
          value={stats?.courses?.total ?? 0}
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
      </div>

      {(stats?.tenants?.suspended ?? 0) > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          ⚠ {stats?.tenants?.suspended} tenant(s) currently suspended. Review in Tenants → Suspended.
        </div>
      )}

      <CronHealthCard />

      {expiring.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions Expiring Soon</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {expiring.map((sub) => (
                <div key={sub._id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {sub.tenantId?.name ?? sub.tenantId?.subdomain}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sub.planId?.name} · Expires {formatDate(sub.currentPeriodEnd)}
                    </p>
                  </div>
                  <Badge variant="warning">Expiring soon</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
