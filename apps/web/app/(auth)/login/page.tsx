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
  const [googleLoading, setGoogleLoading] = useState(false);

  // True when the user is on a tenant subdomain (e.g. pedofoy.coursel.space)
  const [isSubdomainHost, setIsSubdomainHost] = useState(false);

  useEffect(() => {
    // Priority: ?tenant= param → cookie set by middleware from subdomain URL
    const tenantParam = searchParams.get('tenant');
    const tenantCookie = Cookies.get('lms_tenant') ?? '';
    const tenant = tenantParam || tenantCookie;
    if (tenant) setSubdomainVal(tenant);

    // Detect if user is on a *.coursel.space subdomain URL
    const host = window.location.hostname;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'coursel.space';
    if (host.endsWith(`.${rootDomain}`)) setIsSubdomainHost(true);

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

  async function handleGoogleLogin() {
    setError('');
    setGoogleLoading(true);
    try {
      clearTenantSubdomain();
      if (subdomain) setTenantSubdomain(subdomain);
      const { data } = await api.get('/auth/google/url');
      window.location.href = data.data.url;
    } catch {
      setGoogleLoading(false);
      setError('Google login is not configured on this server.');
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

      {/* Divider */}
      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium">OR</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60 transition-colors"
      >
        {googleLoading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        )}
        Continue with Google
      </button>

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
