'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/api';

interface UsageSummary {
  planName: string;
  students:    { used: number; limit: number };
  instructors: { used: number; limit: number };
  courses:     { used: number; limit: number };
  storage: {
    usedBytes: number;
    usedGB:    number;
    limitGB:   number;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pct(used: number, limit: number): number {
  if (limit === -1) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function barColor(p: number): string {
  if (p >= 100) return 'bg-red-500';
  if (p >= 80)  return 'bg-yellow-400';
  return 'bg-primary-500';
}

function limitLabel(limit: number): string {
  return limit === -1 ? 'Unlimited' : limit.toString();
}

// ─── Single Row ────────────────────────────────────────────────────────────────

function UsageRow({
  label,
  used,
  limit,
  unit = '',
}: {
  label: string;
  used: number | string;
  limit: number;
  unit?: string;
}) {
  const usedNum  = typeof used === 'number' ? used : parseFloat(used as string);
  const p        = pct(usedNum, limit);
  const atLimit  = limit !== -1 && usedNum >= limit;
  const nearLimit = limit !== -1 && p >= 80 && !atLimit;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className={`text-xs font-medium ${atLimit ? 'text-red-600' : nearLimit ? 'text-yellow-600' : 'text-gray-500'}`}>
          {typeof used === 'number' ? used.toLocaleString() : used}
          {unit && ` ${unit}`}
          {' / '}
          {limit === -1 ? (
            <span className="text-gray-400">Unlimited</span>
          ) : (
            <span>{limitLabel(limit)}{unit && ` ${unit}`}</span>
          )}
        </span>
      </div>
      {limit !== -1 && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor(p)}`}
            style={{ width: `${p}%` }}
          />
        </div>
      )}
      {limit === -1 && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full w-0 rounded-full bg-primary-200" />
        </div>
      )}
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────────

export function PlanUsageCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tenant-usage'],
    queryFn: async () => {
      const res = await api.get('/tenant/usage');
      return res.data.data as UsageSummary;
    },
    staleTime: 60_000,
  });

  const storageUsedGB  = data?.storage.usedGB   ?? 0;
  const storageLimitGB = data?.storage.limitGB  ?? -1;

  const hasAnyLimit =
    (data?.students.limit    ?? -1) !== -1 ||
    (data?.instructors.limit ?? -1) !== -1 ||
    (data?.courses.limit     ?? -1) !== -1 ||
    storageLimitGB                  !== -1;

  const nearOrAtLimit =
    pct(data?.students.limit    !== -1 ? data!.students.used    : 0, data?.students.limit    ?? -1) >= 80 ||
    pct(data?.instructors.limit !== -1 ? data!.instructors.used : 0, data?.instructors.limit ?? -1) >= 80 ||
    pct(data?.courses.limit     !== -1 ? data!.courses.used     : 0, data?.courses.limit     ?? -1) >= 80 ||
    pct(storageLimitGB          !== -1 ? storageUsedGB           : 0, storageLimitGB)                >= 80;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Plan Usage</h3>
          {data && (
            <p className="text-xs text-gray-400 mt-0.5">{data.planName} plan</p>
          )}
        </div>
        {nearOrAtLimit && (
          <Link href="/billing">
            <span className="text-xs font-medium text-primary-600 hover:underline">Upgrade</span>
          </Link>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5 animate-pulse">
              <div className="flex justify-between">
                <div className="h-3 w-20 bg-gray-200 rounded" />
                <div className="h-3 w-16 bg-gray-200 rounded" />
              </div>
              <div className="h-2 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500">Failed to load usage data.</p>
      )}

      {data && (
        <div className="space-y-4">
          <UsageRow
            label="Students"
            used={data.students.used}
            limit={data.students.limit}
          />
          <UsageRow
            label="Instructors"
            used={data.instructors.used}
            limit={data.instructors.limit}
          />
          <UsageRow
            label="Courses"
            used={data.courses.used}
            limit={data.courses.limit}
          />
          <UsageRow
            label="Storage"
            used={`${storageUsedGB.toFixed(2)}`}
            limit={storageLimitGB}
            unit="GB"
          />
        </div>
      )}

      {data && !hasAnyLimit && (
        <p className="text-xs text-gray-400 text-center">All resources are unlimited on your plan.</p>
      )}
    </div>
  );
}
