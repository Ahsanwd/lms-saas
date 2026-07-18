'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotifData {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

interface TypePref { email: boolean; push: boolean; }
interface Preferences { [type: string]: TypePref; }

interface FailedEmail {
  _id: string;
  to: string;
  subject: string;
  errorMessage: string;
  attemptsMade: number;
  failedAt: string;
}

interface NotifGroup {
  type: string;
  count: number;
  unreadCount: number;
  latestTitle: string;
  latestMessage: string;
  latestLink: string | null;
  latestCreatedAt: string;
  latestId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON: Record<string, string> = {
  enrollment:            '🎓',
  waitlist_promoted:     '🎉',
  enrollment_approved:   '✅',
  enrollment_rejected:   '❌',
  assignment_graded:     '📝',
  assignment_due:        '⏰',
  assignment_published:  '📘',
  announcement:          '📢',
  group_announcement:    '📣',
  course_published:      '🆕',
  course_completed:      '🏆',
  certificate_issued:    '🏅',
  trial_expiring:        '⚠️',
  chat_message:          '💬',
  forum_reply:           '🗨️',
  quiz_graded:           '📊',
  quiz_published:        '🧪',
  refund_approved:       '💚',
  refund_rejected:       '🔴',
  live_session_reminder: '🎥',
  discussion_comment:    '💭',
  discussion_reply:      '↩️',
  email_delivery_failed: '📭',
  contact_submission:    '✉️',
  course_application:    '🙋',
};

const PREF_LABELS: { type: string; label: string; hasEmail: boolean }[] = [
  { type: 'enrollment',             label: 'Course enrollment',         hasEmail: true  },
  { type: 'enrollment_approved',    label: 'Enrollment approved',       hasEmail: true  },
  { type: 'enrollment_rejected',    label: 'Enrollment rejected',       hasEmail: true  },
  { type: 'announcement',           label: 'Announcements',             hasEmail: true  },
  { type: 'assignment_graded',      label: 'Assignment graded',         hasEmail: true  },
  { type: 'assignment_due',         label: 'Assignment due reminder',   hasEmail: false },
  { type: 'assignment_published',   label: 'New assignment posted',     hasEmail: false },
  { type: 'course_published',       label: 'New course available',      hasEmail: false },
  { type: 'course_completed',       label: 'Course completed',          hasEmail: true  },
  { type: 'certificate_issued',     label: 'Certificate issued',        hasEmail: true  },
  { type: 'quiz_graded',            label: 'Quiz graded',               hasEmail: true  },
  { type: 'quiz_published',        label: 'New quiz posted',           hasEmail: false },
  { type: 'chat_message',           label: 'Chat messages',             hasEmail: true  },
  { type: 'forum_reply',            label: 'Forum replies',             hasEmail: false },
  { type: 'discussion_comment',     label: 'New discussion questions',  hasEmail: true  },
  { type: 'discussion_reply',       label: 'Discussion replies',        hasEmail: true  },
  { type: 'live_session_reminder',  label: 'Live class reminders',      hasEmail: true  },
  { type: 'refund_approved',        label: 'Refund approved',           hasEmail: true  },
  { type: 'refund_rejected',        label: 'Refund rejected',           hasEmail: true  },
  { type: 'trial_expiring',         label: 'Trial expiring soon',       hasEmail: true  },
  { type: 'email_delivery_failed',  label: 'Email delivery failures',   hasEmail: false },
];

const LIMIT = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotifRow({
  n,
  onRead,
  onDelete,
  onClick,
}: {
  n: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (n: Notification) => void;
}) {
  return (
    <div className={cn('flex items-start gap-4 px-6 py-4 group transition-colors hover:bg-gray-50', !n.isRead && 'bg-primary-50/30')}>
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg mt-0.5">
        {ICON[n.type] ?? '🔔'}
      </div>
      <button className="flex-1 min-w-0 text-left" onClick={() => onClick(n)}>
        <div className="flex items-start gap-2">
          <p className={cn('text-sm leading-snug flex-1', !n.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>
            {n.title}
          </p>
          {!n.isRead && <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-1.5" />}
        </div>
        <p className="text-sm text-gray-500 mt-0.5 leading-snug">{n.message}</p>
        <p className="text-xs text-gray-400 mt-1.5">{timeAgo(n.createdAt)}</p>
      </button>
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity self-center">
        {!n.isRead && (
          <button
            onClick={() => onRead(n._id)}
            title="Mark as read"
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
        <button
          onClick={() => onDelete(n._id)}
          title="Delete"
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Preferences panel ────────────────────────────────────────────────────────

function PreferencesPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ preferences: Preferences }>({
    queryKey: ['notif-prefs'],
    queryFn: () => api.get('/notifications/preferences').then(r => r.data.data),
  });

  const prefs = data?.preferences ?? {};

  const saveMutation = useMutation({
    mutationFn: (updated: Preferences) => api.patch('/notifications/preferences', { preferences: updated }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-prefs'] }),
  });

  function toggle(type: string, channel: 'email' | 'push') {
    const current = prefs[type]?.[channel] !== false;
    const updated = {
      ...prefs,
      [type]: { ...(prefs[type] ?? { email: true, push: true }), [channel]: !current },
    };
    saveMutation.mutate(updated);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Notification Preferences</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : (
        <div className="divide-y divide-gray-100">
          <div className="grid grid-cols-[1fr_80px_80px] px-6 py-2 bg-gray-50">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notification type</span>
            <span className="text-xs font-medium text-gray-500 text-center uppercase tracking-wide">Email</span>
            <span className="text-xs font-medium text-gray-500 text-center uppercase tracking-wide">Push</span>
          </div>
          {PREF_LABELS.map(({ type, label, hasEmail }) => {
            const emailOn = prefs[type]?.email !== false;
            const pushOn  = prefs[type]?.push  !== false;
            return (
              <div key={type} className="grid grid-cols-[1fr_80px_80px] items-center px-6 py-3">
                <span className="text-sm text-gray-700">{label}</span>
                <div className="flex justify-center">
                  {hasEmail ? (
                    <button
                      onClick={() => toggle(type, 'email')}
                      className={cn('w-10 h-5 rounded-full relative transition-colors', emailOn ? 'bg-primary-500' : 'bg-gray-200')}
                    >
                      <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', emailOn && 'translate-x-5')} />
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={() => toggle(type, 'push')}
                    className={cn('w-10 h-5 rounded-full relative transition-colors', pushOn ? 'bg-primary-500' : 'bg-gray-200')}
                  >
                    <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', pushOn && 'translate-x-5')} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Failed emails tab ────────────────────────────────────────────────────────

function FailedEmailsPanel() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery<{ logs: FailedEmail[]; total: number; page: number; limit: number }>({
    queryKey: ['failed-emails', page],
    queryFn: () => api.get(`/notifications/failed-emails?page=${page}&limit=20`).then(r => r.data.data),
  });

  const logs       = data?.logs ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  if (!logs.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mb-4 text-2xl">✓</div>
        <p className="font-medium text-gray-900">No failed emails</p>
        <p className="text-sm text-gray-500 mt-1">All emails delivered successfully.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{total} failed email{total !== 1 ? 's' : ''} logged</p>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {logs.map(log => (
          <div key={log._id} className="px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{log.to}</p>
                <p className="text-sm text-gray-500 mt-0.5 truncate">{log.subject || '(no subject)'}</p>
                <p className="text-xs text-red-500 mt-1 line-clamp-1">{log.errorMessage}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs font-medium">
                  {log.attemptsMade} attempt{log.attemptsMade !== 1 ? 's' : ''}
                </span>
                <p className="text-xs text-gray-400 mt-1">{formatDate(log.failedAt)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Group card (server-side grouped view) ────────────────────────────────────

function GroupCard({
  group,
  expanded,
  items,
  onToggle,
  onRead,
  onDelete,
  onClick,
}: {
  group: NotifGroup;
  expanded: boolean;
  items?: Notification[];
  onToggle: () => void;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (n: Notification) => void;
}) {
  const label = PREF_LABELS.find(p => p.type === group.type)?.label ?? group.type;
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left border-b border-gray-100"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg flex-shrink-0">{ICON[group.type] ?? '🔔'}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{label}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{group.latestMessage} · {timeAgo(group.latestCreatedAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {group.unreadCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
              {group.unreadCount} unread
            </span>
          )}
          <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
            {group.count}
          </span>
          <svg
            className={cn('w-4 h-4 text-gray-400 transition-transform flex-shrink-0', expanded && 'rotate-180')}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        items
          ? items.map(n => (
              <NotifRow key={n._id} n={n} onRead={onRead} onDelete={onDelete} onClick={onClick} />
            ))
          : <div className="flex justify-center py-6"><Spinner size="sm" /></div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const user    = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'tenant_admin';

  type Tab = 'all' | 'unread' | 'failed';
  const [tab,               setTab]               = useState<Tab>('all');
  const [page,              setPage]              = useState(1);
  const [grouped,           setGrouped]           = useState(false);
  const [showPrefs,         setShowPrefs]         = useState(false);
  const [expanded,          setExpanded]          = useState<Set<string>>(new Set());
  const [expandedTypeItems, setExpandedTypeItems] = useState<Record<string, Notification[]>>({});

  const isListTab = tab === 'all' || tab === 'unread';

  // Flat paginated list — used when grouped=false
  const { data, isLoading } = useQuery<NotifData>({
    queryKey: ['notifications-page', tab, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(LIMIT), page: String(page),
        ...(tab === 'unread' ? { unreadOnly: 'true' } : {}),
      });
      return api.get(`/notifications?${params}`).then(r => r.data.data);
    },
    staleTime: 0,
    enabled: isListTab && !grouped,
  });

  // Server-side grouped aggregation — used when grouped=true
  const { data: groupedData, isLoading: groupedLoading } = useQuery<{ groups: NotifGroup[]; totalUnread: number }>({
    queryKey: ['notifications-grouped'],
    queryFn: () => api.get('/notifications/grouped').then(r => r.data.data),
    staleTime: 0,
    enabled: isListTab && grouped,
  });

  const notifications = data?.notifications ?? [];
  const total         = data?.total ?? 0;
  const unreadCount   = grouped ? (groupedData?.totalUnread ?? 0) : (data?.unreadCount ?? 0);
  const totalPages    = Math.ceil(total / LIMIT);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['notifications-page'] });
    qc.invalidateQueries({ queryKey: ['notifications-grouped'] });
    qc.invalidateQueries({ queryKey: ['notif-count'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }

  const markRead    = useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),   onSuccess: invalidate });
  const markAllRead = useMutation({ mutationFn: () => api.patch('/notifications/read-all'),               onSuccess: invalidate });
  const remove      = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => { invalidate(); setExpandedTypeItems({}); },
  });

  async function handleClick(n: Notification) {
    if (!n.isRead) await markRead.mutateAsync(n._id).catch(() => {});
    if (n.link) router.push(n.link);
  }

  function toggleExpand(type: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  // Expand a group: lazy-load its items from the server on first open
  async function handleExpandGroup(type: string) {
    if (expanded.has(type)) { toggleExpand(type); return; }
    if (!expandedTypeItems[type]) {
      try {
        const res = await api.get(`/notifications?type=${encodeURIComponent(type)}&limit=50`);
        setExpandedTypeItems(prev => ({ ...prev, [type]: res.data.data.notifications }));
      } catch { /* non-critical */ }
    }
    toggleExpand(type);
  }

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && isListTab && (
            <Button variant="outline" size="sm" loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
              Mark all read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPrefs(v => !v)}
            className={cn(showPrefs && 'bg-gray-100')}
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Preferences
          </Button>
        </div>
      </div>

      {/* Preferences panel */}
      {showPrefs && <PreferencesPanel onClose={() => setShowPrefs(false)} />}

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {(['all', 'unread'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setTab(f); setPage(1); }}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
                tab === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {f}
              {f === 'unread' && unreadCount > 0 && (
                <span className={cn(
                  'ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
                  tab === f ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-500'
                )}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => { setTab('failed'); setPage(1); }}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                tab === 'failed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Failed Emails
            </button>
          )}
        </div>

        {isListTab && (
          <button
            onClick={() => { setGrouped(v => !v); setExpanded(new Set()); setExpandedTypeItems({}); }}
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
              grouped ? 'bg-primary-50 border-primary-300 text-primary-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            {grouped ? 'Grouped' : 'Group by type'}
          </button>
        )}
      </div>

      {/* Failed emails tab */}
      {tab === 'failed' && <FailedEmailsPanel />}

      {/* Notification list */}
      {isListTab && (
        (isLoading && !grouped) || (groupedLoading && grouped) ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : (!grouped && notifications.length === 0) || (grouped && !groupedData?.groups?.length) ? (
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="font-medium text-gray-900">
              {tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {tab === 'unread' ? "You're all caught up!" : "We'll notify you when something happens."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {grouped
              ? (groupedData?.groups ?? []).map(g => (
                  <GroupCard
                    key={g.type}
                    group={g}
                    expanded={expanded.has(g.type)}
                    items={expandedTypeItems[g.type]}
                    onToggle={() => handleExpandGroup(g.type)}
                    onRead={id => markRead.mutate(id)}
                    onDelete={id => remove.mutate(id)}
                    onClick={handleClick}
                  />
                ))
              : notifications.map(n => (
                  <NotifRow key={n._id} n={n} onRead={id => markRead.mutate(id)} onDelete={id => remove.mutate(id)} onClick={handleClick} />
                ))
            }
          </div>
        )
      )}

      {/* Pagination — hidden in grouped mode (server returns all type groups at once) */}
      {isListTab && !grouped && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {page} of {totalPages} · {total} total</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
