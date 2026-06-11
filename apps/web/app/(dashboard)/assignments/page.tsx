'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { Assignment, SubmissionStatus } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assignmentStatusBadge(status: string) {
  const map: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
    published: 'success',
    draft:     'warning',
    archived:  'danger',
  };
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>;
}

function submissionStatusBadge(status: SubmissionStatus | null | undefined) {
  if (!status) return <Badge variant="default">Pending</Badge>;
  const map: Record<SubmissionStatus, 'default' | 'success' | 'warning' | 'danger'> = {
    submitted: 'default',
    late:      'warning',
    graded:    'success',
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}

function formatDue(date: string | null) {
  if (!date) return '—';
  const d = new Date(date);
  const overdue = d < new Date();
  return (
    <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-700'}>
      {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssignmentsPage() {
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage]     = useState(1);

  const isManager = user?.role === 'tenant_admin' || user?.role === 'instructor';
  const isStudent = user?.role === 'student';

  // ── Assignment list ──
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['assignments', search, status, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 15 };
      if (search) params.search = search;
      if (status) params.status = status;
      const res = await api.get('/assignments', { params });
      return res.data.data as {
        assignments: Assignment[];
        pagination: { total: number; page: number; limit: number };
      };
    },
  });

  const assignments = data?.assignments ?? [];
  const total       = data?.pagination.total ?? 0;
  const totalPages  = Math.ceil(total / 15);

  // ── Bulk submission status for students (#8) ──
  // Once assignments are loaded, fetch my submission status for all of them in one call.
  const { data: mySubmissions } = useQuery({
    queryKey: ['my-submissions-bulk', assignments.map((a) => a._id).join(',')],
    queryFn: async () => {
      const ids = assignments.map((a) => a._id).join(',');
      if (!ids) return {} as Record<string, { status: SubmissionStatus; marks: number | null }>;
      const res = await api.get('/assignments/my-submissions', { params: { assignmentIds: ids } });
      return res.data.data as Record<string, { status: SubmissionStatus; marks: number | null }>;
    },
    enabled: isStudent && assignments.length > 0,
  });

  if (isLoading || isPending) return (
    <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isStudent ? 'Your course assignments' : 'Manage assignments across your courses'}
          </p>
        </div>
        {isManager && (
          <Link href="/assignments/create">
            <Button>+ New Assignment</Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search assignments..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
            />
            {isManager && (
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            )}
          </div>
        </CardContent>
      </Card>

      {error && <Alert variant="error">Failed to load assignments.</Alert>}

      {/* Table */}
      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-gray-500">
              {isStudent
                ? 'No assignments in your enrolled courses yet.'
                : 'No assignments found. Create your first one!'}
            </p>
            {isManager && (
              <Link href="/assignments/create" className="mt-4 inline-block">
                <Button>+ Create Assignment</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{total} assignment{total !== 1 ? 's' : ''}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Course</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Due Date</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Marks</th>
                    {isManager && (
                      <>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Submissions</th>
                      </>
                    )}
                    {isStudent && (
                      <th className="px-4 py-3 text-left font-medium text-gray-600">My Status</th>
                    )}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assignments.map((a) => {
                    const course    = typeof a.courseId === 'string' ? null : a.courseId;
                    const mySub   = mySubmissions?.[a._id];
                    const overdue = a.dueDate && new Date(a.dueDate) < new Date();

                    return (
                      <tr key={a._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{a.title}</p>
                          {a.description && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{a.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{course?.title ?? '—'}</td>
                        <td className="px-4 py-3">{formatDue(a.dueDate)}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {/* For graded students show their score alongside total */}
                          {isStudent && mySub?.status === 'graded' && mySub.marks !== null
                            ? <span className="font-semibold text-primary-700">{mySub.marks}/{a.totalMarks}</span>
                            : <span>{a.totalMarks} pts</span>
                          }
                        </td>
                        {isManager && (
                          <>
                            <td className="px-4 py-3">{assignmentStatusBadge(a.status)}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {a.submissionCount} submitted · {a.gradedCount} graded
                            </td>
                          </>
                        )}
                        {isStudent && (
                          <td className="px-4 py-3">
                            {/* Show overdue badge if past due and no submission */}
                            {!mySub && overdue && !a.allowLateSubmission
                              ? <Badge variant="danger">Overdue</Badge>
                              : submissionStatusBadge(mySub?.status)
                            }
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          <Link href={`/assignments/${a._id}`}>
                            <Button variant="ghost" size="sm">View</Button>
                          </Link>
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
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} · {total} total
          </p>
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
    </div>
  );
}
