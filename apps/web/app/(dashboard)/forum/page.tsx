'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

interface AdminThread {
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
  flagCount?: number;
  createdAt: string;
  courseId: { _id: string; title: string } | null;
}

interface FlaggedReply {
  _id: string;
  body: string;
  authorName: string;
  authorRole: 'student' | 'instructor' | 'tenant_admin';
  flagCount: number;
  createdAt: string;
  courseId: { _id: string; title: string } | null;
  threadId: { _id: string; title: string } | null;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ForumAdminPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab]           = useState<'threads' | 'flaggedReplies'>('threads');
  const [page, setPage]         = useState(1);
  const [courseFilter, setCourseFilter] = useState('');
  const [search, setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [repliesPage, setRepliesPage] = useState(1);

  const { data, isLoading, isError } = useQuery<{
    threads: AdminThread[];
    pagination: { page: number; pages: number; total: number };
  }>({
    queryKey: ['forum-admin', page, courseFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (courseFilter) params.set('courseId', courseFilter);
      const { data } = await api.get(`/forum/admin/threads?${params}`);
      return data.data;
    },
  });

  const { data: flaggedData, isLoading: flaggedLoading, isError: flaggedIsError } = useQuery<{
    replies: FlaggedReply[];
    pagination: { replies: { page: number; pages: number; total: number } };
  }>({
    queryKey: ['forum-admin-flagged-replies', repliesPage],
    queryFn: async () => {
      const { data } = await api.get(`/forum/admin/flagged?page=${repliesPage}&limit=20`);
      return data.data;
    },
  });

  const clearReplyFlagsMut = useMutation({
    mutationFn: (replyId: string) => api.delete(`/forum/replies/${replyId}/flags`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forum-admin-flagged-replies'] }),
  });

  const deleteReplyMut = useMutation({
    mutationFn: (replyId: string) => api.delete(`/forum/replies/${replyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forum-admin-flagged-replies'] }),
  });

  const flaggedReplies = flaggedData?.replies ?? [];

  // Derive unique courses from loaded threads for the filter dropdown
  const courseOptions = Array.from(
    new Map(
      (data?.threads ?? [])
        .filter(t => t.courseId)
        .map(t => [t.courseId!._id, t.courseId!.title])
    ).entries()
  );

  const filtered = (data?.threads ?? []).filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.authorName.toLowerCase().includes(search.toLowerCase())
  );

  const flagged = filtered.filter(t => (t.flagCount ?? 0) > 0).length;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forum</h1>
          <p className="text-sm text-gray-500 mt-0.5">Moderate all course discussion threads</p>
        </div>
        {flagged > 0 && (
          <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {flagged} flagged thread{flagged !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-2 border-b border-gray-200">
        <button onClick={() => setTab('threads')}
          className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'threads' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
          Threads
        </button>
        <button onClick={() => setTab('flaggedReplies')}
          className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'flaggedReplies' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
          Flagged Replies
          {(flaggedData?.pagination.replies.total ?? 0) > 0 && (
            <span className="ml-1.5 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">
              {flaggedData!.pagination.replies.total}
            </span>
          )}
        </button>
      </div>

      {tab === 'threads' && (
      <>
      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <form
          className="flex items-center gap-2 flex-1 min-w-[220px]"
          onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
        >
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search threads or authors…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <Button size="sm" type="submit">Search</Button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
              className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          )}
        </form>

        {/* Course filter */}
        {courseOptions.length > 0 && (
          <select
            value={courseFilter}
            onChange={e => { setCourseFilter(e.target.value); setPage(1); }}
            className="text-sm border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">All Courses</option>
            {courseOptions.map(([id, title]) => (
              <option key={id} value={id}>{title}</option>
            ))}
          </select>
        )}

        {/* Stats */}
        {data && (
          <div className="ml-auto flex items-center text-xs text-gray-400 self-center">
            {data.pagination.total} thread{data.pagination.total !== 1 ? 's' : ''} total
          </div>
        )}
      </div>

      {/* ── Thread list ── */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : isError ? (
        <div className="text-center py-12 bg-red-50 rounded-2xl border border-red-100">
          <p className="text-sm text-red-500 font-medium">Failed to load forum threads. Please try again.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-700 mb-1">No threads found</p>
          <p className="text-sm text-gray-400">
            {search || courseFilter ? 'Try adjusting your filters.' : 'Students will post here once they enroll in courses.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(thread => (
            <button
              key={thread._id}
              onClick={() =>
                thread.courseId
                  ? router.push(`/courses/${thread.courseId._id}/forum/${thread._id}`)
                  : undefined
              }
              className="w-full text-left bg-white border border-gray-200 hover:border-primary-300 hover:shadow-sm rounded-xl p-4 transition-all group"
            >
              <div className="flex gap-3.5">
                {/* Status bar */}
                <div className={cn(
                  'w-1 flex-shrink-0 rounded-full self-stretch min-h-[44px]',
                  (thread.flagCount ?? 0) > 0 ? 'bg-red-400'
                  : thread.isPinned          ? 'bg-amber-400'
                  : thread.isResolved        ? 'bg-green-400'
                  : 'bg-gray-200 group-hover:bg-primary-400 transition-colors'
                )} />

                <div className="flex-1 min-w-0">
                  {/* Course name */}
                  {thread.courseId && (
                    <p className="text-[10px] font-semibold text-primary-600 uppercase tracking-wide mb-0.5">
                      {thread.courseId.title}
                    </p>
                  )}

                  {/* Title + badges */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors leading-snug">
                      {thread.title}
                    </h3>
                    <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      {(thread.flagCount ?? 0) > 0 && (
                        <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                          🚩 {thread.flagCount} flag{thread.flagCount !== 1 ? 's' : ''}
                        </span>
                      )}
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
      </>
      )}

      {/* ── Flagged Replies tab ── */}
      {tab === 'flaggedReplies' && (
        <>
          {flaggedLoading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : flaggedIsError ? (
            <div className="text-center py-12 bg-red-50 rounded-2xl border border-red-100">
              <p className="text-sm text-red-500 font-medium">Failed to load flagged replies. Please try again.</p>
            </div>
          ) : flaggedReplies.length === 0 ? (
            <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-700 mb-1">No flagged replies</p>
              <p className="text-sm text-gray-400">Nothing needs moderation right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {flaggedReplies.map(reply => (
                <div key={reply._id} className="bg-white border border-red-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      {reply.courseId && (
                        <p className="text-[10px] font-semibold text-primary-600 uppercase tracking-wide mb-0.5">
                          {reply.courseId.title}
                        </p>
                      )}
                      {reply.threadId && (
                        <p className="text-xs text-gray-400 truncate">on: {reply.threadId.title}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                      🚩 {reply.flagCount} flag{reply.flagCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700 line-clamp-3 mb-3 leading-relaxed">{reply.body}</p>

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                      <span className={cn('font-semibold', reply.authorRole !== 'student' ? 'text-primary-600' : 'text-gray-600')}>
                        {reply.authorName}
                      </span>
                      <span>{timeAgo(reply.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {reply.courseId && reply.threadId && (
                        <button
                          onClick={() => router.push(`/courses/${reply.courseId!._id}/forum/${reply.threadId!._id}`)}
                          className="text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                        >
                          View in thread
                        </button>
                      )}
                      <button
                        onClick={() => clearReplyFlagsMut.mutate(reply._id)}
                        disabled={clearReplyFlagsMut.isPending}
                        className="text-gray-400 hover:text-gray-600 font-medium transition-colors"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => deleteReplyMut.mutate(reply._id)}
                        disabled={deleteReplyMut.isPending}
                        className="text-red-500 hover:text-red-700 font-semibold transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Pagination ── */}
          {flaggedData?.pagination.replies && flaggedData.pagination.replies.pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="sm" variant="outline" disabled={repliesPage === 1} onClick={() => setRepliesPage(p => p - 1)}>← Previous</Button>
              <span className="text-sm text-gray-500">{repliesPage} / {flaggedData.pagination.replies.pages}</span>
              <Button size="sm" variant="outline" disabled={repliesPage >= flaggedData.pagination.replies.pages} onClick={() => setRepliesPage(p => p + 1)}>Next →</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
