'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { StatCard } from '@/components/dashboard/StatCard';
import { Spinner } from '@/components/ui';

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
    <div className="p-6 space-y-6">
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
    </div>
  );
}
