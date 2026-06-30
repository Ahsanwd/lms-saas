'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, type ImpersonatedTenant } from '@/stores/auth.store';
import { getInitials } from '@/lib/utils';
import api from '@/lib/api';
import type { User } from '@/types';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { connectSocket } from '@/lib/socket';

interface HeaderProps {
  user: User;
  onMenuToggle?: () => void;
}

// ─── Tenant Selector (super_admin only) ──────────────────────────────────────

interface TenantOption {
  _id: string;
  name: string;
  subdomain: string;
  status: string;
}

function TenantSelector() {
  const { impersonation, setImpersonation, clearImpersonation } = useAuthStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Fetch tenant list (cached)
  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants-list'],
    queryFn: async () => {
      const res = await api.get('/admin/tenants', { params: { limit: 100 } });
      return res.data.data.tenants as TenantOption[];
    },
    staleTime: 60_000, // refresh every minute
  });

  const tenants = (data ?? []).filter((t) => t.status !== 'deleted');
  const filtered = search.trim()
    ? tenants.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.subdomain.toLowerCase().includes(search.toLowerCase())
      )
    : tenants;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function selectTenant(t: TenantOption) {
    const tenant: ImpersonatedTenant = { _id: t._id, name: t.name, subdomain: t.subdomain };
    setImpersonation(tenant);
    // Invalidate all cached queries so they re-fetch under the new tenant context
    queryClient.clear();
    setOpen(false);
    setSearch('');
  }

  function exitImpersonation() {
    clearImpersonation();
    // Clear cache so super_admin views reload without tenant context
    queryClient.clear();
  }

  // ── Active impersonation banner ──
  if (impersonation) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" />
          <span className="text-xs font-medium text-amber-800 whitespace-nowrap">
            Viewing:
          </span>
          <span className="text-xs font-semibold text-amber-900 max-w-[160px] truncate">
            {impersonation.name}
          </span>
          <span className="text-[10px] text-amber-600 font-mono bg-amber-100 px-1.5 py-0.5 rounded">
            {impersonation.subdomain}
          </span>
          <button
            onClick={exitImpersonation}
            title="Exit tenant view"
            className="ml-1 text-amber-600 hover:text-amber-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Tenant picker dropdown ──
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-8 px-3 border border-gray-200 rounded-lg text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <span className="hidden sm:inline whitespace-nowrap">View as tenant</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tenants..."
                  className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-64 overflow-y-auto py-1">
              {isLoading ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">Loading tenants…</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  {search ? 'No tenants match your search.' : 'No tenants found.'}
                </div>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t._id}
                    onClick={() => selectTenant(t)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                      <p className="text-xs text-gray-400 font-mono truncate">{t.subdomain}</p>
                    </div>
                    {t.status !== 'active' && (
                      <span className="ml-auto text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded flex-shrink-0">
                        {t.status}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
              <p className="text-[10px] text-gray-400">
                Select a tenant to browse their data as super admin.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────

function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { isSupported, isSubscribed, permission, isLoading: pushLoading, subscribe, unsubscribe } = usePushSubscription();

  // Poll unread count every 60 seconds — a fallback safety net; the socket
  // listener below delivers updates in real time when connected.
  const { data: countData } = useQuery({
    queryKey: ['notif-count'],
    queryFn: async () => {
      const { data } = await api.get('/notifications/unread-count');
      return data.data as { count: number };
    },
    refetchInterval: 60_000,
    staleTime: 10_000,
  });

  // Real-time push: increment count + invalidate list as soon as a new
  // notification is created server-side (see services/socket/io.js emitNotificationNew)
  useEffect(() => {
    const socket = connectSocket();
    function handleNew() {
      queryClient.setQueryData<{ count: number }>(['notif-count'], (old) => ({ count: (old?.count ?? 0) + 1 }));
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    socket.on('notification:new', handleNew);
    return () => { socket.off('notification:new', handleNew); };
  }, [queryClient]);

  // Fetch full list when panel opens
  const { data: listData, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications?limit=20');
      return data.data as {
        notifications: Array<{
          _id: string;
          type: string;
          title: string;
          message: string;
          link: string | null;
          isRead: boolean;
          createdAt: string;
        }>;
        unreadCount: number;
      };
    },
    enabled: open,
    staleTime: 0,
  });

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unread = countData?.count ?? 0;
  const notifications = listData?.notifications ?? [];

  async function handleClick(n: typeof notifications[0]) {
    // Mark as read
    await api.patch(`/notifications/${n._id}/read`).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    await api.patch('/notifications/read-all').catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['notif-count'] });
    refetch();
  }

  const ICON: Record<string, string> = {
    enrollment:            '🎓',
    waitlist_promoted:     '🎉',
    enrollment_approved:   '✅',
    enrollment_rejected:   '❌',
    assignment_graded:     '📝',
    assignment_due:        '⏰',
    assignment_published:  '📘',
    announcement:          '📢',
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
  };

  function timeAgo(date: string) {
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  return (
    <div className="relative" ref={bellRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-20 overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                {unread > 0 && (
                  <span className="text-xs bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded-full">{unread} new</span>
                )}
              </div>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <p className="text-sm font-medium text-gray-500">No notifications yet</p>
                  <p className="text-xs text-gray-400 mt-1">We'll notify you when something happens</p>
                </div>
              ) : (
                notifications.map(n => (
                  <button
                    key={n._id}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${!n.isRead ? 'bg-primary-50/40' : ''}`}
                  >
                    <span className="text-lg flex-shrink-0 mt-0.5">{ICON[n.type] ?? '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-snug ${!n.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {n.title}
                        </p>
                        {!n.isRead && <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-1" />}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 bg-gray-50">
              {notifications.length > 0 && (
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <button
                    onClick={() => { setOpen(false); router.push('/notifications'); }}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium w-full text-center"
                  >
                    View all notifications
                  </button>
                </div>
              )}

              {/* Browser push toggle */}
              {isSupported && permission !== 'denied' && (
                <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" />
                    </svg>
                    <span className="text-[11px] text-gray-500 truncate">
                      Browser notifications
                    </span>
                  </div>
                  <button
                    onClick={isSubscribed ? unsubscribe : subscribe}
                    disabled={pushLoading}
                    className={`flex-shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                      isSubscribed ? 'bg-primary-500' : 'bg-gray-200'
                    } ${pushLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    title={isSubscribed ? 'Disable browser push notifications' : 'Enable browser push notifications'}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      isSubscribed ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Search Button ────────────────────────────────────────────────────────────

function SearchButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push('/search')}
      title="Search (Ctrl+K)"
      className="flex items-center gap-2 h-8 px-3 border border-gray-200 rounded-lg text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <span className="hidden md:inline text-xs">Search…</span>
      <kbd className="hidden lg:inline text-[10px] bg-gray-100 border border-gray-200 rounded px-1 py-0.5 text-gray-400">⌘K</kbd>
    </button>
  );
}

// ─── Main Header ──────────────────────────────────────────────────────────────

export function Header({ user, onMenuToggle }: HeaderProps) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);

  const isSuperAdmin = user.role === 'super_admin';

  // Ctrl+K / Cmd+K global search shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        router.push('/search');
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
      {/* Left — hamburger (mobile) + tenant selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {isSuperAdmin && <TenantSelector />}
      </div>

      {/* Right — search + theme + notifications + user */}
      <div className="flex items-center gap-2">
        <SearchButton />
        <ThemeToggle />
        {!isSuperAdmin && <NotificationBell />}

        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-semibold flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {getInitials(`${user.firstName} ${user.lastName}`)}
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20">
                <div className="px-4 py-2 border-b border-gray-50">
                  <p className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{user.role.replace('_', ' ')}</p>
                </div>
                {!isSuperAdmin && (
                  <button
                    onClick={() => { setOpen(false); router.push('/settings'); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Settings
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
