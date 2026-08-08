'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface ContactSubmission {
  _id: string;
  name: string | null;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: 'new' | 'read';
  createdAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ContactSubmissionsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['contact-submissions', page],
    queryFn: async () => {
      const res = await api.get('/tenant/contact-submissions', { params: { page, limit: 20 } });
      return res.data.data as { submissions: ContactSubmission[]; total: number; page: number };
    },
  });

  const submissions = data?.submissions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/tenant/contact-submissions/${id}`, { status: 'read' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-submissions'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tenant/contact-submissions/${id}`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['contact-submissions'] });
      setExpanded((prev) => (prev === id ? null : prev));
    },
  });

  function toggleExpand(s: ContactSubmission) {
    setExpanded((prev) => (prev === s._id ? null : s._id));
    if (s.status === 'new') markReadMutation.mutate(s._id);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contact Submissions</h1>
        <p className="text-sm text-gray-500 mt-0.5">Messages submitted through your website's Contact Form section</p>
      </div>

      {error && <Alert variant="error">Failed to load submissions.</Alert>}

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <p className="text-gray-500">No submissions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{total} submission{total !== 1 ? 's' : ''}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {submissions.map((s) => (
                <div key={s._id}>
                  <button
                    onClick={() => toggleExpand(s)}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <Badge variant={s.status === 'new' ? 'warning' : 'default'}>{s.status === 'new' ? 'New' : 'Read'}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {s.name || s.email} {s.subject && <span className="text-gray-400 font-normal">— {s.subject}</span>}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{s.email}{s.phone ? ` · ${s.phone}` : ''}</p>
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0">{formatDate(s.createdAt)}</p>
                  </button>
                  {expanded === s._id && (
                    <div className="px-4 pb-4 pl-[4.5rem] space-y-2">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap break-words bg-gray-50 border border-gray-100 rounded-lg p-3">{s.message}</p>
                      <button
                        onClick={() => { if (confirm('Delete this submission? This cannot be undone.')) deleteMutation.mutate(s._id); }}
                        disabled={deleteMutation.isPending}
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        {deleteMutation.isPending && deleteMutation.variables === s._id ? 'Deleting…' : 'Delete'}
                      </button>
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
