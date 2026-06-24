'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api, { setAccessToken, setTenantSubdomain } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Input, Alert } from '@/components/ui';
import { AxiosError } from 'axios';

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setSubdomain } = useAuthStore();

  const [subdomain, setSubdomainVal] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [loadingTenant, setLoadingTenant] = useState(false);

  useEffect(() => {
    const t = searchParams.get('tenant') || '';
    setSubdomainVal(t);
    if (t) fetchTenantName(t);
  }, [searchParams]);

  async function fetchTenantName(sub: string) {
    setLoadingTenant(true);
    try {
      const { data } = await api.get(`/auth/check-subdomain?subdomain=${sub}`);
      if (data.data?.available === false) {
        setTenantName(data.data?.tenantName || sub);
      }
    } catch {
      // ignore
    } finally {
      setLoadingTenant(false);
    }
  }

  const handleSubdomainBlur = () => {
    if (subdomain.trim()) fetchTenantName(subdomain.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!subdomain.trim()) { setError('Please enter the school subdomain.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setLoading(true);
    try {
      setTenantSubdomain(subdomain.trim());
      const { data } = await api.post('/auth/register', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
      if (data.data?.requiresVerification) {
        router.push(`/verify-email?fromRegister=1&tenant=${subdomain.trim()}`);
      } else {
        router.push(`/login?tenant=${subdomain.trim()}&registered=1`);
      }
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setError(e.response?.data?.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Create your account</h2>
        {tenantName ? (
          <p className="text-sm text-gray-500 mt-1">Joining <span className="font-medium text-primary-600">{tenantName}</span></p>
        ) : (
          <p className="text-sm text-gray-500 mt-1">Student self-registration</p>
        )}
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">School subdomain</label>
          <input
            type="text"
            placeholder="e.g. myschool"
            value={subdomain}
            onChange={(e) => setSubdomainVal(e.target.value.toLowerCase().trim())}
            onBlur={handleSubdomainBlur}
            required
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {loadingTenant && <p className="text-xs text-gray-400 mt-1">Looking up school...</p>}
          {tenantName && !loadingTenant && (
            <p className="text-xs text-green-600 mt-1">School found: {tenantName}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            placeholder="John"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            label="Last name"
            placeholder="Doe"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label="Password"
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <Input
          label="Confirm password"
          type="password"
          placeholder="Repeat password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />

        <Button type="submit" className="w-full" loading={loading}>
          Create Account
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link
          href={subdomain ? `/login?tenant=${subdomain}` : '/login'}
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupContent />
    </Suspense>
  );
}
