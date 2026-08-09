'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Spinner, Alert } from '@/components/ui';
import { CheckoutModal } from '@/components/payment/CheckoutModal';
import { AxiosError } from 'axios';

interface CourseInfo {
  _id: string;
  title: string;
  thumbnail?: string;
  shortDescription?: string;
  price?: number;
  isFree?: boolean;
  level?: string;
  totalLessons?: number;
  totalDurationSeconds?: number;
  instructorId?: { firstName: string; lastName: string };
}

interface LinkInfo {
  token: string;
  title: string | null;
  courses: CourseInfo[];
  isBundle: boolean;
  tenantName: string | null;
  expiresAt: string | null;
  maxUses: number;
  uses: number;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function CourseCard({ course }: { course: CourseInfo }) {
  return (
    <div className="flex gap-4 bg-white border border-gray-100 rounded-xl p-4">
      {course.thumbnail ? (
        <img
          src={course.thumbnail}
          alt={course.title}
          className="w-24 h-16 object-cover rounded-lg flex-shrink-0"
        />
      ) : (
        <div className="w-24 h-16 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg flex-shrink-0 flex items-center justify-center">
          <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm leading-snug">{course.title}</p>
        {course.instructorId && (
          <p className="text-xs text-gray-400 mt-0.5">
            {course.instructorId.firstName} {course.instructorId.lastName}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          {course.level && (
            <span className="text-xs text-gray-500 capitalize">{course.level}</span>
          )}
          {course.totalLessons != null && (
            <span className="text-xs text-gray-500">{course.totalLessons} lessons</span>
          )}
          {course.totalDurationSeconds != null && course.totalDurationSeconds > 0 && (
            <span className="text-xs text-gray-500">{formatDuration(course.totalDurationSeconds)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router    = useRouter();
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);

  const { data: linkInfo, isLoading, isError, error } = useQuery<LinkInfo>({
    queryKey: ['enrollment-link', token],
    queryFn: async () => {
      const { data } = await api.get(`/enrollment-links/join/${token}`);
      return data.data as LinkInfo;
    },
    retry: false,
  });

  // Only the common single-course case gets a real checkout — a multi-course
  // link with a mix of free/paid courses isn't a supported flow yet (see the
  // fallback notice further down).
  const singleCourse = linkInfo && !linkInfo.isBundle ? linkInfo.courses[0] : null;
  const isPaidSingle = !!singleCourse && !singleCourse.isFree && (singleCourse.price ?? 0) > 0;
  const hasUnsupportedPaidBundle = !!linkInfo?.isBundle &&
    linkInfo.courses.some((c) => !c.isFree && (c.price ?? 0) > 0);

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/enrollment-links/join/${token}`),
    onSuccess: (res) => {
      const data = res.data?.data as { enrolled?: string[]; results?: { status: string }[]; redirectCourseId?: string } | undefined;
      const succeeded = (data?.enrolled?.length ?? 0) > 0 || data?.results?.some((r) => r.status === 'already_enrolled');
      if (!succeeded) {
        // Every course in the link resolved to 'skipped'/'full' — nothing
        // was actually enrolled, so don't show the success screen/redirect.
        setJoinError('These courses are no longer available.');
        return;
      }
      setJoined(true);
      // Redirect after a short pause so user sees the success state
      const redirectId = data?.redirectCourseId;
      setTimeout(() => {
        router.push(redirectId ? `/courses/${redirectId}` : '/dashboard');
      }, 2000);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setJoinError(err.response?.data?.message ?? 'Could not enroll. Please try again.');
    },
  });

  // Once authenticated, auto-join if we came from the login redirect
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const autoJoin = searchParams?.get('join') === '1';
  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !autoJoin || joined || !linkInfo) return;
    if (isPaidSingle) { setShowCheckout(true); return; }
    if (!joinMutation.isPending) joinMutation.mutate();
  }, [hasHydrated, isAuthenticated, autoJoin, linkInfo, isPaidSingle]);

  if (isLoading || !hasHydrated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError) {
    const msg = (error as AxiosError<{ message: string }>)?.response?.data?.message ?? 'This link is invalid or has expired.';
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Link unavailable</h1>
          <p className="text-sm text-gray-500">{msg}</p>
        </div>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">You&apos;re enrolled!</h1>
          <p className="text-sm text-gray-500">Taking you to your course…</p>
          <div className="mt-4"><Spinner size="sm" className="mx-auto" /></div>
        </div>
      </div>
    );
  }

  const info = linkInfo!;
  const heading = info.title || (info.isBundle ? 'Course Bundle' : info.courses[0]?.title ?? 'Course Invitation');

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 px-8 py-7 text-white">
          <p className="text-primary-200 text-xs font-semibold uppercase tracking-widest mb-1">
            {info.tenantName ?? 'You\'re invited'}
          </p>
          <h1 className="text-2xl font-bold leading-snug">{heading}</h1>
          {info.isBundle && (
            <p className="text-primary-200 text-sm mt-1">{info.courses.length} courses included</p>
          )}
        </div>

        <div className="px-8 py-6 space-y-5">
          {/* Course list */}
          <div className="space-y-3">
            {info.courses.map(c => <CourseCard key={c._id} course={c} />)}
          </div>

          {/* Expiry / limit notice */}
          {(info.expiresAt || info.maxUses > 0) && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 text-xs text-amber-700 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {info.expiresAt && (
                <span>Expires {new Date(info.expiresAt).toLocaleDateString()}</span>
              )}
              {info.expiresAt && info.maxUses > 0 && <span>·</span>}
              {info.maxUses > 0 && (
                <span>{info.maxUses - info.uses} of {info.maxUses} spots remaining</span>
              )}
            </div>
          )}

          {joinError && <Alert variant="error">{joinError}</Alert>}

          {/* CTA */}
          {hasUnsupportedPaidBundle ? (
            <Alert variant="error">
              This link includes one or more paid courses alongside others — bundled paid links
              aren&apos;t supported yet. Please enroll in each course individually, or contact us for help.
            </Alert>
          ) : isAuthenticated ? (
            <Button
              className="w-full"
              size="lg"
              loading={joinMutation.isPending}
              onClick={() => (isPaidSingle ? setShowCheckout(true) : joinMutation.mutate())}
            >
              {isPaidSingle
                ? `Pay $${singleCourse!.price!.toFixed(2)} to Enroll`
                : info.isBundle ? `Enroll in all ${info.courses.length} courses` : 'Enroll now — it\'s free'}
            </Button>
          ) : (
            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={() => router.push(`/register?redirect=${encodeURIComponent(`/join/${token}?join=1`)}`)}
              >
                {isPaidSingle ? 'Create free account to continue' : 'Create free account & enroll'}
              </Button>
              <button
                className="w-full text-sm text-gray-500 hover:text-gray-700 text-center py-1"
                onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/join/${token}?join=1`)}`)}

              >
                Already have an account? Sign in
              </button>
            </div>
          )}

          <p className="text-xs text-center text-gray-400">
            {isPaidSingle
              ? `This course is $${singleCourse!.price!.toFixed(2)} — you'll be taken to secure checkout.`
              : 'This is a free enrollment link — no payment required.'}
          </p>
        </div>
      </div>

      {showCheckout && singleCourse && (
        <CheckoutModal
          itemLabel={singleCourse.title}
          price={singleCourse.price ?? 0}
          initiateUrl={`/payments/courses/${singleCourse._id}/initiate`}
          confirmUrlBase="/payments"
          successTitle="Payment successful!"
          successMessage="You're enrolled. Taking you to your course…"
          onSuccess={() => {}}
          onClose={(completed) => {
            setShowCheckout(false);
            if (completed) {
              setJoined(true);
              setTimeout(() => router.push(`/courses/${singleCourse._id}`), 1500);
            }
          }}
        />
      )}
    </div>
  );
}
