'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { AxiosError } from 'axios';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CourseRef { _id: string; title: string; thumbnail?: string }
interface UserRef   { _id: string; firstName: string; lastName: string; email: string; avatar?: string }

interface CohortDetail {
  _id: string; name: string; description: string; status: string;
  courseId: CourseRef; startDate?: string; endDate?: string; maxSize: number;
  memberCount: number; graduatedCount: number; graduationRate: number;
}

interface Student {
  _id: string;
  userId: UserRef;
  status: 'enrolled' | 'graduated' | 'dropped';
  progress: number;
  completedLessons: number;
  totalLessons: number;
  enrolledAt: string;
  graduatedAt?: string;
  lastAccessedAt?: string;
}

interface ReportSummary {
  total: number; graduated: number; enrolled: number; dropped: number;
  avgProgress: number; graduationRate: number; dropoutRate: number;
}

interface TopPerformer {
  userId: string;
  status: string;
  progress: number;
  user: UserRef | null;
}

interface ReportData {
  cohort: CohortDetail;
  summary: ReportSummary;
  distribution: Record<string, number>;
  topPerformers: TopPerformer[];
}

// ── Status badge ───────────────────────────────────────────────────────────────
const MEMBER_STATUS: Record<string, string> = {
  enrolled:  'bg-blue-50 text-blue-700',
  graduated: 'bg-green-50 text-green-700',
  dropped:   'bg-red-50 text-red-600',
};

const COHORT_STATUS: Record<string, string> = {
  upcoming:  'bg-blue-50 text-blue-700',
  active:    'bg-green-50 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-50 text-red-600',
};

function ProgressBar({ value }: { value: number }) {
  const color = value === 100 ? '#22c55e' : value >= 75 ? '#3b82f6' : value >= 40 ? '#f59e0b' : '#e5e7eb';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{value}%</span>
    </div>
  );
}

