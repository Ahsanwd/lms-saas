'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface ForumThread {
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
  lastActivityAt?: string;
  createdAt: string;
}

export function forumTimeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Shared thread-list query — `limit` is part of the cache key so the full-page
// forum view (limit 20) and the embedded course-tab view (limit 15) never clobber
// each other's cached page for the same courseId/sort/page.
export function useForumThreads(courseId: string, sort: 'latest' | 'top' | 'unanswered', page: number, limit: number) {
  return useQuery<{ threads: ForumThread[]; pagination: { page: number; pages: number; total: number } }>({
    queryKey: ['forum-threads', courseId, sort, page, limit],
    queryFn: async () => {
      const { data } = await api.get(`/forum/courses/${courseId}/threads?sort=${sort}&page=${page}&limit=${limit}`);
      return data.data;
    },
  });
}

// `compact` switches between the full-page card (status bar, used by the standalone
// /courses/[id]/forum page) and the denser embedded-tab card (status dot, used by
// the Forum tab on the course detail page).
export function ThreadCard({ thread, onClick, compact = false }: { thread: ForumThread; onClick: () => void; compact?: boolean }) {
  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all p-4 group"
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-2 h-2 rounded-full mt-2 flex-shrink-0',
            thread.isPinned ? 'bg-amber-400' : thread.isResolved ? 'bg-green-400' : 'bg-gray-300'
          )} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1.5">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors line-clamp-2 flex-1">
                {thread.title}
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                {thread.isPinned   && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-medium">📌 Pinned</span>}
                {thread.isResolved && <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-1.5 py-0.5 rounded font-medium">✅ Resolved</span>}
                {thread.isClosed   && <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded font-medium">🔒 Closed</span>}
              </div>
            </div>
            <p className="text-xs text-gray-500 line-clamp-1 mb-2">{thread.body}</p>
            {thread.tags && thread.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {thread.tags.slice(0, 4).map(tag => (
                  <span key={tag} className="text-[10px] bg-primary-50 text-primary-600 border border-primary-100 px-1.5 py-0.5 rounded-full font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span className="flex items-center gap-1">
                <span className={cn('font-semibold', thread.authorRole === 'student' ? 'text-gray-600' : 'text-primary-600')}>
                  {thread.authorName}
                </span>
                {thread.authorRole !== 'student' && (
                  <span className="bg-primary-100 text-primary-700 px-1 py-0.5 rounded text-[9px] font-bold uppercase">
                    {thread.authorRole === 'tenant_admin' ? 'Admin' : 'Instructor'}
                  </span>
                )}
              </span>
              <span>·</span>
              <span>{forumTimeAgo(thread.createdAt)}</span>
              <span className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {thread.replyCount}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {thread.views}
                </span>
                {thread.likeCount > 0 && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                    {thread.likeCount}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 hover:border-primary-300 hover:shadow-sm rounded-xl p-4 transition-all group"
    >
      <div className="flex gap-3.5">
        <div className={cn(
          'w-1 flex-shrink-0 rounded-full self-stretch min-h-[44px]',
          thread.isPinned   ? 'bg-amber-400'
          : thread.isResolved ? 'bg-green-400'
          : 'bg-gray-200 group-hover:bg-primary-400 transition-colors'
        )} />

        <div className="flex-1 min-w-0">
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

          <p className="text-xs text-gray-500 line-clamp-2 mb-2 leading-relaxed">{thread.body}</p>

          {thread.tags && thread.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {thread.tags.slice(0, 5).map(tag => (
                <span key={tag} className="text-[10px] bg-primary-50 text-primary-600 border border-primary-100 px-1.5 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
            <span className={cn('font-semibold', thread.authorRole !== 'student' ? 'text-primary-600' : 'text-gray-600')}>
              {thread.authorName}
            </span>
            {thread.authorRole !== 'student' && (
              <span className="bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide">
                {thread.authorRole === 'tenant_admin' ? 'Admin' : 'Instructor'}
              </span>
            )}
            <span>{forumTimeAgo(thread.createdAt)}</span>
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
  );
}

export function CreateThreadModal({
  onClose, onCreate, title, setTitle, body, setBody, tags, setTags, error, isPending,
}: {
  onClose: () => void; onCreate: () => void;
  title: string; setTitle: (v: string) => void;
  body:  string; setBody:  (v: string) => void;
  tags:  string; setTags:  (v: string) => void;
  error: string; isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">New Thread</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">Title</label>
            <input
              autoFocus type="text" value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What's your question or topic?"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">Body</label>
            <textarea
              rows={5} value={body} onChange={e => setBody(e.target.value)}
              placeholder="Describe your question or thought in detail…"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              maxLength={5000}
            />
            <p className="text-[11px] text-gray-400 text-right mt-1">{body.length}/5000</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
              Tags <span className="font-normal text-gray-400">(optional, comma-separated)</span>
            </label>
            <input
              type="text" value={tags} onChange={e => setTags(e.target.value)}
              placeholder="e.g. question, help, week-3"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!title.trim() || !body.trim()} loading={isPending} onClick={onCreate}>
            Post Thread
          </Button>
        </div>
      </div>
    </div>
  );
}
