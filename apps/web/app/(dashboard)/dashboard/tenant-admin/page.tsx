'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge, Spinner } from '@/components/ui';

interface OnboardingChecklist {
  hasBranding: boolean;
  hasSmtp: boolean;
  hasCourses: boolean;
  hasInstructor: boolean;
  hasStudents: boolean;
  isComplete: boolean;
}

// ── Onboarding checklist card ──────────────────────────────────────────────────
function OnboardingChecklistCard({ checklist }: { checklist: OnboardingChecklist }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('onboarding_dismissed') === '1'; } catch { return false; }
  });

  if (dismissed || checklist.isComplete) return null;

  const steps = [
    {
      done: checklist.hasBranding,
      label: 'Upload your logo & set brand color',
      description: 'Make your platform feel like your own with a logo and primary color.',
      action: () => router.push('/settings'),
      cta: 'Customize',
    },
    {
      done: checklist.hasSmtp,
      label: 'Configure email (SMTP)',
      description: 'Send automated emails to students and instructors.',
      action: () => router.push('/settings'),
      cta: 'Set up SMTP',
    },
    {
      done: checklist.hasCourses,
      label: 'Create your first course',
      description: 'Build and publish a course for your students.',
      action: () => router.push('/courses/new'),
      cta: 'Create Course',
    },
    {
      done: checklist.hasInstructor,
      label: 'Add an instructor',
      description: 'Invite a teacher or co-instructor to create content.',
      action: () => router.push('/users'),
      cta: 'Invite Instructor',
    },
    {
      done: checklist.hasStudents,
      label: 'Enroll your first student',
      description: 'Add learners to your platform.',
      action: () => router.push('/users'),
      cta: 'Add Students',
    },
  ];

  const completedCount = steps.filter(s => s.done).length;

  return (
    <div className="bg-white border border-primary-200 rounded-xl p-5 relative">
      <button
        onClick={() => { localStorage.setItem('onboarding_dismissed', '1'); setDismissed(true); }}
        className="absolute top-3 right-3 text-gray-300 hover:text-gray-500 text-xl leading-none"
        title="Dismiss"
      >
        &times;
      </button>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm flex-shrink-0">
          {completedCount}/{steps.length}
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">Get started checklist</p>
          <p className="text-xs text-gray-500">Complete these steps to set up your platform.</p>
        </div>
      </div>
      <div className="space-y-3">
        {steps.map(step => (
          <div key={step.label} className="flex items-start gap-3">
            <div className={`w-5 h-5 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center border-2 transition-colors ${step.done ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
              {step.done && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{step.label}</p>
              {!step.done && <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>}
            </div>
            {!step.done && (
              <button
                onClick={step.action}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex-shrink-0 mt-0.5"
              >
                {step.cta} →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Management Tabs ────────────────────────────────────────────────────────────

type MgmtTab = 'learning' | 'communication' | 'people' | 'revenue';

const MGMT_TABS: Array<{ id: MgmtTab; label: string; icon: React.ReactNode }> = [
  {
    id: 'learning',
    label: 'Learning',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: 'people',
    label: 'People',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    id: 'revenue',
    label: 'Revenue',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  accent: string;       // bg + text for icon box
  stats?: Array<{ label: string; value: string | number }>;
  badge?: { text: string; color: string };
}

function SectionCard({ icon, title, description, href, accent, stats, badge }: SectionCardProps) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className="group w-full text-left bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-gray-300 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
          {icon}
        </div>
        {badge && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
            {badge.text}
          </span>
        )}
      </div>
      <p className="font-semibold text-gray-900 text-sm">{title}</p>
      <p className="text-xs text-gray-400 mt-0.5 mb-3 leading-relaxed">{description}</p>
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-5 mb-3">
          {stats.map(s => (
            <div key={s.label}>
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      <span className="text-xs font-semibold text-primary-600 group-hover:text-primary-700 group-hover:underline">
        Manage {title} →
      </span>
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ManagementTabs({ stats }: { stats: any }) {
  const [active, setActive] = useState<MgmtTab>('learning');

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100 overflow-x-auto">
        {MGMT_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex-shrink-0 ${
              active === tab.id
                ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* ── LEARNING ── */}
        {active === 'learning' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SectionCard
              href="/courses"
              title="Courses"
              description="Create and manage courses, sections, lessons, and videos."
              accent="bg-blue-100 text-blue-700"
              stats={[
                { label: 'Total',     value: stats?.courses?.total ?? 0 },
                { label: 'Published', value: stats?.courses?.published ?? 0 },
              ]}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              }
            />
            <SectionCard
              href="/quizzes"
              title="Quizzes"
              description="Build quizzes, grade essays, and track student performance."
              accent="bg-purple-100 text-purple-700"
              stats={[
                { label: 'Attempts', value: stats?.quizzes?.totalAttempts ?? 0 },
                { label: 'Avg Score', value: `${stats?.quizzes?.averageScore ?? 0}%` },
              ]}
              badge={
                (stats?.quizzes?.pendingGrades ?? 0) > 0
                  ? { text: `${stats.quizzes.pendingGrades} need grading`, color: 'bg-amber-100 text-amber-700' }
                  : undefined
              }
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              }
            />
            <SectionCard
              href="/assignments"
              title="Assignments"
              description="Manage student assignments, submissions, and grades."
              accent="bg-orange-100 text-orange-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
            />
            <SectionCard
              href="/certificates"
              title="Certificates"
              description="Design and issue course completion certificates to students."
              accent="bg-yellow-100 text-yellow-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              }
            />
            {/* Popular courses mini-list */}
            {(stats?.popularCourses?.length ?? 0) > 0 && (
              <div className="sm:col-span-2 xl:col-span-4 bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                <p className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Top Courses</p>
                {stats.popularCourses.slice(0, 4).map((c: { _id: string; title: string; enrollmentCount: number; rating?: { average: number } }) => (
                  <div key={c._id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{c.enrollmentCount} enrolled</p>
                    </div>
                    {c.rating?.average != null && (
                      <Badge variant="success">★ {c.rating.average.toFixed(1)}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── COMMUNICATION ── */}
        {active === 'communication' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SectionCard
              href="/courses"
              title="Forum"
              description="Course discussion boards — open any course to view or moderate its forum threads."
              accent="bg-teal-100 text-teal-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
              }
            />
            <SectionCard
              href="/announcements"
              title="Announcements"
              description="Broadcast important news and updates to all students and instructors."
              accent="bg-indigo-100 text-indigo-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              }
            />
            <SectionCard
              href="/notifications"
              title="Notifications"
              description="System-generated alerts for enrollments, grades, and platform events."
              accent="bg-pink-100 text-pink-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
            />
            <SectionCard
              href="/chat"
              title="Chat"
              description="Real-time direct messaging and group channels between users."
              accent="bg-sky-100 text-sky-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              }
            />
          </div>
        )}

        {/* ── PEOPLE ── */}
        {active === 'people' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <SectionCard
              href="/users"
              title="Users"
              description="Manage instructors and students — invite, assign roles, and view profiles."
              accent="bg-blue-100 text-blue-700"
              stats={[
                { label: 'Total',       value: stats?.users?.total ?? 0 },
                { label: 'Instructors', value: stats?.users?.instructors ?? 0 },
                { label: 'Students',    value: stats?.users?.students ?? 0 },
              ]}
              badge={
                (stats?.users?.newThisMonth ?? 0) > 0
                  ? { text: `+${stats.users.newThisMonth} this month`, color: 'bg-green-100 text-green-700' }
                  : undefined
              }
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              }
            />
            <SectionCard
              href="/groups"
              title="Groups"
              description="Organise students into groups for collaborative learning and assignments."
              accent="bg-violet-100 text-violet-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
            <SectionCard
              href="/cohorts"
              title="Cohorts"
              description="Bundle courses into structured learning cohorts with shared timelines."
              accent="bg-fuchsia-100 text-fuchsia-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              }
            />
          </div>
        )}

        {/* ── REVENUE ── */}
        {active === 'revenue' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SectionCard
              href="/billing"
              title="Billing"
              description="View your current subscription plan, invoices, and payment history."
              accent="bg-emerald-100 text-emerald-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              }
            />
            <SectionCard
              href="/coupons"
              title="Coupons"
              description="Create discount codes and promotional offers for courses and plans."
              accent="bg-rose-100 text-rose-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              }
            />
            <SectionCard
              href="/membership-plans"
              title="Membership Plans"
              description="Define subscription tiers with access rules, pricing, and benefits."
              accent="bg-amber-100 text-amber-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              }
            />
            <SectionCard
              href="/refunds"
              title="Refund Requests"
              description="Review and process student refund requests for courses and plans."
              accent="bg-red-100 text-red-700"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function TenantAdminDashboardPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: stats, isLoading, error, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['dashboard', 'tenant-admin'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/tenant-admin');
      return data.data.dashboard;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const { data: checklistData } = useQuery<OnboardingChecklist>({
    queryKey: ['dashboard', 'onboarding'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/onboarding-checklist');
      return data.data.checklist;
    },
    staleTime: 60_000,
  });

  // Instantly refresh when a new enrollment or billing change is pushed via socket
  useEffect(() => {
    const socket = connectSocket();
    function invalidate() {
      qc.invalidateQueries({ queryKey: ['dashboard', 'tenant-admin'] });
    }
    socket.on('dashboard:updated', invalidate);
    socket.on('billing:updated',   invalidate);
    return () => {
      socket.off('dashboard:updated', invalidate);
      socket.off('billing:updated',   invalidate);
      disconnectSocket();
    };
  }, [qc]);

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (error) return <div className="text-red-500 p-6">Failed to load dashboard.</div>;

  const totalEnrollments = (stats?.enrollments?.active ?? 0) + (stats?.enrollments?.completed ?? 0) + (stats?.enrollments?.dropped ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of your platform activity.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Updated {Math.round((Date.now() - dataUpdatedAt) / 1000)}s ago
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh stats"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <svg className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Onboarding checklist */}
      {checklistData && <OnboardingChecklistCard checklist={checklistData} />}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'New Course',     path: '/courses/new',  color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
          { label: 'Invite User',    path: '/users',        color: 'bg-green-50 text-green-700 hover:bg-green-100' },
          { label: 'Billing',        path: '/billing',      color: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
          { label: 'Settings',       path: '/settings',     color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
        ].map(({ label, path, color }) => (
          <button
            key={label}
            onClick={() => router.push(path)}
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-left transition-colors ${color}`}
          >
            {label} →
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats?.users?.total ?? 0}
          subtitle={`${stats?.users?.instructors ?? 0} instructors · ${stats?.users?.students ?? 0} students`}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <StatCard
          title="Courses"
          value={stats?.courses?.total ?? 0}
          subtitle={`${stats?.courses?.published ?? 0} published · ${stats?.courses?.draft ?? 0} draft`}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
        <StatCard
          title="Enrollments"
          value={totalEnrollments}
          subtitle={`${stats?.enrollments?.completed ?? 0} completed · ${stats?.enrollments?.active ?? 0} active`}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />
        <StatCard
          title="Avg. Completion"
          value={`${stats?.progress?.averageCompletion ?? 0}%`}
          subtitle={`${stats?.enrollments?.completionRate ?? 0}% completion rate`}
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
      </div>

      {/* New users this month */}
      {(stats?.users?.newThisMonth ?? 0) > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700">
          <span className="font-semibold">{stats.users.newThisMonth}</span> new users joined this month
        </div>
      )}

      {/* ── Tabbed Management Section ─────────────────────────────────── */}
      <ManagementTabs stats={stats} />
    </div>
  );
}
