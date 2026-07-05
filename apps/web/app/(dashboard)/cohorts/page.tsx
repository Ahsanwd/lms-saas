'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Spinner, Badge } from '@/components/ui';
import { formatDate } from '@/lib/utils';

interface CourseRef { _id: string; title: string; thumbnail?: string }
interface Cohort {
  _id: string;
  name: string;
  description: string;
  courseId: CourseRef;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  startDate?: string;
  endDate?: string;
  maxSize: number;
  memberCount: number;
  graduatedCount: number;
  graduationRate: number;
  createdAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  upcoming:  'bg-blue-50 text-blue-700',
  active:    'bg-green-50 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-50 text-red-600',
};

function ProgressRing({ value }: { value: number }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width="40" height="40" className="-rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="#3b82f6" strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
      <text x="20" y="20" className="rotate-90" fill="#111827" fontSize="9" fontWeight="600"
        textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: '20px 20px' }}>
        {value}%
      </text>
    </svg>
  );
}

export default function CohortsPage() {
  const router = useRouter();
  const [courseFilter, setCourseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: cohorts = [], isLoading } = useQuery<Cohort[]>({
    queryKey: ['cohorts', courseFilter, statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (courseFilter) params.courseId = courseFilter;
      if (statusFilter) params.status   = statusFilter;
      const { data } = await api.get('/cohorts', { params });
      return data.data.cohorts as Cohort[];
    },
  });

  // Unique courses for filter dropdown
  const courseOptions = Array.from(
    new Map(cohorts.map(c => [c.courseId._id, c.courseId])).values()
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cohorts</h1>
          <p className="text-sm text-gray-500 mt-1">Track student groups through course completion and graduation</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={courseFilter}
          onChange={e => setCourseFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          <option value="">All Courses</option>
          {courseOptions.map(c => (
            <option key={c._id} value={c._id}>{c.title}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          <option value="">All Statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {(courseFilter || statusFilter) && (
          <button
            onClick={() => { setCourseFilter(''); setStatusFilter(''); }}
            className="text-sm text-gray-400 hover:text-gray-600 px-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : cohorts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-gray-200 text-center">
          <svg className="w-12 h-12 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="font-medium text-gray-900">No cohorts found</p>
          <p className="text-sm text-gray-400 mt-1">Create cohorts from the course management page.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cohort</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Course</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Dates</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Students</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Graduation</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cohorts.map(c => (
                <tr
                  key={c._id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/cohorts/${c._id}`)}
                >
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.description && (
                      <p className="text-xs text-gray-400 truncate max-w-[200px] mt-0.5">{c.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      {c.courseId.thumbnail ? (
                        <img src={c.courseId.thumbnail} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded bg-primary-50 flex-shrink-0 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253" />
                          </svg>
                        </div>
                      )}
                      <span className="text-gray-700 truncate max-w-[160px]">{c.courseId.title}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLE[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-gray-500 text-xs">
                    {c.startDate ? formatDate(c.startDate) : '—'}
                    {c.endDate && <> → {formatDate(c.endDate)}</>}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <p className="font-semibold text-gray-900">{c.memberCount}</p>
                    {c.maxSize > 0 && (
                      <p className="text-xs text-gray-400">of {c.maxSize}</p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col items-center gap-0.5">
                      <ProgressRing value={c.graduationRate} />
                      <span className="text-xs text-gray-400">{c.graduatedCount} / {c.memberCount}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/cohorts/${c._id}`); }}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700"
                    >
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
