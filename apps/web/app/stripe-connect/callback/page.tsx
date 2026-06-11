'use client';

import { Suspense } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';

type Phase = 'processing' | 'success' | 'error';

function StripeConnectCallbackPage() {
  const router       = useRouter();
  const params       = useSearchParams();
  const [phase, setPhase] = useState<Phase>('processing');
  const [msg, setMsg]     = useState('');
  const called = useRef(false); // prevent React 18 double-invoke in StrictMode

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDesc = params.get('error_description');

    if (error || !code || !state) {
      const message = errorDesc ?? error ?? 'Stripe authorization was cancelled or failed.';
      setPhase('error');
      setMsg(message);
      setTimeout(() => {
        router.replace(`/settings?stripe=error&msg=${encodeURIComponent(message)}`);
      }, 2500);
      return;
    }

    api.post('/stripe-connect/callback', { code, state })
      .then(() => {
        setPhase('success');
        setTimeout(() => router.replace('/settings?stripe=connected'), 1500);
      })
      .catch((err) => {
        const message = err?.response?.data?.message ?? 'Failed to connect Stripe account.';
        setPhase('error');
        setMsg(message);
        setTimeout(() => {
          router.replace(`/settings?stripe=error&msg=${encodeURIComponent(message)}`);
        }, 2500);
      });
  }, [params, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 w-full max-w-sm p-8 text-center space-y-4">
        {/* Stripe logo mark */}
        <div className="w-12 h-12 bg-[#635bff] rounded-xl flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
          </svg>
        </div>

        {phase === 'processing' && (
          <>
            <div className="w-8 h-8 border-4 border-[#635bff]/30 border-t-[#635bff] rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium text-gray-700">Connecting your Stripe account…</p>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">Stripe connected! Redirecting…</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">Connection failed</p>
            {msg && <p className="text-xs text-gray-500">{msg}</p>}
            <p className="text-xs text-gray-400">Redirecting back to settings…</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function StripeConnectCallbackPageWrapper() {
  return <Suspense><StripeConnectCallbackPage /></Suspense>;
}
