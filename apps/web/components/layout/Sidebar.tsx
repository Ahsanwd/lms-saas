'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import type { Role } from '@/types';

interface NavLeaf {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
  badge?: 'notif-count' | 'chat-count';
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

const BookIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);
const GridIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);
const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);
const ShareIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
);
const CreditCardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);
const BuildingIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);
const MediaIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const QuizIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);
const GraduationCapIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M12 14l9-5-9-5-9 5 9 5z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);
const AssignmentIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h4" />
  </svg>
);
const ChatIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);
const MegaphoneIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
  </svg>
);
const CouponIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
  </svg>
);
const BundleIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const WebsiteIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 1018 0 9 9 0 00-18 0zm0 0h18M12 3a14.5 14.5 0 010 18M12 3a14.5 14.5 0 000 18" />
  </svg>
);
const MembershipIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9a2 2 0 10-4 0v5a2 2 0 01-2 2h6m-6-4h4m8 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>
);
const GroupIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const CohortIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
  </svg>
);
const CertBuilderIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
  </svg>
);
const BookmarkIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
  </svg>
);
const RefundIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
  </svg>
);
const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);
const MailIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const ClipboardCheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 9l2 2 4-4" />
  </svg>
);
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg className={cn('w-4 h-4 flex-shrink-0 text-gray-400 transition-transform duration-200', open && 'rotate-90')}
    fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const NAV_ENTRIES: NavEntry[] = [
  // ── Dashboard (standalone) ────────────────────────────────────────────────
  { href: '/dashboard',       label: 'Dashboard', icon: <GridIcon />, roles: ['tenant_admin', 'instructor', 'student'] },
  { href: '/admin/dashboard', label: 'Dashboard', icon: <GridIcon />, roles: ['super_admin'] },

  // ── Learning ───────────────────────────────────────────────────────────
  {
    key: 'learning', label: 'Learning', icon: <GraduationCapIcon />,
    items: [
      { href: '/courses',             label: 'Courses',      icon: <BookIcon />,          roles: ['tenant_admin', 'instructor', 'student'] },
      { href: '/my-learning',         label: 'My Learning',  icon: <GraduationCapIcon />, roles: ['student'] },
      { href: '/assignments',         label: 'Assignments',  icon: <AssignmentIcon />,    roles: ['tenant_admin', 'instructor', 'student'] },
      { href: '/quizzes',             label: 'Quizzes',      icon: <QuizIcon />,          roles: ['tenant_admin', 'instructor', 'student'] },
      { href: '/certificates',        label: 'Certificates', icon: <CertBuilderIcon />,   roles: ['student'] },
      { href: '/certificate-builder', label: 'Certificates', icon: <CertBuilderIcon />,   roles: ['tenant_admin'] },
    ],
  },

  // ── Monetization ───────────────────────────────────────────────────────
  {
    key: 'monetization', label: 'Monetization', icon: <CreditCardIcon />,
    items: [
      { href: '/bundles',          label: 'Bundles',          icon: <BundleIcon />,     roles: ['tenant_admin', 'instructor', 'student'] },
      { href: '/coupons',          label: 'Coupons',          icon: <CouponIcon />,     roles: ['tenant_admin'] },
      { href: '/membership-plans', label: 'Membership Plans', icon: <MembershipIcon />, roles: ['tenant_admin'] },
      { href: '/website-builder',  label: 'Website Builder',  icon: <WebsiteIcon />,    roles: ['tenant_admin'] },
      { href: '/membership',       label: 'Membership',       icon: <MembershipIcon />, roles: ['student'] },
      { href: '/my-payments',      label: 'Payment History',  icon: <CreditCardIcon />, roles: ['student'] },
      { href: '/bookmarks',        label: 'Saved Courses',    icon: <BookmarkIcon />,   roles: ['student'] },
      { href: '/billing',          label: 'Billing',          icon: <CreditCardIcon />, roles: ['tenant_admin'] },
      { href: '/admin/billing',    label: 'Billing',          icon: <CreditCardIcon />, roles: ['super_admin'] },
      { href: '/admin/refunds',    label: 'Refund Requests',  icon: <RefundIcon />,     roles: ['tenant_admin'] },
    ],
  },

  // ── Engage ─────────────────────────────────────────────────────────────
  {
    key: 'engage', label: 'Engage', icon: <ChatIcon />,
    items: [
      { href: '/notifications', label: 'Notifications', icon: <BellIcon />,      roles: ['tenant_admin', 'instructor', 'student'], badge: 'notif-count' },
      { href: '/chat',          label: 'Chat',           icon: <ChatIcon />,      roles: ['tenant_admin', 'instructor', 'student'], badge: 'chat-count' },
      { href: '/announcements', label: 'Announcements',  icon: <MegaphoneIcon />, roles: ['tenant_admin', 'instructor', 'student'] },
      { href: '/contact-submissions', label: 'Contact Submissions', icon: <MailIcon />, roles: ['tenant_admin'] },
      { href: '/course-applications', label: 'Course Applications', icon: <ClipboardCheckIcon />, roles: ['tenant_admin'] },
      { href: '/groups',        label: 'Groups',         icon: <GroupIcon />,     roles: ['tenant_admin'] },
      { href: '/cohorts',       label: 'Cohorts',        icon: <CohortIcon />,    roles: ['tenant_admin'] },
    ],
  },

  // ── Insights ───────────────────────────────────────────────────────────
  {
    key: 'insights', label: 'Insights', icon: <ChartIcon />,
    items: [
      { href: '/analytics',   label: 'Analytics',   icon: <ChartIcon />, roles: ['tenant_admin', 'instructor'] },
      { href: '/share-links', label: 'Share Links', icon: <ShareIcon />, roles: ['tenant_admin', 'instructor'] },
    ],
  },

  // ── Admin ──────────────────────────────────────────────────────────────
  {
    key: 'admin', label: 'Admin', icon: <UsersIcon />,
    items: [
      { href: '/users',         label: 'Users',   icon: <UsersIcon />,    roles: ['tenant_admin'] },
      { href: '/media',         label: 'Media Library', icon: <MediaIcon />, roles: ['tenant_admin', 'instructor'] },
      { href: '/admin/tenants', label: 'Tenants', icon: <BuildingIcon />, roles: ['super_admin'] },
    ],
  },

  // ── Settings (standalone, bottom) ───────────────────────────────────────
  { href: '/settings', label: 'Settings', icon: <SettingsIcon />, roles: ['tenant_admin', 'instructor', 'student'] },
];

