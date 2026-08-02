'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AxiosError } from 'axios';
import { useForumThreads, ThreadCard, CreateThreadModal } from '@/components/forum/shared';

export default function CourseForumPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [sort, setSort]         = useState<'latest' | 'top' | 'unanswered'>('latest');
  const [page, setPage]         = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody]   = useState('');
  const [newTags, setNewTags]   = useState('');
  const [createError, setCreateError] = useState('');

  const { data: course } = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}`);
      return data.data.course as { title: string };
    },
    staleTime: 60000,
  });

  const { data, isLoading, isError } = useForumThreads(courseId, sort, page, 20);

  const createMutation = useMutation({
    mutationFn: () => api.post(`/forum/courses/${courseId}/threads`, {
      title: newTitle.trim(),
      body:  newBody.trim(),
      tags:  newTags.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forum-threads', courseId] });
      setShowCreate(false);
      setNewTitle(''); setNewBody(''); setNewTags(''); setCreateError('');
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setCreateError(err.response?.data?.message ?? 'Failed to create thread'),
  });

  function resetCreate() {
    setShowCreate(false);
    setCreateError('');
    setNewTitle('');
    setNewBody('');
    setNewTags('');
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* ── Page Header ── */}
      <div>
        <button
          onClick={() => router.push(`/courses/${courseId}`)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Course
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Forum</h1>
            {course && <p className="text-sm text-gray-500 mt-0.5">{course.title}</p>}
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Thread
          </Button>
        </div>
      </div>

      {/* ── Sort tabs ── */}
      <div className="flex items-center border-b border-gray-200">
        {(['latest', 'top', 'unanswered'] as const).map(s => (
          <button key={s} onClick={() => { setSort(s); setPage(1); }}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors',
              sort === s
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}>
            {s === 'unanswered' ? 'Unanswered' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        {(data?.pagination?.total ?? 0) > 0 && (
          <span className="ml-auto text-xs text-gray-400 pr-1">
            {data!.pagination.total} thread{data!.pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Thread list ── */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : isError ? (
        <div className="text-center py-12 bg-red-50 rounded-2xl border border-red-100">
          <p className="text-sm text-red-500 font-medium">Failed to load forum. Please try again.</p>
        </div>
      ) : (data?.threads ?? []).length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-700 mb-1">No discussions yet</p>
          <p className="text-sm text-gray-400 mb-5">Be the first to start a conversation!</p>
          <Button onClick={() => setShowCreate(true)}>Start a Thread</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {data!.threads.map(thread => (
            <ThreadCard key={thread._id} thread={thread}
              onClick={() => router.push(`/courses/${courseId}/forum/${thread._id}`)} />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {data?.pagination && data.pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Previous</Button>
          <span className="text-sm text-gray-500">{page} / {data.pagination.pages}</span>
          <Button size="sm" variant="outline" disabled={page >= data.pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</Button>
        </div>
      )}

      {/* ── Create Thread Modal ── */}
      {showCreate && (
        <CreateThreadModal
          onClose={resetCreate}
          onCreate={() => createMutation.mutate()}
          title={newTitle} setTitle={setNewTitle}
          body={newBody}   setBody={setNewBody}
          tags={newTags}   setTags={setNewTags}
          error={createError} isPending={createMutation.isPending}
        />
      )}
    </div>
  );
}
