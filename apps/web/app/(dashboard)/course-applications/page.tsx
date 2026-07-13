'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface CourseApplication {
  _id: string;
  name: string;
  email: string;
  phone: string | null;
  gender: 'male' | 'female' | 'other' | null;
  status: 'pending' | 'approved' | 'rejected';
  courseId: { _id: string; title: string } | null;
  createdAt: string;
}

interface CourseOption { _id: string; title: string }

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_VARIANT: Record<CourseApplication['status'], 'warning' | 'success' | 'danger'> = {
  pending: 'warning', approved: 'success', rejected: 'danger',
};

export default function CourseApplicationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [courseFilter, setCourseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['course-applications', page, courseFilter, statusFilter],
    queryFn: async () => {
      const res = await api.get('/course-applications', {
        params: { page, limit: 20, courseId: courseFilter || undefined, status: statusFilter || undefined },
      });
      return res.data.data as { applications: CourseApplication[]; total: number; page: number };
    },
  });

  const { data: coursesData } = useQuery({
    queryKey: ['courses-simple'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=200&status=published');
      return (data.data?.courses ?? []) as CourseOption[];
    },
  });

  const applications = data?.applications ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/course-applications/${id}/approve`),
    onSuccess: () => { setActionError(null); qc.invalidateQueries({ queryKey: ['course-applications'] }); },
    onError: (err: AxiosError<{ message?: string }>) => setActionError(err.response?.data?.message || 'Failed to approve application'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/course-applications/${id}/reject`),
    onSuccess: () => { setActionError(null); qc.invalidateQueries({ queryKey: ['course-applications'] }); },
    onError: (err: AxiosError<{ message?: string }>) => setActionError(err.response?.data?.message || 'Failed to reject application'),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Course Applications</h1>
        <p className="text-sm text-gray-500 mt-0.5">Applications submitted through your website's Course Application section</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">All courses</option>
          {(coursesData ?? []).map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error && <Alert variant="error">Failed to load applications.</Alert>}
      {actionError && <Alert variant="error">{actionError}</Alert>}

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : applications.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <p className="text-gray-500">No applications yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{total} application{total !== 1 ? 's' : ''}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {applications.map((a) => (
                <div key={a._id} className="flex items-center gap-4 px-4 py-3">
                  <Badge variant={STATUS_VARIANT[a.status]}>{a.status[0].toUpperCase() + a.status.slice(1)}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {a.name} <span className="text-gray-400 font-normal">— {a.courseId?.title ?? 'Unknown course'}</span>
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {a.email}{a.phone ? ` · ${a.phone}` : ''}{a.gender ? ` · ${a.gender}` : ''}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">{formatDate(a.createdAt)}</p>
                  {a.status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button size="sm" loading={approveMutation.isPending && approveMutation.variables === a._id} onClick={() => approveMutation.mutate(a._id)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" loading={rejectMutation.isPending && rejectMutation.variables === a._id} onClick={() => rejectMutation.mutate(a._id)}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {page} of {totalPages} · {total} total</p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
