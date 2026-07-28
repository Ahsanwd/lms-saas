'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Cookies from 'js-cookie';
import api, { setAccessToken, setTenantSubdomain, clearTenantSubdomain } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Alert } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AxiosError } from 'axios';

interface OrgMatch { tenantId: string | null; subdomain: string | null; name: string; }

function LoginPage() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setSubdomain } = useAuthStore();

  const [subdomain, setSubdomainVal] = useState('');
  const [email,     setEmail]        = useState('');
  const [password,  setPassword]     = useState('');
  const [showPwd,   setShowPwd]      = useState(false);
  const [totpCode,  setTotpCode]     = useState('');
  const [tempToken, setTempToken]    = useState('');

  // 'email'/'org-picker' only happen on the root domain, where the same
  // email can belong to more than one org (email is unique per-tenant, not
  // globally) — see resolveLoginTenants on the backend.
  const [step,      setStep]    = useState<'email' | 'org-picker' | 'password' | '2fa'>('email');
  const [loading,   setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error,     setError]   = useState('');
  const [success,   setSuccess] = useState('');
  const [orgName,   setOrgName] = useState('');
  const [matches,   setMatches] = useState<OrgMatch[]>([]);

  // True when the user is on a tenant subdomain (e.g. pedofoy.coursel.space)
  const [isSubdomainHost, setIsSubdomainHost] = useState(false);
  // True once we already know which org to check the password against —
  // either from the hostname or a ?tenant= link — so the email-lookup step
  // can be skipped entirely.
  const [orgKnown, setOrgKnown] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'coursel.space';
    const onSubdomain = host !== rootDomain && host !== `www.${rootDomain}` && host.endsWith(`.${rootDomain}`);
    if (onSubdomain) setIsSubdomainHost(true);

    // Pre-fill tenant from URL param, then the hostname itself (authoritative
    // when actually on a subdomain — a fresh browser with no cookie yet must
    // still resolve the tenant), then finally the cookie as a last resort.
    // Avoids reading the cookie on the root domain, which would poison the
    // super-admin login on coursel.space.
    const tenantParam = searchParams.get('tenant');
    const hostSubdomain = onSubdomain ? host.replace(`.${rootDomain}`, '') : '';
    const tenantCookie = onSubdomain ? (Cookies.get('lms_tenant') ?? '') : '';
    const tenant = tenantParam || hostSubdomain || tenantCookie;
    if (tenant) setSubdomainVal(tenant);

    if (onSubdomain || tenantParam) {
      setOrgKnown(true);
      setStep('password');
    }

    if (searchParams.get('registered') === '1') {
      setSuccess('Account created! You can now sign in.');
    }
  }, [searchParams]);

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResolving(true);
    try {
      const { data } = await api.get('/auth/resolve-login-tenants', { params: { email } });
      const found = data.data.matches as OrgMatch[];
      if (!found.length) {
        setError("We couldn't find an account with that email.");
        return;
      }
      if (found.length === 1) {
        setSubdomainVal(found[0].subdomain || '');
        setOrgName(found[0].name);
        setStep('password');
        return;
      }
      setMatches(found);
      setStep('org-picker');
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setError(e.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setResolving(false);
    }
  }

  function selectOrg(m: OrgMatch) {
    setSubdomainVal(m.subdomain || '');
    setOrgName(m.name);
    setError('');
    setStep('password');
  }

  function backToEmail() {
    setStep('email');
    setPassword('');
    setError('');
  }

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
      const redirectTo = searchParams.get('redirect');
      router.push(redirectTo || (result.user.role === 'super_admin' ? '/admin/dashboard' : '/dashboard'));
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
      const redirectTo = searchParams.get('redirect');
      router.push(redirectTo || '/dashboard');
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
          <button type="button" onClick={() => { setStep('password'); setError(''); setTotpCode(''); }}
            className="w-full text-sm text-gray-500 hover:text-gray-700 text-center">
            ← Back to login
          </button>
        </form>
      </>
    );
  }

  // ── Email step (root domain only — find which org(s) this email belongs to) ───
  if (step === 'email') {
    return (
      <>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Welcome back</h2>
          <p className="text-sm text-gray-500 mt-1">Enter your email to find your school</p>
        </div>

        {success && <Alert variant="success" className="mb-4">{success}</Alert>}
        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        <form onSubmit={onEmailSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Email address</label>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
              required
            />
          </div>

          <Button type="submit" className="w-full" loading={resolving}>
            Continue →
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          Starting a new organisation?{' '}
          <Link href="/register-tenant" className="font-medium text-primary-600 hover:text-primary-700">
            Create yours →
          </Link>
        </p>
      </>
    );
  }

  // ── Org picker (email matched more than one org) ──────────────────────────────
  if (step === 'org-picker') {
    return (
      <>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Which organisation?</h2>
          <p className="text-sm text-gray-500 mt-1">This email is used at more than one place — pick yours</p>
        </div>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        <div className="space-y-2">
          {matches.map((m, i) => (
            <button
              key={m.tenantId ?? `platform-${i}`}
              type="button"
              onClick={() => selectOrg(m)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{m.name}</p>
                {m.subdomain && <p className="text-xs text-gray-400 truncate">{m.subdomain}.coursel.space</p>}
              </div>
              <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>

        <button type="button" onClick={backToEmail}
          className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 text-center">
          ← Use a different email
        </button>
      </>
    );
  }

  // ── Password step ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Welcome back</h2>
        <p className="text-sm text-gray-500 mt-1">
          {orgKnown ? 'Sign in to your account' : orgName ? `Signing in to ${orgName}` : 'Sign in to your account'}
        </p>
      </div>

      {success && <Alert variant="success" className="mb-4">{success}</Alert>}
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <form onSubmit={onLogin} className="space-y-4">
        {!orgKnown && (
          <div>
            <label className={labelCls}>Email</label>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50">
              <span className="text-sm text-gray-700 truncate">{email}</span>
              <button type="button" onClick={backToEmail}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 flex-shrink-0">
                Change
              </button>
            </div>
          </div>
        )}

        {orgKnown && (
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
        )}

        <div>
          <label className={labelCls}>Password</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus={!orgKnown}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className={cn(inputCls, 'pr-10')}
              required
            />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPwd
                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              }
            </button>
          </div>
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

      {/* On a tenant subdomain, "Sign up" joins that school. On the root
          domain there's no school to join — /register would just bounce
          straight to /register-tenant, so show only that link there. */}
      {isSubdomainHost ? (
        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-primary-600 hover:text-primary-700">
            Sign up
          </Link>
        </p>
      ) : (
        <p className="mt-6 text-center text-sm text-gray-400">
          Starting a new organisation?{' '}
          <Link href="/register-tenant" className="font-medium text-primary-600 hover:text-primary-700">
            Create yours →
          </Link>
        </p>
      )}
    </>
  );
}

export default function LoginPageWrapper() {
  return <Suspense><LoginPage /></Suspense>;
}
