'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Button, Alert, Spinner } from '@/components/ui';
import { AxiosError } from 'axios';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const fromRegister = searchParams.get('fromRegister');

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (token) {
      verifyToken(token);
    }
  }, [token]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function verifyToken(t: string) {
    setStatus('verifying');
    try {
      await api.post('/auth/verify-email', { token: t });
      setStatus('success');
      setTimeout(() => router.push('/login'), 3000);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setStatus('error');
      setMessage(e.response?.data?.message ?? 'Verification failed.');
    }
  }

  async function resend() {
    try {
      await api.post('/auth/resend-verification');
      setResendCooldown(60);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setMessage(e.response?.data?.message ?? 'Could not resend email.');
    }
  }

  if (status === 'verifying') {
    return (
      <div className="text-center py-8">
        <Spinner size="lg" className="mx-auto mb-4" />
        <p className="text-gray-600">Verifying your email…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Email verified!</h2>
        <p className="text-gray-500 text-sm">Redirecting you to login…</p>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-100 rounded-full mb-4">
          <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Check your email</h2>
        <p className="text-sm text-gray-500 mt-2">
          {fromRegister
            ? "We've sent a verification link to your email address."
            : 'Click the link in your email to verify your account.'}
        </p>
      </div>

      {status === 'error' && <Alert variant="error" className="mb-4">{message}</Alert>}

      <div className="space-y-3">
        <Button
          onClick={resend}
          variant="outline"
          className="w-full"
          disabled={resendCooldown > 0}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
        </Button>
        <Link href="/login">
          <Button variant="ghost" className="w-full">Back to login</Button>
        </Link>
      </div>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-center py-8"><Spinner size="lg" className="mx-auto" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