interface SidebarProps {
  role: Role;
  tenantName?: string;
  logoUrl?: string;
  isOpen?: boolean;
  onClose?: () => void;
  /**
   * When a super_admin is impersonating a tenant, pass 'tenant_admin' here so
   * the sidebar shows tenant nav items instead of the super admin nav items.
   */
  effectiveRole?: Role;
}

export function Sidebar({ role, tenantName, logoUrl, isOpen = false, onClose, effectiveRole }: SidebarProps) {
  const pathname = usePathname();
  const navRole  = effectiveRole ?? role;
  const queryClient = useQueryClient();

  const isImpersonating = !!effectiveRole && effectiveRole !== role;

  // Filter by role — a group only survives if at least one of its children does,
  // so e.g. a student never sees an empty "Admin" section header.
  const entries: NavEntry[] = NAV_ENTRIES.reduce<NavEntry[]>((acc, entry) => {
    if (isGroup(entry)) {
      const visibleItems = entry.items.filter((i) => i.roles.includes(navRole));
      if (visibleItems.length > 0) acc.push({ ...entry, items: visibleItems });
    } else if (entry.roles.includes(navRole)) {
      acc.push(entry);
    }
    return acc;
  }, []);

  const isActiveHref = (href: string) => pathname === href || pathname.startsWith(href + '/');

  // Accordion — only one group open at a time. Starts on whichever group
  // contains the current route, so opening a different group auto-closes it.
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    for (const entry of entries) {
      if (isGroup(entry) && entry.items.some((i) => isActiveHref(i.href))) return entry.key;
    }
    return null;
  });

  const toggleGroup = (key: string) => {
    setOpenGroup((prev) => (prev === key ? null : key));
  };

  const { data: countData } = useQuery({
    queryKey: ['notif-count'],
    queryFn: async () => {
      const { data } = await api.get('/notifications/unread-count');
      return data.data as { count: number };
    },
    enabled: role !== 'super_admin',
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const unreadCount = countData?.count ?? 0;

  const { data: chatCountData } = useQuery({
    queryKey: ['chat-unread'],
    queryFn: async () => {
      const { data } = await api.get('/chat/unread-count');
      return data.data as { count: number };
    },
    enabled: role !== 'super_admin',
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const chatUnreadCount = chatCountData?.count ?? 0;

  const getBadgeCount = (item: NavLeaf) =>
    item.badge === 'notif-count' ? unreadCount : item.badge === 'chat-count' ? chatUnreadCount : 0;

  const renderLeaf = (item: NavLeaf, nested = false) => {
    const active = isActiveHref(item.href);
    const badgeCount = getBadgeCount(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          nested && 'pl-9',
          active
            ? 'bg-primary-50 text-primary-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        <span className={cn(active ? 'text-primary-600' : 'text-gray-400')}>
          {item.icon}
        </span>
        <span className="flex-1">{item.label}</span>
        {badgeCount > 0 && (
          <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Link>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const open = openGroup === group.key;
    const hasActive = group.items.some((i) => isActiveHref(i.href));
    const hasBadge = group.items.some((i) => getBadgeCount(i) > 0);
    return (
      <div key={group.key}>
        <button
          type="button"
          onClick={() => toggleGroup(group.key)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            hasActive ? 'text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )}
        >
          <span className={cn(hasActive ? 'text-primary-600' : 'text-gray-400')}>{group.icon}</span>
          <span className="flex-1 text-left">{group.label}</span>
          {!open && hasBadge && <span className="w-2 h-2 rounded-full bg-red-500" />}
          <ChevronIcon open={open} />
        </button>
        {open && (
          <div className="mt-0.5 space-y-0.5">
            {group.items.map((item) => renderLeaf(item, true))}
          </div>
        )}
      </div>
    );
  };

  // Real-time: bump the chat badge the instant a message arrives, instead of
  // waiting on the 30s poll (see chat.service.js sendMessage -> chat_notification)
  useEffect(() => {
    if (role === 'super_admin') return;
    const socket = connectSocket();
    function handleChatNotification() {
      queryClient.invalidateQueries({ queryKey: ['chat-unread'] });
    }
    socket.on('chat_notification', handleChatNotification);
    return () => { socket.off('chat_notification', handleChatNotification); };
  }, [role, queryClient]);

  const asideCls = [
    'w-64 h-full bg-white border-r border-gray-200 flex flex-col flex-shrink-0',
    'fixed inset-y-0 left-0 z-50 transition-transform duration-200',
    'lg:relative lg:translate-x-0',
    isOpen ? 'translate-x-0' : '-translate-x-full',
  ].join(' ');

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside className={asideCls}>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className={`w-8 h-8 rounded-lg object-contain bg-white border ${isImpersonating ? 'border-amber-200' : 'border-gray-100'}`}
            />
          ) : (
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isImpersonating ? 'bg-amber-500' : 'bg-primary-600'}`}>
              <BookIcon />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {tenantName ?? 'LMS Platform'}
            </p>
            <p className="text-xs capitalize" style={{ color: isImpersonating ? '#d97706' : '#9ca3af' }}>
              {isImpersonating ? `Viewing as admin` : role.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {entries.map((entry, idx) => (
          <div key={isGroup(entry) ? entry.key : entry.href}>
            {idx === entries.length - 1 && entries.length > 1 && (
              <div className="my-2 border-t border-gray-100" />
            )}
            {isGroup(entry) ? renderGroup(entry) : renderLeaf(entry)}
          </div>
        ))}
      </nav>
    </aside>
    </>
  );
}