// ── Students tab ───────────────────────────────────────────────────────────────
function StudentsTab({ cohortId }: { cohortId: string }) {
  const qc = useQueryClient();
  const [confirmGradAll, setConfirmGradAll] = useState(false);

  const { data, isLoading } = useQuery<{ students: Student[] }>({
    queryKey: ['cohort-students', cohortId],
    queryFn: async () => {
      const { data } = await api.get(`/cohorts/${cohortId}/students`);
      return data.data as { students: Student[] };
    },
  });

  const graduateMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/cohorts/${cohortId}/students/${userId}/graduate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohort-students', cohortId] }),
  });

  const graduateAllMutation = useMutation({
    mutationFn: () => api.post(`/cohorts/${cohortId}/graduate-all`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cohort-students', cohortId] });
      qc.invalidateQueries({ queryKey: ['cohort', cohortId] });
      setConfirmGradAll(false);
      const n = res.data.data?.graduated ?? 0;
      alert(`${n} student${n !== 1 ? 's' : ''} graduated successfully.`);
    },
    onError: (err: AxiosError<{ message: string }>) =>
      alert(err.response?.data?.message ?? 'Failed to graduate all'),
  });

  const students = data?.students ?? [];
  const enrolledCount = students.filter(s => s.status === 'enrolled').length;
  const completedCount = students.filter(s => s.progress === 100 && s.status === 'enrolled').length;

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      {completedCount > 0 && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <p className="text-sm text-green-800">
            <span className="font-semibold">{completedCount}</span> student{completedCount !== 1 ? 's have' : ' has'} completed 100% and can be graduated.
          </p>
          {confirmGradAll ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-700">Graduate all {completedCount}?</span>
              <Button size="sm" loading={graduateAllMutation.isPending} onClick={() => graduateAllMutation.mutate()}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmGradAll(false)}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setConfirmGradAll(true)}>Graduate All Completed</Button>
          )}
        </div>
      )}

      {/* Table */}
      {students.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">No students enrolled in this cohort yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-48">Progress</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Enrolled</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Graduated</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.map(s => (
                <tr key={s._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-primary-700">
                        {s.userId?.firstName?.[0]}{s.userId?.lastName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{s.userId?.firstName} {s.userId?.lastName}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[180px]">{s.userId?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <ProgressBar value={s.progress} />
                    <p className="text-xs text-gray-400 mt-0.5">{s.completedLessons}/{s.totalLessons} lessons</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${MEMBER_STATUS[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-gray-500 text-xs">
                    {formatDate(s.enrolledAt)}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-gray-500 text-xs">
                    {s.graduatedAt ? formatDate(s.graduatedAt) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {s.status === 'enrolled' && (
                      <button
                        onClick={() => graduateMutation.mutate(s.userId._id)}
                        disabled={graduateMutation.isPending}
                        className="text-xs font-medium text-green-600 hover:text-green-700 disabled:opacity-40 transition-colors"
                      >
                        Graduate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
            {students.length} total · {enrolledCount} enrolled · {students.filter(s => s.status === 'graduated').length} graduated · {students.filter(s => s.status === 'dropped').length} dropped
          </div>
        </div>
      )}
    </div>
  );
}

// ── Report tab ─────────────────────────────────────────────────────────────────
function ReportTab({ cohortId }: { cohortId: string }) {
  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ['cohort-report', cohortId],
    queryFn: async () => {
      const { data } = await api.get(`/cohorts/${cohortId}/report`);
      return data.data as ReportData;
    },
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!data)     return null;

  const { summary, distribution, topPerformers } = data;

  const distData = [
    { label: '0–25%',  value: distribution['0-25'],  color: '#ef4444' },
    { label: '26–50%', value: distribution['26-50'], color: '#f59e0b' },
    { label: '51–75%', value: distribution['51-75'], color: '#3b82f6' },
    { label: '76–99%', value: distribution['76-99'], color: '#8b5cf6' },
    { label: '100%',   value: distribution['100'],   color: '#22c55e' },
  ];

  const statCards = [
    { label: 'Total Students',   value: summary.total,             sub: null },
    { label: 'Graduated',        value: summary.graduated,          sub: `${summary.graduationRate}% rate` },
    { label: 'Avg Progress',     value: `${summary.avgProgress}%`,  sub: null },
    { label: 'Active',           value: summary.enrolled,           sub: 'still enrolled' },
    { label: 'Dropout Rate',     value: `${summary.dropoutRate}%`,  sub: `${summary.dropped} dropped` },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs font-medium text-gray-500 mt-1">{s.label}</p>
            {s.sub && <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Distribution chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Progress Distribution</h3>
          {summary.total === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={distData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  formatter={(v: number) => [`${v} students`, 'Count']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {distData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top performers */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Performers</h3>
          {topPerformers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No students yet</p>
          ) : (
            <div className="space-y-3">
              {topPerformers.map((p, i) => (
                <div key={p.userId} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-300 w-5 text-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-primary-100 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-primary-700">
                    {p.user?.firstName?.[0]}{p.user?.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {p.user ? `${p.user.firstName} ${p.user.lastName}` : 'Unknown'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">{p.progress}%</span>
                    </div>
                  </div>
                  {p.status === 'graduated' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium flex-shrink-0">
                      Graduated
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main detail page ───────────────────────────────────────────────────────────
export default function CohortDetailPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<'students' | 'report'>('students');

  const { data: cohort, isLoading } = useQuery<CohortDetail>({
    queryKey: ['cohort', cohortId],
    queryFn: async () => {
      const { data } = await api.get(`/cohorts/${cohortId}`);
      return data.data.cohort as CohortDetail;
    },
  });

  if (isLoading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (!cohort)  return <div className="text-gray-500 p-6">Cohort not found.</div>;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <button
          onClick={() => router.push('/cohorts')}
          className="text-sm text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Cohorts
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{cohort.name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${COHORT_STATUS[cohort.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {cohort.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {cohort.courseId.title}
              {cohort.startDate && <> · {formatDate(cohort.startDate)}{cohort.endDate && ` → ${formatDate(cohort.endDate)}`}</>}
            </p>
            {cohort.description && <p className="text-sm text-gray-400 mt-0.5">{cohort.description}</p>}
          </div>

          {/* Summary pills */}
          <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{cohort.memberCount}</p>
              <p className="text-xs text-gray-400">Students</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <p className="text-lg font-bold text-green-600">{cohort.graduatedCount}</p>
              <p className="text-xs text-gray-400">Graduated</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{cohort.graduationRate}%</p>
              <p className="text-xs text-gray-400">Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['students', 'report'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'students' ? (
        <StudentsTab cohortId={cohortId} />
      ) : (
        <ReportTab cohortId={cohortId} />
      )}
    </div>
  );
}
