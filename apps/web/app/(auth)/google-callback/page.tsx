'use client';

import { Suspense } from 'react';
import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api, { setAccessToken, setTenantSubdomain } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Spinner } from '@/components/ui';

function GoogleCallbackPage() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setSubdomain } = useAuthStore();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code  = searchParams.get('code');
    const state = searchParams.get('state');
    const err   = searchParams.get('error');

    if (err || !code) {
      router.replace(`/login?error=${encodeURIComponent(err ?? 'google_cancelled')}`);
      return;
    }

    let subdomain = '';
    try {
      const parsed = JSON.parse(Buffer.from(state ?? '', 'base64').toString());
      subdomain = parsed.subdomain ?? '';
    } catch {
      // state may be absent for super_admin
    }

    if (subdomain) setTenantSubdomain(subdomain);

    api.post('/auth/google/callback', { code })
      .then(({ data }) => {
        const result = data.data;
        setAccessToken(result.accessToken);
        setSubdomain(subdomain);
        setUser(result.user);
        router.replace(result.user.role === 'super_admin' ? '/admin/dashboard' : '/dashboard');
      })
      .catch((e) => {
        const msg = e?.response?.data?.message ?? 'google_failed';
        router.replace(`/login?error=${encodeURIComponent(msg)}`);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <Spinner size="lg" />
      <p className="text-sm text-gray-500">Signing you in with Google…</p>
    </div>
  );
}

export default function GoogleCallbackPageWrapper() {
  return <Suspense><GoogleCallbackPage /></Suspense>;
}
