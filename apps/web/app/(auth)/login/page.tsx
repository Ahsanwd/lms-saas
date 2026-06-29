'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Cookies from 'js-cookie';
import api, { setAccessToken, setTenantSubdomain, clearTenantSubdomain } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Alert } from '@/components/ui';
import { AxiosError } from 'axios';

function LoginPage() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setSubdomain } = useAuthStore();

  const [subdomain, setSubdomainVal] = useState('');
  const [email,     setEmail]        = useState('');
  const [password,  setPassword]     = useState('');
  const [totpCode,  setTotpCode]     = useState('');
  const [tempToken, setTempToken]    = useState('');

  const [step,      setStep]    = useState<'login' | '2fa'>('login');
  const [loading,   setLoading] = useState(false);
  const [error,     setError]   = useState('');
  const [success,   setSuccess] = useState('');

  // True when the user is on a tenant subdomain (e.g. pedofoy.coursel.space)
  const [isSubdomainHost, setIsSubdomainHost] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'coursel.space';
    const onSubdomain = host !== rootDomain && host !== `www.${rootDomain}` && host.endsWith(`.${rootDomain}`);
    if (onSubdomain) setIsSubdomainHost(true);

    // Pre-fill tenant from URL param always, but from cookie only when already
    // on a subdomain — avoids the cookie poisoning the super-admin login on coursel.space
    const tenantParam = searchParams.get('tenant');
    const tenantCookie = onSubdomain ? (Cookies.get('lms_tenant') ?? '') : '';
    const tenant = tenantParam || tenantCookie;
    if (tenant) setSubdomainVal(tenant);

    if (searchParams.get('registered') === '1') {
      setSuccess('Account created! You can now sign in.');
    }
  }, [searchParams]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      clearTenantSubdomain();
      if (subdomain) setTenantSubdomain(subdomain);
      const { data } = await api.post('/auth/login', { email, password });
      const result = data.data;

      if (result.requiresTwoFactor) {
        setTempToken(result.tempToken);
        setStep('2fa');
        return;
      }

      setAccessToken(result.accessToken);
      setSubdomain(subdomain || '');
      setUser(result.user);
      router.push(result.user.role === 'super_admin' ? '/admin/dashboard' : '/dashboard');
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setError(e.response?.data?.message ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function onVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/2fa/verify', { tempToken, code: totpCode });
      const result = data.data;
      setAccessToken(result.accessToken);
      setSubdomain(subdomain || '');
      setUser(result.user);
      router.push('/dashboard');
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setError(e.response?.data?.message ?? 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  }


  const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow bg-white';
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

  // ── 2FA step ─────────────────────────────────────────────────────────────────
  if (step === '2fa') {
    return (
      <>
        <div className="mb-6 text-center">
          <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Two-factor authentication</h2>
          <p className="text-sm text-gray-500 mt-1">Enter the 6-digit code from your authenticator app</p>
        </div>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        <form onSubmit={onVerify2FA} className="space-y-4">
          <div>
            <label className={labelCls}>Authentication Code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              autoFocus
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className={`${inputCls} text-center text-2xl tracking-[0.5em] font-mono`}
            />
          </div>
          <p className="text-xs text-gray-400 text-center">You can also use one of your backup codes.</p>
          <Button type="submit" className="w-full" loading={loading}>
            Verify & Sign in
          </Button>
          <button type="button" onClick={() => { setStep('login'); setError(''); setTotpCode(''); }}
            className="w-full text-sm text-gray-500 hover:text-gray-700 text-center">
            ← Back to login
          </button>
        </form>
      </>
    );
  }

  // ── Login step ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Welcome back</h2>
        <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
      </div>

      {success && <Alert variant="success" className="mb-4">{success}</Alert>}
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <form onSubmit={onLogin} className="space-y-4">
        {/* Hide subdomain input when already on a tenant subdomain URL */}
        {!isSubdomainHost && (
          <div>
            <label className={labelCls}>Organisation subdomain</label>
            <input
              type="text"
              value={subdomain}
              onChange={e => setSubdomainVal(e.target.value)}
              placeholder="e.g. demo  (leave blank for super admin)"
              className={inputCls}
            />
          </div>
        )}
        <div>
          <label className={labelCls}>Email address</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className={inputCls}
            required
          />
        </div>

        <div className="flex items-center justify-end">
          <Link href="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-medium text-primary-600 hover:text-primary-700">
          Sign up
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-gray-400">
        Starting a new organisation?{' '}
        <Link href="/register-tenant" className="font-medium text-primary-600 hover:text-primary-700">
          Create yours →
        </Link>
      </p>
    </>
  );
}

export default function LoginPageWrapper() {
  return <Suspense><LoginPage /></Suspense>;
}
