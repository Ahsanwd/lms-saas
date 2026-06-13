'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge, Spinner } from '@/components/ui';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DateRange { from: Date; to: Date }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents ?? 0) / 100);
}
function fmtHours(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function shortMonth(m: number) {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] ?? '';
}
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function presetRange(key: string): DateRange {
  const to = new Date(); const from = new Date();
  if (key === '7d')  from.setDate(from.getDate() - 7);
  else if (key === '30d') from.setDate(from.getDate() - 30);
  else if (key === '3m')  from.setMonth(from.getMonth() - 3);
  else if (key === '6m')  from.setMonth(from.getMonth() - 6);
  else                     from.setMonth(from.getMonth() - 12);
  return { from, to };
}

function downloadCSV(filename: string, headers: string[], rows: (string | number)[]) {
  const escape = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-gray-900 mb-3">{children}</h2>;
}
function MetricRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-900">{value}</span>
        {sub && <span className="text-xs text-gray-400 ml-1.5">{sub}</span>}
      </div>
    </div>
  );
}
function HBar({ value, color = 'bg-primary-500' }: { value: number; color?: string }) {
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 px-5 py-4 ${className}`}>{children}</div>;
}
function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-gray-400 text-center py-8">{msg}</p>;
}
function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Date Range Picker ────────────────────────────────────────────────────────
const PRESETS = [
  { key: '7d',  label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '3m',  label: '3 months' },
  { key: '6m',  label: '6 months' },
  { key: '12m', label: '12 months' },
];

function DateRangePicker({ range, onChange }: {
  range: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const [activePreset, setActivePreset] = useState('12m');
  const [custom, setCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(isoDate(range.from));
  const [customTo, setCustomTo]   = useState(isoDate(range.to));

  function applyPreset(key: string) {
    setActivePreset(key); setCustom(false);
    onChange(presetRange(key));
  }
  function applyCustom() {
    if (customFrom && customTo) onChange({ from: new Date(customFrom), to: new Date(customTo) });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => (
        <button
          key={p.key}
          onClick={() => applyPreset(p.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            activePreset === p.key && !custom
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => { setCustom(c => !c); setActivePreset(''); }}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          custom ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
        }`}
      >
        Custom
      </button>
      {custom && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <button onClick={applyCustom}
            className="px-3 py-1.5 bg-primary-600 text-white text-xs font-semibold rounded-lg hover:bg-primary-700">
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Export button ────────────────────────────────────────────────────────────
function ExportBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Export CSV
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ role }: { role: string }) {
  const isInstructor = role === 'instructor';

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard', isInstructor ? 'instructor' : 'tenant-admin'],
    queryFn: async () => {
      const url = isInstructor ? '/dashboard/instructor' : '/dashboard/tenant-admin';
      const { data } = await api.get(url);
      return data.data.dashboard;
    },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!stats)    return <Empty msg="No data yet." />;

  if (isInstructor) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard title="My Courses"     value={stats.courses?.total ?? 0}              subtitle={`${stats.courses?.published ?? 0} published`}            color="blue"   icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>} />
          <StatCard title="Total Students" value={stats.students?.total ?? 0}             subtitle={`${stats.students?.averageCompletion ?? 0}% avg completion`} color="green"  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>} />
          <StatCard title="Quiz Avg Score" value={`${stats.quizzes?.averageScore ?? 0}%`} subtitle={`${stats.quizzes?.totalAttempts ?? 0} attempts`}           color="purple" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
          <StatCard title="Pending Grades" value={stats.quizzes?.pendingGrades ?? 0}      subtitle="need manual review"                                       color="orange" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card><SectionTitle>Top Courses</SectionTitle>{(stats.topCourses ?? []).map((c: any, i: number) => (<div key={c._id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"><span className="text-xs font-bold text-gray-300 w-4">{i+1}</span><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{c.title}</p><HBar value={Math.min(100, c.enrollmentCount * 5)} /></div><span className="text-sm font-semibold text-gray-900 ml-2">{c.enrollmentCount}</span></div>))}{(stats.topCourses?.length ?? 0) === 0 && <Empty msg="No courses yet." />}</Card>
          <Card><SectionTitle>Recent Enrollments</SectionTitle>{(stats.recentEnrollments ?? []).map((e: any) => (<div key={e._id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"><div className="w-7 h-7 rounded-full bg-primary-100 flex-shrink-0 flex items-center justify-center text-primary-700 text-xs font-bold uppercase">{e.userId?.firstName?.[0] ?? '?'}</div><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{e.userId?.firstName} {e.userId?.lastName}</p><p className="text-xs text-gray-400 truncate">{e.courseId?.title}</p></div><span className="text-xs text-gray-400">{formatDate(e.enrolledAt)}</span></div>))}{(stats.recentEnrollments?.length ?? 0) === 0 && <Empty msg="No enrollments yet." />}</Card>
        </div>
      </div>
    );
  }

  const totalEnrollments = (stats.enrollments?.active ?? 0) + (stats.enrollments?.completed ?? 0) + (stats.enrollments?.dropped ?? 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Users"       value={stats.users?.total ?? 0}                    subtitle={`+${stats.users?.newThisMonth ?? 0} this month`}         color="blue"   icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
        <StatCard title="Total Enrollments" value={totalEnrollments}                           subtitle={`${stats.enrollments?.completionRate ?? 0}% completion`}  color="green"  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Avg Completion"    value={`${stats.progress?.averageCompletion ?? 0}%`} subtitle="across all courses"                                   color="purple" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
        <StatCard title="Quiz Pass Rate"    value={`${stats.quizzes?.passRate ?? 0}%`}         subtitle={`${stats.quizzes?.totalAttempts ?? 0} attempts`}         color="orange" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Card><SectionTitle>User Breakdown</SectionTitle><MetricRow label="Students" value={stats.users?.students ?? 0} /><MetricRow label="Instructors" value={stats.users?.instructors ?? 0} /><MetricRow label="New this month" value={stats.users?.newThisMonth ?? 0} /></Card>
          <Card><SectionTitle>Course Status</SectionTitle><MetricRow label="Published" value={stats.courses?.published ?? 0} /><MetricRow label="Draft" value={stats.courses?.draft ?? 0} /><MetricRow label="Total" value={stats.courses?.total ?? 0} /></Card>
          <Card><SectionTitle>Enrollment Status</SectionTitle><MetricRow label="Active" value={stats.enrollments?.active ?? 0} /><MetricRow label="Completed" value={stats.enrollments?.completed ?? 0} /><MetricRow label="Dropped" value={stats.enrollments?.dropped ?? 0} /><div className="mt-3"><div className="flex justify-between text-xs text-gray-500 mb-1"><span>Completion rate</span><span>{stats.enrollments?.completionRate ?? 0}%</span></div><HBar value={stats.enrollments?.completionRate ?? 0} color="bg-green-500" /></div></Card>
        </div>
        <Card><SectionTitle>Popular Courses</SectionTitle>{(stats.popularCourses ?? []).map((c: any, i: number) => (<div key={c._id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"><span className="text-xs font-bold text-gray-300 w-4">{i+1}</span><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{c.title}</p><p className="text-xs text-gray-400 capitalize">{c.level}</p></div><div className="text-right"><p className="text-sm font-semibold">{c.enrollmentCount}</p><p className="text-xs text-gray-400">students</p></div></div>))}{(stats.popularCourses?.length ?? 0) === 0 && <Empty msg="No published courses yet." />}</Card>
        <Card><SectionTitle>Recent Enrollments</SectionTitle>{(stats.recentEnrollments ?? []).map((e: any) => (<div key={e._id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"><div className="w-7 h-7 rounded-full bg-primary-100 flex-shrink-0 flex items-center justify-center text-primary-700 text-xs font-bold uppercase">{e.userId?.firstName?.[0] ?? '?'}</div><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{e.userId?.firstName} {e.userId?.lastName}</p><p className="text-xs text-gray-400 truncate">{e.courseId?.title}</p></div><div className="text-right flex-shrink-0"><Badge variant={e.status === 'completed' ? 'success' : 'default'}>{e.status}</Badge><p className="text-xs text-gray-300 mt-0.5">{formatDate(e.enrolledAt)}</p></div></div>))}{(stats.recentEnrollments?.length ?? 0) === 0 && <Empty msg="No enrollments yet." />}</Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function StudentsTab() {
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-students', search, page],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, limit: 20 };
      if (search) params.search = search;
      const { data } = await api.get('/analytics/students', { params });
      return data.data as { students: any[]; total: number; page: number; limit: number };
    },
  });

  const students   = data?.students ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  function exportCSV() {
    const headers = ['Name', 'Email', 'Enrolled', 'Completed', 'Avg Completion %', 'Last Active', 'Joined'];
    const rows = students.map(s => [
      `${s.firstName} ${s.lastName}`,
      s.email,
      s.enrollmentCount,
      s.completedCount,
      s.avgCompletion,
      s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleDateString() : '',
      new Date(s.createdAt).toLocaleDateString(),
    ]);
    downloadCSV('students.csv', headers, rows as any);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text" placeholder="Search by name or email…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
        />
        <span className="text-sm text-gray-500">{total} student{total !== 1 ? 's' : ''}</span>
        <div className="ml-auto">{students.length > 0 && <ExportBtn onClick={exportCSV} />}</div>
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Enrolled</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Completed</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Avg Progress</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Last Active</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400">No students found.</td></tr>
              ) : students.map((s: any) => (
                <tr key={s._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-gray-400">{s.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{s.enrollmentCount}</td>
                  <td className="px-4 py-3 text-gray-700">{s.completedCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${s.avgCompletion >= 80 ? 'bg-green-500' : s.avgCompletion >= 40 ? 'bg-blue-500' : 'bg-gray-300'}`} style={{ width: `${s.avgCompletion}%` }} />
                      </div>
                      <span className="text-xs text-gray-600">{s.avgCompletion}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.lastActivityAt ? formatDate(s.lastActivityAt) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function RevenueTab() {
  const [range, setRange] = useState<DateRange>(presetRange('12m'));

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-revenue', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data } = await api.get('/analytics/revenue', {
        params: { from: range.from.toISOString(), to: range.to.toISOString() },
      });
      return data.data as any;
    },
  });

  const chartData = (data?.monthly ?? []).map((m: any) => ({
    name: `${shortMonth(m._id.month)} '${String(m._id.year).slice(2)}`,
    revenue: Math.round((m.revenue ?? 0) / 100 * 100) / 100,
    sales: m.count ?? 0,
  }));

  function exportCSV() {
    downloadCSV('revenue-monthly.csv',
      ['Month', 'Revenue (USD)', 'Sales'],
      chartData.map((r: any) => [r.name, r.revenue, r.sales]) as any
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <DateRangePicker range={range} onChange={setRange} />
        {chartData.length > 0 && <ExportBtn onClick={exportCSV} />}
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total Revenue',   value: fmt$(data?.totalRevenue ?? 0) },
              { label: 'Total Sales',     value: String(data?.totalSales ?? 0) },
              { label: 'Avg Order Value', value: fmt$(data?.avgOrderValue ?? 0) },
            ].map(({ label, value }) => (
              <Card key={label}>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* recharts BarChart */}
            <Card className="!px-3 !py-4">
              <SectionTitle>Monthly Revenue</SectionTitle>
              {chartData.length === 0 ? <Empty msg="No revenue data yet." /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}`} width={48} />
                    <RechartsTip
                      formatter={(v: number | undefined) => [`$${Number(v ?? 0).toFixed(2)}`, 'Revenue']}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="revenue" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* By provider */}
            <Card>
              <SectionTitle>By Payment Method</SectionTitle>
              {(data?.byProvider ?? []).length === 0 ? <Empty msg="No data yet." /> : (
                data?.byProvider.map((p: any) => (
                  <div key={p._id} className="py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium capitalize text-gray-700">{p._id === 'mock' ? 'Demo' : p._id}</span>
                      <span className="font-semibold text-gray-900">{fmt$(p.revenue)} <span className="text-xs text-gray-400 font-normal">({p.count} sales)</span></span>
                    </div>
                    <HBar value={(p.revenue / (data?.totalRevenue || 1)) * 100} />
                  </div>
                ))
              )}
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Top Courses by Revenue</SectionTitle>
            </div>
            {(data?.byCourse ?? []).length === 0 ? <Empty msg="No course sales yet." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="py-2 text-left font-medium text-gray-500">#</th>
                      <th className="py-2 text-left font-medium text-gray-500">Course</th>
                      <th className="py-2 text-right font-medium text-gray-500">Sales</th>
                      <th className="py-2 text-right font-medium text-gray-500">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data?.byCourse.map((c: any, i: number) => (
                      <tr key={c.courseId} className="hover:bg-gray-50">
                        <td className="py-2.5 text-gray-300 font-bold text-xs w-6">{i + 1}</td>
                        <td className="py-2.5 font-medium text-gray-900 max-w-xs truncate">{c.title}</td>
                        <td className="py-2.5 text-right text-gray-600">{c.sales}</td>
                        <td className="py-2.5 text-right font-semibold text-gray-900">{fmt$(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COURSES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function CoursesTab({ role }: { role: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-courses', page],
    queryFn: async () => {
      const { data } = await api.get('/analytics/courses', { params: { page, limit: 20 } });
      return data.data as { courses: any[]; total: number };
    },
  });

  const courses    = data?.courses ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  function exportCSV() {
    const headers = ['Course', 'Status', 'Enrolled', 'Completed', 'Completion %', 'Avg Quiz Score', 'Revenue (USD)'];
    const rows = courses.map(c => [
      c.title, c.status, c.enrollments, c.completions, c.completionRate,
      c.quizAttempts > 0 ? c.avgQuizScore : 'N/A',
      c.revenue > 0 ? (c.revenue / 100).toFixed(2) : 0,
    ]);
    downloadCSV('courses.csv', headers, rows as any);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} course{total !== 1 ? 's' : ''} total</p>
        {courses.length > 0 && <ExportBtn onClick={exportCSV} />}
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Course</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Enrolled</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Completed</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Completion</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Avg Quiz</th>
                  {role === 'tenant_admin' && <th className="px-4 py-3 text-right font-medium text-gray-600">Revenue</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {courses.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-gray-400">No courses found.</td></tr>
                ) : courses.map((c: any) => (
                  <tr key={c._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{c.title}</td>
                    <td className="px-4 py-3"><Badge variant={c.status === 'published' ? 'success' : 'default'}>{c.status}</Badge></td>
                    <td className="px-4 py-3 text-right text-gray-700">{c.enrollments}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{c.completions}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.completionRate >= 70 ? 'bg-green-500' : c.completionRate >= 30 ? 'bg-blue-400' : 'bg-gray-300'}`} style={{ width: `${c.completionRate}%` }} />
                        </div>
                        <span className="text-xs text-gray-600">{c.completionRate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{c.quizAttempts > 0 ? `${c.avgQuizScore}%` : '—'}</td>
                    {role === 'tenant_admin' && <td className="px-4 py-3 text-right font-medium text-gray-900">{c.revenue > 0 ? fmt$(c.revenue) : c.isFree ? <span className="text-gray-400">Free</span> : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTRUCTOR EARNINGS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function InstructorEarningsTab() {
  const [range, setRange] = useState<DateRange>(presetRange('12m'));

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-instructor-earnings', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data } = await api.get('/analytics/instructor-earnings', {
        params: { from: range.from.toISOString(), to: range.to.toISOString() },
      });
      return data.data.instructors as any[];
    },
  });

  const instructors   = data ?? [];
  const totalRevenue  = instructors.reduce((s: number, i: any) => s + i.revenue, 0);
  const totalStudents = instructors.reduce((s: number, i: any) => s + i.totalEnrollments, 0);

  function exportCSV() {
    const headers = ['Name', 'Email', 'Courses', 'Published', 'Total Students', 'Sales', 'Revenue (USD)'];
    const rows = instructors.map((i: any) => [
      `${i.firstName} ${i.lastName}`, i.email, i.courseCount, i.publishedCourses,
      i.totalEnrollments, i.sales, (i.revenue / 100).toFixed(2),
    ]);
    downloadCSV('instructor-earnings.csv', headers, rows as any);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <DateRangePicker range={range} onChange={setRange} />
        {instructors.length > 0 && <ExportBtn onClick={exportCSV} />}
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Revenue</p><p className="text-2xl font-bold text-gray-900 mt-1">{fmt$(totalRevenue)}</p></Card>
            <Card><p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Students</p><p className="text-2xl font-bold text-gray-900 mt-1">{totalStudents}</p></Card>
            <Card><p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Instructors</p><p className="text-2xl font-bold text-gray-900 mt-1">{instructors.length}</p></Card>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Instructor</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Courses</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Published</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total Students</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Sales</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {instructors.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-gray-400">No instructors found.</td></tr>
                ) : instructors.map((i: any) => (
                  <tr key={i._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{i.firstName} {i.lastName}</p>
                      <p className="text-xs text-gray-400">{i.email}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{i.courseCount}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{i.publishedCourses}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{i.totalEnrollments}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{i.sales}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{i.revenue > 0 ? fmt$(i.revenue) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGAGEMENT TAB
// ═══════════════════════════════════════════════════════════════════════════════
function EngagementTab() {
  const [range, setRange] = useState<DateRange>(presetRange('30d'));

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-engagement', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data } = await api.get('/analytics/engagement', {
        params: { from: range.from.toISOString(), to: range.to.toISOString() },
      });
      return data.data as any;
    },
  });

  const dau = (data?.dailyActiveUsers ?? []).map((d: any) => ({
    date: d.date.slice(5),
    users: d.activeUsers,
  }));
  const maxDAU = Math.max(0, ...dau.map((d: any) => d.users));

  function exportCSV() {
    downloadCSV('engagement-dau.csv',
      ['Date', 'Active Users'],
      (data?.dailyActiveUsers ?? []).map((d: any) => [d.date, d.activeUsers]) as any
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <DateRangePicker range={range} onChange={setRange} />
        {dau.length > 0 && <ExportBtn onClick={exportCSV} />}
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Watch Time</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmtHours(data?.totalWatchSeconds ?? 0)}</p>
              <p className="text-xs text-gray-400 mt-0.5">selected period</p>
            </Card>
            <Card>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Peak Daily Active Users</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{maxDAU}</p>
              <p className="text-xs text-gray-400 mt-0.5">selected period</p>
            </Card>
          </div>

          {/* recharts AreaChart for DAU */}
          <Card className="!px-3 !py-4">
            <SectionTitle>Daily Active Users</SectionTitle>
            {dau.every((d: any) => d.users === 0) ? <Empty msg="No activity yet in this period." /> : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={dau} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={28} allowDecimals={false} />
                  <RechartsTip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Area
                    type="monotone" dataKey="users" name="Active Users"
                    stroke="#3B82F6" fill="url(#dauGrad)" strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <SectionTitle>Most Active Courses</SectionTitle>
            {(data?.activeCourses ?? []).length === 0 ? <Empty msg="No course activity yet." /> : (
              (data?.activeCourses ?? []).map((c: any, i: number) => (
                <div key={String(c.courseId)} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                    <HBar value={(c.activityCount / (data?.activeCourses?.[0]?.activityCount || 1)) * 100} />
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-sm font-semibold text-gray-900">{c.activityCount}</p>
                    <p className="text-xs text-gray-400">actions</p>
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE ENTRY
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const user         = useAuthStore(s => s.user);
  const role         = user?.role ?? '';
  const isAdmin      = role === 'tenant_admin';
  const isInstructor = role === 'instructor';

  const adminTabs = ['Overview', 'Students', 'Revenue', 'Courses', 'Instructor Earnings', 'Engagement'];
  const instrTabs = ['Overview', 'Courses'];
  const tabs      = isAdmin ? adminTabs : instrTabs;

  const [activeTab, setActiveTab] = useState('Overview');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics & Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isInstructor ? 'Your course performance and student insights.' : 'Platform-wide learning metrics and reports.'}
        </p>
      </div>

      <div className="flex gap-0 border-b border-gray-200 overflow-x-auto">
        {tabs.map(t => (
          <Tab key={t} label={t} active={activeTab === t} onClick={() => setActiveTab(t)} />
        ))}
      </div>

      <div>
        {activeTab === 'Overview'            && <OverviewTab role={role} />}
        {activeTab === 'Students'            && isAdmin && <StudentsTab />}
        {activeTab === 'Revenue'             && isAdmin && <RevenueTab />}
        {activeTab === 'Courses'             && <CoursesTab role={role} />}
        {activeTab === 'Instructor Earnings' && isAdmin && <InstructorEarningsTab />}
        {activeTab === 'Engagement'          && isAdmin && <EngagementTab />}
      </div>
    </div>
  );
}
