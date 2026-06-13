'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AxiosError } from 'axios';

interface ForumThread {
  _id: string;
  title: string;
  body: string;
  authorName: string;
  authorRole: 'student' | 'instructor' | 'tenant_admin';
  tags: string[];
  isPinned: boolean;
  isResolved: boolean;
  isClosed: boolean;
  replyCount: number;
  views: number;
  likeCount: number;
  isLikedByMe: boolean;
  createdAt: string;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

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

  const { data, isLoading, isError } = useQuery<{
    threads: ForumThread[];
    pagination: { page: number; pages: number; total: number };
  }>({
    queryKey: ['forum-threads', courseId, sort, page],
    queryFn: async () => {
      const { data } = await api.get(`/forum/courses/${courseId}/threads?sort=${sort}&page=${page}&limit=20`);
      return data.data;
    },
  });

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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

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
            <button
              key={thread._id}
              onClick={() => router.push(`/courses/${courseId}/forum/${thread._id}`)}
              className="w-full text-left bg-white border border-gray-200 hover:border-primary-300 hover:shadow-sm rounded-xl p-4 transition-all group"
            >
              <div className="flex gap-3.5">
                {/* Status bar */}
                <div className={cn(
                  'w-1 flex-shrink-0 rounded-full self-stretch min-h-[44px]',
                  thread.isPinned   ? 'bg-amber-400'
                  : thread.isResolved ? 'bg-green-400'
                  : 'bg-gray-200 group-hover:bg-primary-400 transition-colors'
                )} />

                <div className="flex-1 min-w-0">
                  {/* Title + badges */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors leading-snug">
                      {thread.title}
                    </h3>
                    <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      {thread.isPinned   && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">📌 Pinned</span>}
                      {thread.isResolved && <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">✅ Resolved</span>}
                      {thread.isClosed   && <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">🔒 Closed</span>}
                    </div>
                  </div>

                  {/* Body preview */}
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2 leading-relaxed">{thread.body}</p>

                  {/* Tags */}
                  {thread.tags && thread.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {thread.tags.slice(0, 5).map(tag => (
                        <span key={tag} className="text-[10px] bg-primary-50 text-primary-600 border border-primary-100 px-1.5 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                    <span className={cn('font-semibold', thread.authorRole !== 'student' ? 'text-primary-600' : 'text-gray-600')}>
                      {thread.authorName}
                    </span>
                    {thread.authorRole !== 'student' && (
                      <span className="bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide">
                        {thread.authorRole === 'tenant_admin' ? 'Admin' : 'Instructor'}
                      </span>
                    )}
                    <span>{timeAgo(thread.createdAt)}</span>
                    <span className="flex items-center gap-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      {thread.replyCount}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {thread.views}
                    </span>
                    {thread.likeCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                        </svg>
                        {thread.likeCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">New Thread</h3>
              <button onClick={resetCreate}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {createError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{createError}</p>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="What's your question or topic?"
                  maxLength={200}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Details <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={5}
                  value={newBody}
                  onChange={e => setNewBody(e.target.value)}
                  placeholder="Describe your question or start a discussion…"
                  maxLength={5000}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
                <p className="text-[11px] text-gray-400 text-right mt-0.5">{newBody.length}/5000</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Tags <span className="text-gray-400 font-normal">(optional, comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={newTags}
                  onChange={e => setNewTags(e.target.value)}
                  placeholder="e.g. python, beginner, homework"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <Button variant="outline" onClick={resetCreate}>Cancel</Button>
              <Button
                loading={createMutation.isPending}
                disabled={!newTitle.trim() || !newBody.trim()}
                onClick={() => createMutation.mutate()}
              >
                Post Thread
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
