'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import { connectSocket, disconnectSocket } from '@/lib/socket';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThreadDetail {
  _id: string;
  courseId: string;
  authorId: string;
  authorName: string;
  authorRole: 'student' | 'instructor' | 'tenant_admin';
  title: string;
  body: string;
  tags: string[];
  isPinned: boolean;
  isResolved: boolean;
  isClosed: boolean;
  replyCount: number;
  views: number;
  likeCount: number;
  isLikedByMe: boolean;
  isSubscribed: boolean;
  flagCount: number;
  editedAt: string | null;
  createdAt: string;
}

interface Reply {
  _id: string;
  authorId: string;
  authorName: string;
  authorRole: 'student' | 'instructor' | 'tenant_admin';
  body: string;
  parentReplyId: string | null;
  likeCount: number;
  isLikedByMe: boolean;
  isAccepted: boolean;
  flagCount: number;
  editedAt: string | null;
  createdAt: string;
  children?: Reply[];
}

const FLAG_REASONS = [
  { value: 'spam',          label: 'Spam' },
  { value: 'offensive',     label: 'Offensive / Harmful' },
  { value: 'misinformation',label: 'Misinformation' },
  { value: 'other',         label: 'Other' },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const MOD_ROLES = ['instructor', 'tenant_admin'];

// ── ReplyCard ─────────────────────────────────────────────────────────────────

function ReplyCard({
  reply, threadAuthorId, isThreadClosed, currentUserId, currentUserRole,
  threadId, courseId, onRefresh, isNested = false,
}: {
  reply: Reply;
  threadAuthorId: string;
  isThreadClosed: boolean;
  currentUserId: string;
  currentUserRole: string;
  threadId: string;
  courseId: string;
  onRefresh: () => void;
  isNested?: boolean;
}) {
  const [editing, setEditing]       = useState(false);
  const [editBody, setEditBody]     = useState(reply.body);
  const [replying, setReplying]     = useState(false);
  const [replyBody, setReplyBody]   = useState('');
  const [flagging, setFlagging]     = useState(false);
  const [flagReason, setFlagReason] = useState<string>('spam');

  const isMod    = MOD_ROLES.includes(currentUserRole);
  const isOwner  = reply.authorId === currentUserId;
  const canEdit  = (isOwner || isMod) && !isThreadClosed;
  const canDelete = isOwner || isMod;
  const canAccept = (threadAuthorId === currentUserId || isMod) && !isNested;
  const canReply  = !isNested && !isThreadClosed;
  const canFlag   = !isOwner && !isMod;

  const mutOpts = { onSuccess: onRefresh };

  const editMut      = useMutation({ mutationFn: (b: string) => api.put(`/forum/replies/${reply._id}`, { body: b }), ...mutOpts });
  const deleteMut    = useMutation({ mutationFn: () => api.delete(`/forum/replies/${reply._id}`), ...mutOpts });
  const likeMut      = useMutation({ mutationFn: () => api.post(`/forum/replies/${reply._id}/like`), ...mutOpts });
  const acceptMut    = useMutation({ mutationFn: () => api.patch(`/forum/replies/${reply._id}/accept`), ...mutOpts });
  const flagMut      = useMutation({
    mutationFn: () => api.post(`/forum/replies/${reply._id}/flag`, { reason: flagReason }),
    onSuccess: () => { setFlagging(false); onRefresh(); },
  });
  const clearFlagMut = useMutation({ mutationFn: () => api.delete(`/forum/replies/${reply._id}/flags`), ...mutOpts });
  const replyMut     = useMutation({
    mutationFn: (b: string) => api.post(`/forum/threads/${threadId}/replies`, { body: b, parentReplyId: reply._id }),
    ...mutOpts,
  });

  function submitEdit() {
    if (!editBody.trim()) return;
    editMut.mutate(editBody.trim(), { onSuccess: () => { setEditing(false); onRefresh(); } });
  }

  function submitReply() {
    if (!replyBody.trim()) return;
    replyMut.mutate(replyBody.trim(), { onSuccess: () => { setReplyBody(''); setReplying(false); onRefresh(); } });
  }

  return (
    <div className={cn('flex gap-3', isNested && 'ml-10 mt-3')}>
      {/* Avatar */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
        reply.authorRole !== 'student' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
      )}>
        {reply.authorName.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="text-sm font-semibold text-gray-900">{reply.authorName}</span>
          {reply.authorRole !== 'student' && (
            <span className="text-[10px] font-bold bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
              {reply.authorRole === 'tenant_admin' ? 'Admin' : 'Instructor'}
            </span>
          )}
          {reply.isAccepted && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Accepted Answer
            </span>
          )}
          <span className="text-xs text-gray-400">{timeAgo(reply.createdAt)}</span>
          {reply.editedAt && <span className="text-xs text-gray-400 italic">(edited)</span>}
        </div>

        {/* Body / edit mode */}
        {editing ? (
          <div className="space-y-2">
            <textarea
              rows={3} value={editBody} onChange={e => setEditBody(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <div className="flex gap-2">
              <Button size="sm" loading={editMut.isPending} onClick={submitEdit}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setEditBody(reply.body); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{reply.body}</p>
        )}

        {/* Action row */}
        {!editing && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <button
              onClick={() => likeMut.mutate()}
              className={cn(
                'flex items-center gap-1 text-xs transition-colors',
                reply.isLikedByMe ? 'text-primary-600 font-semibold' : 'text-gray-400 hover:text-primary-500'
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
              </svg>
              {reply.likeCount > 0 && reply.likeCount}
            </button>

            {canReply && (
              <button onClick={() => setReplying(v => !v)} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                Reply
              </button>
            )}
            {canAccept && (
              <button
                onClick={() => acceptMut.mutate()}
                className={cn(
                  'flex items-center gap-1 text-xs transition-colors',
                  reply.isAccepted ? 'text-green-600 hover:text-gray-500' : 'text-gray-400 hover:text-green-600'
                )}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {reply.isAccepted ? 'Accepted' : 'Accept'}
              </button>
            )}
            {canEdit && (
              <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                Edit
              </button>
            )}
            {canDelete && (
              <button onClick={() => deleteMut.mutate()} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                {deleteMut.isPending ? '…' : 'Delete'}
              </button>
            )}
            {canFlag && (
              <button onClick={() => setFlagging(v => !v)} className="text-xs text-gray-400 hover:text-amber-500 transition-colors">
                {flagging ? 'Cancel' : 'Report'}
              </button>
            )}
            {isMod && reply.flagCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                🚩 {reply.flagCount} flag{reply.flagCount !== 1 ? 's' : ''}
                <button onClick={() => clearFlagMut.mutate()} className="text-gray-400 hover:text-gray-600 ml-1">
                  (dismiss)
                </button>
              </span>
            )}
          </div>
        )}

        {/* Flag reason picker */}
        {flagging && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <select value={flagReason} onChange={e => setFlagReason(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400">
              {FLAG_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button onClick={() => flagMut.mutate()}
              disabled={flagMut.isPending}
              className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded hover:bg-amber-100 transition-colors disabled:opacity-50">
              {flagMut.isPending ? 'Reporting…' : 'Submit Report'}
            </button>
          </div>
        )}

        {/* Reply input */}
        {replying && (
          <div className="mt-3 space-y-2">
            <textarea
              autoFocus rows={2} value={replyBody} onChange={e => setReplyBody(e.target.value)}
              placeholder="Write a reply…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <div className="flex gap-2">
              <Button size="sm" loading={replyMut.isPending} onClick={submitReply}>Post Reply</Button>
              <Button size="sm" variant="outline" onClick={() => { setReplying(false); setReplyBody(''); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Nested replies */}
        {!isNested && (reply.children ?? []).map(child => (
          <ReplyCard key={child._id} reply={child}
            threadAuthorId={threadAuthorId} isThreadClosed={isThreadClosed}
            currentUserId={currentUserId} currentUserRole={currentUserRole}
            threadId={threadId} courseId={courseId}
            onRefresh={onRefresh} isNested />
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ThreadDetailPage() {
  const params = useParams<{ id: string; threadId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const courseId  = params.id;
  const threadId  = params.threadId;

  const [replyBody,     setReplyBody]     = useState('');
  const [editingThread, setEditingThread] = useState(false);
  const [editTitle,     setEditTitle]     = useState('');
  const [editBody,      setEditBody]      = useState('');
  const [editTags,      setEditTags]      = useState('');
  const [flaggingThread, setFlaggingThread] = useState(false);
  const [threadFlagReason, setThreadFlagReason] = useState<string>('spam');
  const [notification, setNotification]   = useState<string | null>(null);

  const qKey = ['forum-thread', threadId];

  const { data, isLoading, isError } = useQuery<{ thread: ThreadDetail; replies: Reply[] }>({
    queryKey: qKey,
    queryFn: async () => {
      const { data } = await api.get(`/forum/threads/${threadId}`);
      return data.data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: qKey });

  const replyMut = useMutation({
    mutationFn: (b: string) => api.post(`/forum/threads/${threadId}/replies`, { body: b }),
    onSuccess: () => { setReplyBody(''); refresh(); },
  });

  const editThreadMut = useMutation({
    mutationFn: () => api.put(`/forum/threads/${threadId}`, {
      title: editTitle.trim(),
      body:  editBody.trim(),
      tags:  editTags.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: () => { setEditingThread(false); refresh(); },
  });

  const deleteThreadMut = useMutation({
    mutationFn: () => api.delete(`/forum/threads/${threadId}`),
    onSuccess: () => router.push(`/courses/${courseId}/forum`),
  });

  const pinMut          = useMutation({ mutationFn: () => api.patch(`/forum/threads/${threadId}/pin`),              onSuccess: refresh });
  const resolveMut      = useMutation({ mutationFn: () => api.patch(`/forum/threads/${threadId}/resolve`),          onSuccess: refresh });
  const closeMut        = useMutation({ mutationFn: () => api.patch(`/forum/threads/${threadId}/close`),            onSuccess: refresh });
  const likeMut         = useMutation({ mutationFn: () => api.post(`/forum/threads/${threadId}/like`),             onSuccess: refresh });
  const subscribeMut    = useMutation({ mutationFn: () => api.post(`/forum/threads/${threadId}/subscribe`),        onSuccess: refresh });
  const unsubscribeMut  = useMutation({ mutationFn: () => api.post(`/forum/threads/${threadId}/unsubscribe`),      onSuccess: refresh });
  const flagThreadMut   = useMutation({
    mutationFn: () => api.post(`/forum/threads/${threadId}/flag`, { reason: threadFlagReason }),
    onSuccess: () => { setFlaggingThread(false); refresh(); },
  });
  const clearThreadFlagsMut = useMutation({ mutationFn: () => api.delete(`/forum/threads/${threadId}/flags`), onSuccess: refresh });

  // Socket: in-app notification when someone replies to a subscribed thread
  useEffect(() => {
    const socket = connectSocket();
    socket.on('forum_notification', ({ threadId: tid, threadTitle }: { threadId: string; threadTitle: string; replyAuthorName: string; preview: string }) => {
      if (tid !== threadId) {
        setNotification(`New reply on "${threadTitle}"`);
        setTimeout(() => setNotification(null), 6000);
      }
      qc.invalidateQueries({ queryKey: qKey });
    });
    return () => { socket.off('forum_notification'); disconnectSocket(); };
  }, [threadId, qc, qKey]);

  if (!user) return null;

  if (isLoading) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-500 font-medium mb-4">Thread not found or you don't have access.</p>
        <Button variant="outline" onClick={() => router.push(`/courses/${courseId}/forum`)}>
          ← Back to Forum
        </Button>
      </div>
    );
  }

  const { thread, replies } = data;

  const isMod           = MOD_ROLES.includes(user.role);
  const isAuthor        = thread.authorId === user._id;
  const canEditThread   = (isAuthor || isMod) && !thread.isClosed;
  const canDeleteThread = isAuthor || isMod;
  const canModerate     = isMod;
  const canFlagThread   = !isAuthor && !isMod;

  function startEditThread() {
    setEditTitle(thread.title);
    setEditBody(thread.body);
    setEditTags((thread.tags ?? []).join(', '));
    setEditingThread(true);
  }

  function submitReply() {
    if (!replyBody.trim()) return;
    replyMut.mutate(replyBody.trim());
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

      {/* In-app notification banner */}
      {notification && (
        <div className="bg-primary-600 text-white px-4 py-2.5 rounded-xl flex items-center justify-between text-sm shadow">
          <span>🔔 {notification}</span>
          <button onClick={() => setNotification(null)} className="ml-4 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}

      {/* Back button */}
      <button
        onClick={() => router.push(`/courses/${courseId}/forum`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Forum
      </button>

      {/* Thread card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Thread header */}
        <div className="px-6 py-5 border-b border-gray-100">
          {editingThread ? (
            <div className="space-y-3">
              <input
                type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                maxLength={200}
              />
              <textarea
                rows={4} value={editBody} onChange={e => setEditBody(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                maxLength={5000}
              />
              <input
                type="text" value={editTags} onChange={e => setEditTags(e.target.value)}
                placeholder="Tags (comma-separated)"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="flex gap-2">
                <Button size="sm" loading={editThreadMut.isPending} onClick={() => editThreadMut.mutate()}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingThread(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {thread.isPinned   && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">📌 Pinned</span>}
                {thread.isResolved && <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full font-semibold">✅ Resolved</span>}
                {thread.isClosed   && <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full font-semibold">🔒 Closed</span>}
              </div>

              <h1 className="text-xl font-bold text-gray-900 leading-snug mb-3">{thread.title}</h1>

              {/* Tags */}
              {thread.tags && thread.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {thread.tags.map(tag => (
                    <span key={tag} className="text-[11px] bg-primary-50 text-primary-600 border border-primary-100 px-2.5 py-0.5 rounded-full font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Author meta */}
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                  thread.authorRole !== 'student' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
                )}>
                  {thread.authorName.charAt(0).toUpperCase()}
                </div>
                <span className={cn('font-semibold', thread.authorRole !== 'student' ? 'text-primary-700' : 'text-gray-700')}>
                  {thread.authorName}
                </span>
                {thread.authorRole !== 'student' && (
                  <span className="bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">
                    {thread.authorRole === 'tenant_admin' ? 'Admin' : 'Instructor'}
                  </span>
                )}
                <span>·</span>
                <span>{timeAgo(thread.createdAt)}</span>
                {thread.editedAt && <span className="italic">(edited)</span>}
                <span>·</span>
                <span>{thread.views} views</span>
                <span>·</span>
                <span>{thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}</span>
              </div>

              {/* Body */}
              <div className="prose prose-sm max-w-none">
                <p className="text-sm text-gray-700 leading-8 whitespace-pre-wrap">{thread.body}</p>
              </div>
            </>
          )}
        </div>

        {/* Thread actions */}
        {!editingThread && (
          <div className="px-6 py-3 bg-gray-50 flex items-center gap-4 border-b border-gray-100 flex-wrap">
            {/* Like */}
            <button
              onClick={() => likeMut.mutate()}
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium transition-colors px-2.5 py-1.5 rounded-lg',
                thread.isLikedByMe
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-primary-600'
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
              </svg>
              {thread.isLikedByMe ? 'Liked' : 'Like'} {thread.likeCount > 0 && `(${thread.likeCount})`}
            </button>

            {/* Owner actions */}
            {canEditThread && (
              <button onClick={startEditThread} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
                Edit
              </button>
            )}
            {canDeleteThread && (
              <button
                onClick={() => { if (confirm('Delete this thread?')) deleteThreadMut.mutate(); }}
                className="text-xs text-gray-500 hover:text-red-500 transition-colors"
              >
                Delete
              </button>
            )}

            {/* Subscribe / Unsubscribe */}
            <div className="h-4 w-px bg-gray-200 mx-1" />
            <button
              onClick={() => thread.isSubscribed ? unsubscribeMut.mutate() : subscribeMut.mutate()}
              disabled={subscribeMut.isPending || unsubscribeMut.isPending}
              className={cn(
                'flex items-center gap-1 text-xs transition-colors px-2 py-1 rounded',
                thread.isSubscribed ? 'text-primary-600 font-medium hover:text-gray-500' : 'text-gray-500 hover:text-primary-600'
              )}
            >
              {thread.isSubscribed ? '🔔 Subscribed' : '🔔 Subscribe'}
            </button>

            {/* Flag thread (non-author, non-mod) */}
            {canFlagThread && (
              <button onClick={() => setFlaggingThread(v => !v)}
                className="text-xs text-gray-400 hover:text-amber-500 transition-colors">
                {flaggingThread ? 'Cancel' : 'Report'}
              </button>
            )}

            {/* Mod: flag count + clear */}
            {canModerate && thread.flagCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                🚩 {thread.flagCount} flag{thread.flagCount !== 1 ? 's' : ''}
                <button onClick={() => clearThreadFlagsMut.mutate()} className="text-gray-400 hover:text-gray-600 ml-1">(dismiss)</button>
              </span>
            )}

            {/* Moderator actions */}
            {canModerate && (
              <>
                <div className="h-4 w-px bg-gray-200 mx-1" />
                <button onClick={() => pinMut.mutate()}
                  className={cn('text-xs transition-colors', thread.isPinned ? 'text-amber-600 hover:text-gray-500' : 'text-gray-500 hover:text-amber-600')}>
                  {thread.isPinned ? '📌 Unpin' : '📌 Pin'}
                </button>
                <button onClick={() => resolveMut.mutate()}
                  className={cn('text-xs transition-colors', thread.isResolved ? 'text-green-600 hover:text-gray-500' : 'text-gray-500 hover:text-green-600')}>
                  {thread.isResolved ? '✅ Unresolve' : '✅ Mark Resolved'}
                </button>
                <button onClick={() => closeMut.mutate()}
                  className={cn('text-xs transition-colors', thread.isClosed ? 'text-gray-700 hover:text-gray-500' : 'text-gray-500 hover:text-gray-700')}>
                  {thread.isClosed ? '🔓 Reopen' : '🔒 Close'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Thread flag reason picker */}
        {!editingThread && flaggingThread && (
          <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-amber-700 font-medium">Report reason:</span>
            <select value={threadFlagReason} onChange={e => setThreadFlagReason(e.target.value)}
              className="text-xs border border-amber-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
              {FLAG_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button onClick={() => flagThreadMut.mutate()} disabled={flagThreadMut.isPending}
              className="text-xs bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {flagThreadMut.isPending ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>
        )}

        {/* Replies section */}
        <div className="px-6 py-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            {replies.length > 0 ? `${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}` : 'No replies yet'}
          </h2>

          {replies.length > 0 && (
            <div className="space-y-5 mb-6">
              {/* Show accepted answers first */}
              {replies.filter(r => r.isAccepted).map(r => (
                <ReplyCard key={r._id} reply={r}
                  threadAuthorId={thread.authorId} isThreadClosed={thread.isClosed}
                  currentUserId={user._id} currentUserRole={user.role}
                  threadId={threadId} courseId={courseId}
                  onRefresh={refresh} />
              ))}
              {/* Then other replies */}
              {replies.filter(r => !r.isAccepted).map(r => (
                <ReplyCard key={r._id} reply={r}
                  threadAuthorId={thread.authorId} isThreadClosed={thread.isClosed}
                  currentUserId={user._id} currentUserRole={user.role}
                  threadId={threadId} courseId={courseId}
                  onRefresh={refresh} />
              ))}
            </div>
          )}

          {/* Reply composer */}
          {thread.isClosed ? (
            <div className="text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <p className="text-sm text-gray-400">🔒 This thread is closed. No new replies.</p>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Your Reply</p>
              <textarea
                rows={4} value={replyBody} onChange={e => setReplyBody(e.target.value)}
                placeholder="Share your answer or thoughts…"
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none bg-white"
                maxLength={3000}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">{replyBody.length}/3000</span>
                <Button
                  size="sm"
                  disabled={!replyBody.trim()}
                  loading={replyMut.isPending}
                  onClick={submitReply}
                >
                  Post Reply
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
