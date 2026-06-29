'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Cookies from 'js-cookie';
import api, { setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Input, Alert } from '@/components/ui';

function RegisterPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setSubdomain: setStoreSubdomain } = useAuthStore();

  const [subdomain,  setSubdomain]  = useState('');
  const [tenantName, setTenantName] = useState('');
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [done,       setDone]       = useState(false);

  useEffect(() => {
    const sub = Cookies.get('lms_tenant');
    if (!sub) {
      // Not on a tenant subdomain — send to school creation instead
      router.replace('/register-tenant');
      return;
    }
    setSubdomain(sub);

    // Fetch tenant name for friendly display
    api.get('/courses/public', { headers: { 'X-Tenant-Subdomain': sub } })
      .then(res => setTenantName(res.data?.data?.tenantName ?? sub))
      .catch(() => setTenantName(sub));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!firstName.trim()) return setError('First name is required');
    if (!lastName.trim())  return setError('Last name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address');
    if (password.length < 8) return setError('Password must be at least 8 characters');

    setLoading(true);
    try {
      const { data: res } = await api.post('/auth/register', {
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim().toLowerCase(),
        password,
      });

      if (res.data?.requiresVerification) {
        setDone(true);
      } else {
        // No email verification — server issues token immediately, log user in
        if (res.data?.accessToken) {
          setAccessToken(res.data.accessToken);
          setStoreSubdomain(subdomain || '');
          setUser(res.data.user);
        }
        const redirectTo = searchParams.get('redirect');
        router.push(redirectTo || '/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const displayName = tenantName
    ? tenantName
    : subdomain
      ? subdomain.charAt(0).toUpperCase() + subdomain.slice(1)
      : '';

  // Email sent confirmation screen
  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Check your email</h2>
        <p className="text-sm text-gray-500">
          We sent a verification link to <strong>{email}</strong>.
          Click it to activate your account and start learning.
        </p>
        <p className="text-xs text-gray-400">
          Didn't get it?{' '}
          <button
            onClick={async () => {
              try {
                await api.post('/auth/resend-verification', { email });
                alert('Verification email resent!');
              } catch {
                alert('Could not resend. Please try again.');
              }
            }}
            className="text-primary-600 hover:underline"
          >
            Resend email
          </button>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          {displayName ? `Join ${displayName}` : 'Create your account'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Sign up for free — no credit card needed
        </p>
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            autoComplete="given-name"
            placeholder="Jane"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            autoFocus
          />
          <Input
            label="Last name"
            autoComplete="family-name"
            placeholder="Smith"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
          />
        </div>

        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="jane@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <Button type="submit" className="w-full" loading={loading}>
          Create my account
        </Button>

        <p className="text-xs text-center text-gray-400">
          By signing up you agree to our{' '}
          <span className="text-primary-600 cursor-pointer">Terms</span> and{' '}
          <span className="text-primary-600 cursor-pointer">Privacy Policy</span>.
        </p>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function RegisterPageWrapper() {
  return <Suspense><RegisterPage /></Suspense>;
}
