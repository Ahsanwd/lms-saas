'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface VerifyResult {
  valid: boolean;
  message?: string;
  certificateId?: string;
  studentName?: string;
  courseTitle?: string;
  completedAt?: string;
  issuedAt?: string;
  expiresAt?: string | null;
  isExpired?: boolean;
  revoked?: boolean;
  revokedAt?: string;
  revokeReason?: string;
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function VerifyCertificatePage() {
  const { certificateId } = useParams<{ certificateId: string }>();

  const { data, isLoading, isError } = useQuery<VerifyResult>({
    queryKey: ['verify-cert', certificateId],
    queryFn: async () => {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000') + '/api';
      const res = await axios.get(`${apiBase}/verify-certificate/${certificateId}`);
      return res.data?.data;
    },
    retry: false,
    staleTime: 60000,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center p-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">LMS Platform</p>
          <p className="text-sm font-bold text-gray-700">Certificate Verification</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-500 font-medium">Verifying certificate…</p>
          </div>
        ) : isError || !data ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Verification Failed</h2>
            <p className="text-sm text-gray-500">Could not verify this certificate. Please check the ID and try again.</p>
          </div>
        ) : data.revoked ? (
          <>
            <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <div>
                <p className="text-white/80 text-xs font-semibold uppercase tracking-wide">Revoked</p>
                <p className="text-white font-bold text-lg">Certificate Revoked</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-red-600 font-medium bg-red-50 rounded-lg px-3 py-2">
                This certificate has been revoked and is no longer valid.
              </p>
              {[
                { label: 'Student Name',   value: data.studentName,              icon: '👤' },
                { label: 'Course',         value: data.courseTitle,               icon: '📚' },
                { label: 'Revoked On',     value: formatDate(data.revokedAt),     icon: '🚫' },
                { label: 'Reason',         value: data.revokeReason ?? 'Not specified', icon: '📋' },
                { label: 'Certificate ID', value: data.certificateId,             icon: '🔖' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                    <p className={`text-sm font-semibold text-gray-800 mt-0.5 ${label === 'Certificate ID' ? 'font-mono tracking-wider' : ''}`}>
                      {value ?? '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : data.isExpired ? (
          <>
            <div className="bg-gradient-to-r from-amber-500 to-orange-400 px-6 py-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-white/80 text-xs font-semibold uppercase tracking-wide">Expired</p>
                <p className="text-white font-bold text-lg">Certificate Expired</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-amber-700 font-medium bg-amber-50 rounded-lg px-3 py-2">
                This certificate was valid but has passed its expiry date.
              </p>
              {[
                { label: 'Student Name',   value: data.studentName,              icon: '👤' },
                { label: 'Course',         value: data.courseTitle,               icon: '📚' },
                { label: 'Completed On',   value: formatDate(data.completedAt),   icon: '📅' },
                { label: 'Expired On',     value: formatDate(data.expiresAt ?? undefined), icon: '⏰' },
                { label: 'Certificate ID', value: data.certificateId,             icon: '🔖' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                    <p className={`text-sm font-semibold text-gray-800 mt-0.5 ${label === 'Certificate ID' ? 'font-mono tracking-wider' : ''}`}>
                      {value ?? '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : data.valid ? (
          <>
            {/* Valid header */}
            <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white/80 text-xs font-semibold uppercase tracking-wide">Verified</p>
                <p className="text-white font-bold text-lg">Authentic Certificate</p>
              </div>
            </div>

            {/* Details */}
            <div className="p-6 space-y-4">
              {[
                { label: 'Student Name',   value: data.studentName,            icon: '👤' },
                { label: 'Course',         value: data.courseTitle,             icon: '📚' },
                { label: 'Completed On',   value: formatDate(data.completedAt), icon: '📅' },
                { label: 'Issued On',      value: formatDate(data.issuedAt),    icon: '🏆' },
                ...(data.expiresAt ? [{ label: 'Valid Until', value: formatDate(data.expiresAt), icon: '⏳' }] : []),
                { label: 'Certificate ID', value: data.certificateId,           icon: '🔖' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                    <p className={`text-sm font-semibold text-gray-800 mt-0.5 ${label === 'Certificate ID' ? 'font-mono tracking-wider' : ''}`}>
                      {value ?? '—'}
                    </p>
                  </div>
                </div>
              ))}

              {/* Verification badge */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
                This certificate was verified on {new Date().toLocaleDateString()} and is authentic.
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Invalid Certificate</h2>
            <p className="text-sm text-gray-500">{data.message ?? 'This certificate could not be verified.'}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 pb-5 text-center">
          <p className="text-[11px] text-gray-400">
            Certificate ID: <span className="font-mono font-semibold">{certificateId}</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">
        Powered by LMS Platform · Certificate Verification System
      </p>
    </div>
  );
}
