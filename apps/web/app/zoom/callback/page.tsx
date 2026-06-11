'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';

export default function ZoomCallbackPage() {
  const router      = useRouter();
  const params      = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('');
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      setStatus('error');
      setMessage(error === 'access_denied' ? 'You cancelled the Zoom authorization.' : error);
      setTimeout(() => router.replace('/settings?zoom=error'), 2500);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization parameters.');
      setTimeout(() => router.replace('/settings?zoom=error'), 2500);
      return;
    }

    api.post('/zoom/token', { code, state })
      .then(() => {
        setStatus('success');
        router.replace('/settings?zoom=connected');
      })
      .catch(err => {
        const msg = err.response?.data?.message ?? 'Failed to connect Zoom account.';
        setStatus('error');
        setMessage(msg);
        setTimeout(() => router.replace(`/settings?zoom=error&msg=${encodeURIComponent(msg)}`), 2500);
      });
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center space-y-4">
        {status === 'processing' && (
          <>
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">Connecting your Zoom account…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">Zoom connected! Redirecting…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">Connection failed</p>
            {message && <p className="text-xs text-gray-400">{message}</p>}
            <p className="text-xs text-gray-400">Redirecting back to Settings…</p>
          </>
        )}
      </div>
    </div>
  );
}
