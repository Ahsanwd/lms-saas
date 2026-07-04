'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { applyBrandColor, applySecondaryColor, applyFontFamily, FONT_OPTIONS } from '@/lib/brandColor';
import { useAuthStore } from '@/stores/auth.store';

// ─── Shared helpers ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-primary-600' : 'bg-gray-200')}>
      <span className={cn('pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200',
        checked ? 'translate-x-5' : 'translate-x-0')} />
    </button>
  );
}

function SavedBadge() {
  return (
    <span className="text-sm text-green-600 flex items-center gap-1.5 font-medium">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      Saved!
    </span>
  );
}

const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 transition-shadow';
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

// ─── Section wrapper ───────────────────────────────────────────────────────────
function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0 text-primary-600">
          {icon}
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">{title}</p>
          {desc && <p className="text-xs text-gray-400">{desc}</p>}
        </div>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </div>
  );
}

// ─── 2FA / TOTP section (all authenticated users) ────────────────────────────

function TwoFASection() {
  const qc = useQueryClient();
  const { user: authUser, setUser } = useAuthStore();

  const [step,        setStep]        = useState<'idle' | 'setup' | 'disable'>('idle');
  const [qrDataUrl,   setQrDataUrl]   = useState('');
  const [secret,      setSecret]      = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code,        setCode]        = useState('');
  const [error,       setError]       = useState('');
  const [saved,       setSavedFlag]   = useState(false);

  const is2FA = authUser?.twoFactorEnabled ?? false;

  const setupMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/setup'),
    onSuccess: (res) => {
      setQrDataUrl(res.data.data.qrDataUrl);
      setSecret(res.data.data.secret);
      setBackupCodes(res.data.data.backupCodes);
      setCode('');
      setError('');
      setStep('setup');
    },
    onError: (e: any) => setError(e.response?.data?.message ?? 'Setup failed'),
  });

  const enableMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/enable', { code }),
    onSuccess: () => {
      setStep('idle');
      setCode('');
      setError('');
      setSavedFlag(true);
      if (authUser) setUser({ ...authUser, twoFactorEnabled: true });
      qc.invalidateQueries({ queryKey: ['me'] });
      setTimeout(() => setSavedFlag(false), 3000);
    },
    onError: (e: any) => setError(e.response?.data?.message ?? 'Invalid code'),
  });

  const disableMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable', { code }),
    onSuccess: () => {
      setStep('idle');
      setCode('');
      setError('');
      if (authUser) setUser({ ...authUser, twoFactorEnabled: false });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e: any) => setError(e.response?.data?.message ?? 'Invalid code'),
  });

  const ShieldIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
    </svg>
  );

  return (
    <Section icon={ShieldIcon} title="Two-Factor Authentication" desc={is2FA ? 'Enabled — your account is protected' : 'Add an extra layer of security with TOTP'}>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {saved  && <SavedBadge />}

      {step === 'idle' && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">{is2FA ? '🔒 2FA is enabled' : '2FA is disabled'}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {is2FA ? 'Use your authenticator app to log in.' : 'Use Google Authenticator or any TOTP app.'}
            </p>
          </div>
          {is2FA ? (
            <Button variant="outline" size="sm" onClick={() => { setStep('disable'); setError(''); setCode(''); }}>
              Disable 2FA
            </Button>
          ) : (
            <Button size="sm" loading={setupMut.isPending} onClick={() => setupMut.mutate()}>
              Enable 2FA
            </Button>
          )}
        </div>
      )}

      {step === 'setup' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Step 1 — Scan QR Code</p>
            <p className="text-xs text-blue-700">Open Google Authenticator (or any TOTP app) and scan the QR code below.</p>
            {qrDataUrl && <img src={qrDataUrl} alt="2FA QR Code" className="w-44 h-44 rounded-lg border border-blue-200 bg-white p-2 mx-auto block" />}
            <div className="bg-white rounded-lg border border-blue-200 px-3 py-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Manual entry key</p>
              <code className="text-xs font-mono text-gray-700 break-all select-all">{secret}</code>
            </div>
          </div>

          {backupCodes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Step 2 — Save Backup Codes</p>
              <p className="text-xs text-amber-700">Save these codes somewhere safe. Each can be used once if you lose access to your authenticator.</p>
              <div className="grid grid-cols-2 gap-1 mt-2">
                {backupCodes.map(c => (
                  <code key={c} className="text-xs font-mono bg-white border border-amber-200 rounded px-2 py-1 text-center select-all">{c}</code>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Step 3 — Verify Code</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 6-digit code"
              className="w-40 px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-center tracking-widest"
            />
          </div>

          <div className="flex gap-2">
            <Button loading={enableMut.isPending} disabled={code.length < 6} onClick={() => enableMut.mutate()}>
              Confirm &amp; Enable
            </Button>
            <Button variant="outline" onClick={() => { setStep('idle'); setError(''); }}>Cancel</Button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Enter a code from your authenticator app to confirm.</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-40 px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-center tracking-widest"
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="outline" loading={disableMut.isPending} disabled={code.length < 6}
              onClick={() => disableMut.mutate()}
              className="text-red-600 border-red-200 hover:bg-red-50">
              Disable 2FA
            </Button>
            <Button variant="outline" onClick={() => { setStep('idle'); setError(''); }}>Cancel</Button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Instructor: read-only Zoom status ────────────────────────────────────────

function InstructorZoomStatus() {
  const { data, isLoading } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ['zoom-status'],
    queryFn: () => api.get('/zoom/status').then(r => r.data.data),
    staleTime: 60_000,
  });

  const ZoomIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
    </svg>
  );

  return (
    <Section icon={ZoomIcon} title="Zoom Integration" desc="Managed by your organisation admin">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400"><Spinner size="sm" /> Checking…</div>
      ) : data?.connected ? (
        <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-900">Zoom Connected</p>
            <p className="text-xs text-blue-600 truncate">{data.email}</p>
          </div>
          <span className="flex-shrink-0 text-xs bg-green-100 text-green-700 border border-green-200 font-semibold px-2.5 py-1 rounded-full">Active</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-gray-600">No Zoom account connected</p>
            <p className="text-xs text-gray-400 mt-0.5">Ask your organisation admin to connect a Zoom account in their Settings.</p>
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Admin: full Zoom connect/disconnect ───────────────────────────────────────

function ZoomSection() {
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [connecting, setConnecting] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ['zoom-status'],
    queryFn: () => api.get('/zoom/status').then(r => r.data.data),
    staleTime: 30_000,
  });

  // Handle ?zoom=connected / ?zoom=error from the OAuth redirect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const zoomParam = sp.get('zoom');
    if (!zoomParam) return;
    if (zoomParam === 'connected') {
      setBanner({ type: 'success', msg: 'Zoom account connected successfully!' });
      refetch();
    } else if (zoomParam === 'error') {
      setBanner({ type: 'error', msg: sp.get('msg') || 'Failed to connect Zoom.' });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('zoom');
    url.searchParams.delete('msg');
    window.history.replaceState({}, '', url.toString());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/zoom/disconnect'),
    onSuccess: () => { refetch(); setBanner({ type: 'success', msg: 'Zoom account disconnected.' }); },
    onError:   () => setBanner({ type: 'error', msg: 'Failed to disconnect Zoom.' }),
  });

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await api.get('/zoom/auth-url');
      window.location.href = res.data.data.url;
    } catch {
      setConnecting(false);
      setBanner({ type: 'error', msg: 'Failed to get Zoom authorization URL. Check server config.' });
    }
  }

  const ZoomIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
    </svg>
  );

  return (
    <Section icon={ZoomIcon} title="Zoom Integration" desc="Connect your Zoom account to auto-generate meeting links for live lessons">
      {banner && (
        <div className={cn('flex items-start gap-3 rounded-xl px-4 py-3 text-sm',
          banner.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700')}>
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {banner.type === 'success'
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>}
          </svg>
          <span className="flex-1">{banner.msg}</span>
          <button onClick={() => setBanner(null)} className="text-current opacity-50 hover:opacity-100">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-1"><Spinner size="sm" /> Checking connection…</div>
      ) : data?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-blue-900">Zoom Connected</p>
              <p className="text-xs text-blue-600 truncate">{data.email}</p>
            </div>
            <span className="flex-shrink-0 text-xs bg-green-100 text-green-700 border border-green-200 font-semibold px-2.5 py-1 rounded-full">Active</span>
          </div>
          <p className="text-xs text-gray-400">When creating a Live lesson with Zoom platform, click "Create Zoom Meeting" in the lesson editor to auto-generate the meeting link.</p>
          <Button variant="outline" size="sm" onClick={() => disconnectMutation.mutate()} loading={disconnectMutation.isPending}>
            Disconnect Zoom
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <svg className="w-5 h-5 text-gray-300 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <div>
              <p className="text-sm font-semibold text-gray-700">No Zoom account connected</p>
              <p className="text-xs text-gray-400 mt-0.5">Connect your Zoom account to automatically create scheduled meetings when you add live lessons to a course.</p>
            </div>
          </div>
          <Button onClick={handleConnect} loading={connecting} disabled={connecting}>
            Connect Zoom Account
          </Button>
        </div>
      )}
    </Section>
  );
}

// ─── Admin: Payment Gateway (BYO — Stripe or Safepay) ─────────────────────────

interface PaymentGatewayData {
  activeProvider: 'stripe' | 'safepay' | null;
  stripe: { hasSecretKey: boolean; publishableKey: string | null; verified: boolean; verifiedAt: string | null };
  safepay: { apiKey: string | null; hasSecretKey: boolean; environment: 'sandbox' | 'production'; verified: boolean; verifiedAt: string | null };
}

function PaymentGatewaySection() {
  const qc = useQueryClient();
  const [tab, setTab]       = useState<'none' | 'stripe' | 'safepay'>('none');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [stripeSecretKey, setStripeSecretKey]           = useState('');
  const [stripePublishableKey, setStripePublishableKey] = useState('');

  const [safepayApiKey, setSafepayApiKey]       = useState('');
  const [safepaySecretKey, setSafepaySecretKey] = useState('');
  const [safepayEnv, setSafepayEnv]             = useState<'sandbox' | 'production'>('sandbox');

  const { data, isLoading } = useQuery<PaymentGatewayData>({
    queryKey: ['payment-gateway'],
    queryFn: async () => { const { data } = await api.get('/tenant/payment-gateway'); return data.data; },
  });

  useEffect(() => {
    if (!data) return;
    setTab(data.activeProvider ?? 'none');
    setStripePublishableKey(data.stripe.publishableKey || '');
    setSafepayApiKey(data.safepay.apiKey || '');
    setSafepayEnv(data.safepay.environment || 'sandbox');
  }, [data]);

  const saveStripeMutation = useMutation({
    mutationFn: () => api.put('/tenant/payment-gateway/stripe', {
      secretKey: stripeSecretKey || undefined,
      publishableKey: stripePublishableKey,
    }),
    onSuccess: (res) => {
      qc.setQueryData(['payment-gateway'], res.data.data);
      setStripeSecretKey('');
      setBanner({ type: 'success', msg: 'Stripe connected — key verified.' });
    },
    onError: (err: any) => setBanner({ type: 'error', msg: err.response?.data?.message ?? 'Failed to save Stripe key' }),
  });

  const saveSafepayMutation = useMutation({
    mutationFn: () => api.put('/tenant/payment-gateway/safepay', {
      apiKey: safepayApiKey,
      secretKey: safepaySecretKey || undefined,
      environment: safepayEnv,
    }),
    onSuccess: (res) => {
      qc.setQueryData(['payment-gateway'], res.data.data);
      setSafepaySecretKey('');
      setBanner({ type: 'success', msg: 'Safepay credentials saved — will verify automatically on your first live payment.' });
    },
    onError: (err: any) => setBanner({ type: 'error', msg: err.response?.data?.message ?? 'Failed to save Safepay credentials' }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (provider: 'stripe' | 'safepay') => api.delete(`/tenant/payment-gateway/${provider}`),
    onSuccess: (res) => {
      qc.setQueryData(['payment-gateway'], res.data.data);
      setBanner({ type: 'success', msg: 'Gateway disconnected.' });
    },
    onError: () => setBanner({ type: 'error', msg: 'Failed to disconnect gateway.' }),
  });

  const CardIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h5M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
    </svg>
  );

  return (
    <Section icon={CardIcon} title="Payment Gateway" desc="Bring your own Stripe or Safepay account — students pay you directly, the platform never touches the money.">
      {banner && (
        <div className={cn('flex items-start gap-3 rounded-xl px-4 py-3 text-sm',
          banner.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700')}>
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {banner.type === 'success'
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>}
          </svg>
          <span className="flex-1">{banner.msg}</span>
          <button onClick={() => setBanner(null)} className="text-current opacity-50 hover:opacity-100">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-1"><Spinner size="sm" /> Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(['none', 'stripe', 'safepay'] as const).map(p => {
              const isActive = p !== 'none' && data?.activeProvider === p;
              return (
                <button key={p} type="button" onClick={() => setTab(p)}
                  className={cn('px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors',
                    tab === p ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                  {p === 'none' ? 'None' : p === 'stripe' ? 'Stripe' : 'Safepay'}
                  {isActive && <span className="ml-1.5 text-[10px] text-green-600">● active</span>}
                </button>
              );
            })}
          </div>

          {tab === 'none' && (
            <p className="text-xs text-gray-400">
              No gateway configured — course purchases run in demo mode (no real charge). Pick Stripe or Safepay above to accept real payments.
            </p>
          )}

          {tab === 'stripe' && (
            <div className="space-y-4 bg-gray-50 rounded-xl border border-gray-200 p-4">
              {data?.stripe.verified ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Verified · last checked {data.stripe.verifiedAt ? new Date(data.stripe.verifiedAt).toLocaleDateString() : ''}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Not verified yet — paste your keys and Save
                </div>
              )}
              <div>
                <label className={labelCls}>Publishable Key</label>
                <input type="text" className={inputCls} value={stripePublishableKey}
                  onChange={e => setStripePublishableKey(e.target.value)} placeholder="pk_live_..." />
              </div>
              <div>
                <label className={labelCls}>
                  Secret Key {data?.stripe.hasSecretKey && <span className="font-normal normal-case text-gray-400">(blank = keep existing)</span>}
                </label>
                <input type="password" className={inputCls} value={stripeSecretKey}
                  onChange={e => setStripeSecretKey(e.target.value)}
                  placeholder={data?.stripe.hasSecretKey ? '••••••••••••••••' : 'sk_live_...'} />
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" loading={saveStripeMutation.isPending}
                  disabled={!stripePublishableKey || (!stripeSecretKey && !data?.stripe.hasSecretKey)}
                  onClick={() => { setBanner(null); saveStripeMutation.mutate(); }}>
                  Save &amp; Verify
                </Button>
                {data?.activeProvider === 'stripe' && (
                  <Button size="sm" variant="outline" onClick={() => disconnectMutation.mutate('stripe')} loading={disconnectMutation.isPending}>
                    Disconnect
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-400">Student payments go directly to your Stripe account — the platform takes no cut.</p>
            </div>
          )}

          {tab === 'safepay' && (
            <div className="space-y-4 bg-gray-50 rounded-xl border border-gray-200 p-4">
              {data?.safepay.verified ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Verified · confirmed via a completed payment {data.safepay.verifiedAt ? `on ${new Date(data.safepay.verifiedAt).toLocaleDateString()}` : ''}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Saved — will verify automatically on your first live payment
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Merchant API Key</label>
                  <input type="text" className={inputCls} value={safepayApiKey}
                    onChange={e => setSafepayApiKey(e.target.value)} placeholder="sec_..." />
                </div>
                <div>
                  <label className={labelCls}>Environment</label>
                  <select className={inputCls} value={safepayEnv} onChange={e => setSafepayEnv(e.target.value as 'sandbox' | 'production')}>
                    <option value="sandbox">Sandbox</option>
                    <option value="production">Production</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>
                  Secret Key {data?.safepay.hasSecretKey && <span className="font-normal normal-case text-gray-400">(blank = keep existing)</span>}
                </label>
                <input type="password" className={inputCls} value={safepaySecretKey}
                  onChange={e => setSafepaySecretKey(e.target.value)}
                  placeholder={data?.safepay.hasSecretKey ? '••••••••••••••••' : 'Secret key'} />
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" loading={saveSafepayMutation.isPending}
                  disabled={!safepayApiKey || (!safepaySecretKey && !data?.safepay.hasSecretKey)}
                  onClick={() => { setBanner(null); saveSafepayMutation.mutate(); }}>
                  Save
                </Button>
                {data?.activeProvider === 'safepay' && (
                  <Button size="sm" variant="outline" onClick={() => disconnectMutation.mutate('safepay')} loading={disconnectMutation.isPending}>
                    Disconnect
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-400">Student payments are collected via Safepay's hosted checkout and settle directly to your account.</p>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function StudentSettings() {
  const qc = useQueryClient();
  const { user: authUser, setUser } = useAuthStore();

  const [profileSaved, setProfileSaved]   = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [profileError, setProfileError]   = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Avatar upload
  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState('');

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [bio,       setBio]       = useState('');

  // Password form
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd,    setShowPwd]    = useState(false);

  // Active sessions
  const { data: sessions = [] } = useQuery<Array<{
    sessionId: string; deviceInfo: { userAgent?: string; ip?: string }; lastUsedAt: string; isCurrent?: boolean;
  }>>({
    queryKey: ['my-sessions'],
    queryFn: async () => { const { data } = await api.get('/users/me/sessions'); return data.data.sessions; },
  });

  useEffect(() => {
    if (authUser) {
      setFirstName(authUser.firstName ?? '');
      setLastName(authUser.lastName ?? '');
    }
  }, [authUser]);

  // Profile mutation
  const profileMutation = useMutation({
    mutationFn: () => api.patch('/users/me', { firstName: firstName.trim(), lastName: lastName.trim() }),
    onSuccess: (res) => {
      const updated = res.data?.data?.user;
      if (updated && setUser) setUser(updated);
      qc.invalidateQueries({ queryKey: ['me'] });
      setProfileSaved(true);
      setProfileError('');
      setTimeout(() => setProfileSaved(false), 3000);
    },
    onError: (err: any) => setProfileError(err.response?.data?.message ?? 'Failed to update profile'),
  });

  // Password mutation
  const passwordMutation = useMutation({
    mutationFn: () => api.patch('/users/me/password', { currentPassword: currentPwd, newPassword: newPwd }),
    onSuccess: () => {
      setPasswordSaved(true);
      setPasswordError('');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
      setTimeout(() => setPasswordSaved(false), 3000);
    },
    onError: (err: any) => setPasswordError(err.response?.data?.message ?? 'Failed to change password'),
  });

  // Avatar mutations
  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('avatar', file);
      return api.post('/users/me/avatar', fd);
    },
    onSuccess: (res) => {
      const updated = res.data?.data?.user;
      if (updated && setUser) setUser(updated);
      qc.invalidateQueries({ queryKey: ['me'] });
      setAvatarError('');
    },
    onError: (e: any) => setAvatarError(e.response?.data?.message ?? 'Upload failed'),
  });

  const deleteAvatarMutation = useMutation({
    mutationFn: () => api.delete('/users/me/avatar'),
    onSuccess: (res) => {
      const updated = res.data?.data?.user;
      if (updated && setUser) setUser(updated);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e: any) => setAvatarError(e.response?.data?.message ?? 'Remove failed'),
  });

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    uploadAvatarMutation.mutate(file);
    e.target.value = '';
  }

  // Session revoke
  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(`/users/me/sessions/${sessionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-sessions'] }),
  });

  function handlePassword() {
    setPasswordError('');
    if (!currentPwd) { setPasswordError('Enter your current password'); return; }
    if (newPwd.length < 8) { setPasswordError('New password must be at least 8 characters'); return; }
    if (newPwd !== confirmPwd) { setPasswordError('Passwords do not match'); return; }
    passwordMutation.mutate();
  }

  function getDeviceLabel(ua?: string) {
    if (!ua) return 'Unknown device';
    if (/mobile/i.test(ua)) return '📱 Mobile Browser';
    if (/chrome/i.test(ua)) return '💻 Chrome';
    if (/firefox/i.test(ua)) return '🦊 Firefox';
    if (/safari/i.test(ua)) return '🧭 Safari';
    return '🖥️ Browser';
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Header with avatar upload */}
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          {authUser?.avatar ? (
            <img
              src={authUser.avatar}
              alt="Profile photo"
              className="w-16 h-16 rounded-2xl object-cover shadow border border-gray-200"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center text-white text-2xl font-bold shadow">
              {firstName.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <button
            type="button"
            onClick={() => avatarRef.current?.click()}
            disabled={uploadAvatarMutation.isPending}
            className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-white border border-gray-300 rounded-full flex items-center justify-center shadow hover:bg-gray-50 transition-colors"
            title="Change photo"
          >
            {uploadAvatarMutation.isPending ? (
              <Spinner size="sm" />
            ) : (
              <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            )}
          </button>
          <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">{authUser?.email}</p>
          <div className="flex items-center gap-3 mt-1">
            <button type="button" onClick={() => avatarRef.current?.click()} disabled={uploadAvatarMutation.isPending}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors">
              {authUser?.avatar ? 'Change photo' : 'Upload photo'}
            </button>
            {authUser?.avatar && (
              <button type="button" onClick={() => deleteAvatarMutation.mutate()} disabled={deleteAvatarMutation.isPending}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                Remove
              </button>
            )}
          </div>
          {avatarError && <p className="text-xs text-red-500 mt-0.5">{avatarError}</p>}
        </div>
      </div>

      {/* ── Profile ── */}
      <Section
        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
        title="Profile"
        desc="Your public name and info"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>First Name</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} placeholder="First name" />
          </div>
          <div>
            <label className={labelCls}>Last Name</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} placeholder="Last name" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Email <span className="normal-case font-normal text-gray-400">(cannot be changed)</span></label>
          <input value={authUser?.email ?? ''} disabled className={cn(inputCls, 'opacity-60 cursor-not-allowed')} />
        </div>
        {profileError && <p className="text-sm text-red-500">{profileError}</p>}
        <div className="flex items-center gap-3">
          <Button loading={profileMutation.isPending} onClick={() => profileMutation.mutate()}>Save Profile</Button>
          {profileSaved && <SavedBadge />}
        </div>
      </Section>

      {/* ── Security ── */}
      <Section
        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>}
        title="Security"
        desc="Change your password"
      >
        <div>
          <label className={labelCls}>Current Password</label>
          <div className="relative">
            <input type={showPwd ? 'text' : 'password'} value={currentPwd} onChange={e => setCurrentPwd(e.target.value)}
              className={cn(inputCls, 'pr-10')} placeholder="Enter current password" />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPwd
                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              }
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>New Password</label>
            <input type={showPwd ? 'text' : 'password'} value={newPwd} onChange={e => setNewPwd(e.target.value)}
              className={inputCls} placeholder="Min 8 characters" />
          </div>
          <div>
            <label className={labelCls}>Confirm Password</label>
            <input type={showPwd ? 'text' : 'password'} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
              className={inputCls} placeholder="Repeat new password" />
          </div>
        </div>
        {/* Password strength */}
        {newPwd.length > 0 && (
          <div>
            <div className="flex gap-1 mb-1">
              {[1,2,3,4].map(i => (
                <div key={i} className={cn('flex-1 h-1.5 rounded-full transition-colors',
                  newPwd.length >= i * 3
                    ? i <= 1 ? 'bg-red-400' : i <= 2 ? 'bg-amber-400' : i <= 3 ? 'bg-blue-400' : 'bg-emerald-500'
                    : 'bg-gray-100')} />
              ))}
            </div>
            <p className="text-xs text-gray-400">
              {newPwd.length < 6 ? 'Too short' : newPwd.length < 8 ? 'Weak' : newPwd.length < 12 ? 'Good' : 'Strong'}
            </p>
          </div>
        )}
        {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
        <div className="flex items-center gap-3">
          <Button loading={passwordMutation.isPending} onClick={handlePassword}>Change Password</Button>
          {passwordSaved && <SavedBadge />}
        </div>
      </Section>

      {/* ── Active Sessions ── */}
      <Section
        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2"/></svg>}
        title="Active Sessions"
        desc="Devices where you're currently logged in"
      >
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No active sessions found</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sessions.map(s => (
              <div key={s.sessionId} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-sm">
                    {s.isCurrent ? '🟢' : '💻'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {getDeviceLabel(s.deviceInfo?.userAgent)}
                      {s.isCurrent && <span className="ml-2 text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-bold">Current</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      {s.deviceInfo?.ip && `IP: ${s.deviceInfo.ip} · `}
                      Last active: {new Date(s.lastUsedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!s.isCurrent && (
                  <button onClick={() => revokeMutation.mutate(s.sessionId)}
                    disabled={revokeMutation.isPending}
                    className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50">
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Account Info ── */}
      <Section
        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        title="Account Info"
        desc="Read-only account details"
      >
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Role',       value: authUser?.role?.replace('_', ' ') ?? '—' },
            { label: 'Status',     value: authUser?.status ?? '—' },
            { label: 'Member Since', value: authUser?.createdAt ? new Date(authUser.createdAt).toLocaleDateString() : '—' },
            { label: 'Last Login', value: authUser?.lastLoginAt ? new Date(authUser.lastLoginAt).toLocaleString() : '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <label className={labelCls}>{label}</label>
              <p className="text-sm text-gray-800 capitalize bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">{value}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 2FA ── */}
      <TwoFASection />

      {/* ── Zoom status (read-only for instructors) ── */}
      {authUser?.role === 'instructor' && <InstructorZoomStatus />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN SETTINGS (existing)
// ═══════════════════════════════════════════════════════════════════════════════

interface TenantSettings {
  logo?: string; favicon?: string; primaryColor: string; secondaryColor: string; fontFamily: string; language: string; timezone: string;
  allowSelfRegistration: boolean; requireEmailVerification: boolean; idleTimeoutMinutes: number;
  defaultInviteExpiryHours: number; currency: string; refundWindowDays: number;
  taxRate: number; taxLabel: string;
}

interface FeatureFlags {
  liveClasses: boolean; certificates: boolean; assignments: boolean;
  announcements: boolean; payments: boolean; forums: boolean;
}
interface Tenant { _id: string; name: string; subdomain: string; settings: TenantSettings; }
interface Plan { name: string; slug: string; limits: { students: number; instructors: number; courses: number; storageGB: number; }; }
interface PlanInfo { plan: Plan; status: string; isOnTrial: boolean; trialEndsAt?: string; planExpiresAt?: string; }
interface StorageInfo { usedBytes: number; usedGB: number; limitGB: number; limitBytes: number; percentUsed: number; }

const LANGUAGES = [
  { value: 'en', label: 'English' }, { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' }, { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' }, { value: 'pt', label: 'Portuguese' },
  { value: 'ur', label: 'Urdu' },
];
const TIMEZONES = ['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Paris','Europe/Berlin','Asia/Dubai','Asia/Karachi','Asia/Kolkata','Asia/Dhaka','Asia/Singapore','Asia/Tokyo','Australia/Sydney','Africa/Cairo'];

function StorageBar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary-500';
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL SETTINGS SECTION (tenant admin only)
// ═══════════════════════════════════════════════════════════════════════════════

interface EmailSmtp {
  host: string | null; port: number; secure: boolean;
  user: string | null; hasPassword: boolean; verified: boolean; verifiedAt: string | null;
}
interface EmailSettingsData {
  fromName: string | null; fromEmail: string | null; replyTo: string | null; smtp: EmailSmtp;
}

function EmailSettingsSection() {
  const qc = useQueryClient();
  const [saved,       setSaved]       = useState(false);
  const [showSmtp,    setShowSmtp]    = useState(false);
  const [testEmail,   setTestEmail]   = useState('');
  const [testResult,  setTestResult]  = useState<{ ok: boolean; msg: string } | null>(null);

  // Branding fields
  const [fromName,  setFromName]  = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo,   setReplyTo]   = useState('');

  // SMTP fields
  const [host,     setHost]     = useState('');
  const [port,     setPort]     = useState(587);
  const [secure,   setSecure]   = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [password, setPassword] = useState('');

  const { data, isLoading } = useQuery<EmailSettingsData>({
    queryKey: ['email-settings'],
    queryFn: async () => { const { data } = await api.get('/tenant/email-settings'); return data.data; },
  });

  useEffect(() => {
    if (!data) return;
    setFromName(data.fromName   || '');
    setFromEmail(data.fromEmail || '');
    setReplyTo(data.replyTo     || '');
    setHost(data.smtp.host      || '');
    setPort(data.smtp.port      || 587);
    setSecure(data.smtp.secure  || false);
    setSmtpUser(data.smtp.user  || '');
    setShowSmtp(!!(data.smtp.host || data.smtp.user));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.put('/tenant/email-settings', {
      fromName:  fromName  || null,
      fromEmail: fromEmail || null,
      replyTo:   replyTo   || null,
      smtp: showSmtp
        ? { host, port, secure, user: smtpUser, ...(password ? { password } : {}) }
        : { host: null, user: null },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-settings'] });
      setSaved(true); setPassword('');
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.post('/tenant/email-settings/test', {
      host, port, secure, user: smtpUser,
      ...(password ? { password } : {}),
      fromEmail: fromEmail || smtpUser,
      toEmail: testEmail,
    }),
    onSuccess: (res) => setTestResult({ ok: true,  msg: res.data?.message ?? 'Test email sent!' }),
    onError:   (err: any) => setTestResult({ ok: false, msg: err.response?.data?.message ?? 'Connection failed' }),
  });

  if (isLoading) return null;

  const smtp = data?.smtp;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">Email Settings</p>
          <p className="text-xs text-gray-400">Branding + optional custom SMTP — platform SMTP used as fallback</p>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* ── Branding ── */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Email Branding</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>From Name</label>
              <input type="text" className={inputCls} value={fromName} onChange={e => setFromName(e.target.value)} placeholder="e.g. Sunrise Academy" />
            </div>
            <div>
              <label className={labelCls}>From Email</label>
              <input type="email" className={inputCls} value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="no-reply@yourdomain.com" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Reply-To <span className="font-normal normal-case text-gray-400">(optional)</span></label>
              <input type="email" className={inputCls} value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="support@yourdomain.com" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Emails will show your brand name and address. Platform SMTP handles delivery unless custom SMTP is configured below.</p>
        </div>

        {/* ── Custom SMTP toggle ── */}
        <div className="border-t border-gray-100 pt-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-sm font-semibold text-gray-800">Custom SMTP Server</p>
              <p className="text-xs text-gray-400">Use your own email server instead of the platform default</p>
            </div>
            <Toggle checked={showSmtp} onChange={v => { setShowSmtp(v); setTestResult(null); }} />
          </div>

          {showSmtp && (
            <div className="mt-4 space-y-4 bg-gray-50 rounded-xl border border-gray-200 p-4">

              {/* Verification badge */}
              {smtp?.verified ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Verified · last tested {smtp.verifiedAt ? new Date(smtp.verifiedAt).toLocaleDateString() : ''}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Not verified — fill in details and use "Test Connection" below
                </div>
              )}

              {/* Host + Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>SMTP Host</label>
                  <input type="text" className={inputCls} value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.gmail.com" />
                </div>
                <div>
                  <label className={labelCls}>Port</label>
                  <input type="number" className={inputCls} value={port} onChange={e => setPort(parseInt(e.target.value) || 587)} />
                </div>
              </div>

              {/* User + Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Username</label>
                  <input type="text" className={inputCls} value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="you@gmail.com" />
                </div>
                <div>
                  <label className={labelCls}>
                    Password {smtp?.hasPassword && <span className="font-normal normal-case text-gray-400">(blank = keep existing)</span>}
                  </label>
                  <input type="password" className={inputCls} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={smtp?.hasPassword ? '••••••••••••••••' : 'App password'} />
                </div>
              </div>

              {/* SSL toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-gray-800">Use SSL / TLS</p>
                  <p className="text-xs text-gray-400">Enable for port 465, leave off for port 587 (STARTTLS)</p>
                </div>
                <Toggle checked={secure} onChange={setSecure} />
              </div>

              {/* Quick-fill presets */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Quick presets:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Gmail',     host: 'smtp.gmail.com',     port: 587, secure: false },
                    { label: 'Outlook',   host: 'smtp.office365.com', port: 587, secure: false },
                    { label: 'Mailgun',   host: 'smtp.mailgun.org',   port: 587, secure: false },
                    { label: 'SendGrid',  host: 'smtp.sendgrid.net',  port: 587, secure: false },
                  ].map(p => (
                    <button key={p.label} type="button"
                      onClick={() => { setHost(p.host); setPort(p.port); setSecure(p.secure); }}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:border-primary-300 hover:text-primary-600 transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Test connection */}
              <div className="border-t border-gray-200 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Test Connection</p>
                <div className="flex gap-2">
                  <input type="email" className={`${inputCls} flex-1`} value={testEmail}
                    onChange={e => setTestEmail(e.target.value)} placeholder="Send test email to…" />
                  <Button size="sm" variant="outline"
                    disabled={!testEmail || !host || !smtpUser || testMutation.isPending}
                    loading={testMutation.isPending}
                    onClick={() => { setTestResult(null); testMutation.mutate(); }}>
                    Test
                  </Button>
                </div>
                {testResult && (
                  <p className={cn('text-xs mt-2 font-medium flex items-center gap-1.5', testResult.ok ? 'text-green-600' : 'text-red-600')}>
                    {testResult.ok ? '✅' : '❌'} {testResult.msg}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Save row */}
        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            Save Email Settings
          </Button>
          {saved && <SavedBadge />}
          {saveMutation.isError && (
            <span className="text-sm text-red-600">
              {(saveMutation.error as any)?.response?.data?.message ?? 'Failed to save — please try again'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Password Policy section (tenant_admin) ───────────────────────────────────

interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
}

function PasswordPolicySection() {
  const qc = useQueryClient();
  const [saved, setSavedFlag] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicy>({
    minLength: 8, requireUppercase: true, requireLowercase: true,
    requireNumbers: true, requireSymbols: false,
  });

  const { data: tenant } = useQuery<{ settings?: { passwordPolicy?: PasswordPolicy } }>({
    queryKey: ['tenant'],
    queryFn: async () => { const { data } = await api.get('/tenant'); return data.data.tenant ?? data.data; },
  });

  useEffect(() => {
    if (tenant?.settings?.passwordPolicy) setPolicy(p => ({ ...p, ...tenant.settings!.passwordPolicy }));
  }, [tenant]);

  const saveMut = useMutation({
    mutationFn: () => api.patch('/tenant/settings', { passwordPolicy: policy }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant'] });
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 3000);
    },
  });

  const set = <K extends keyof PasswordPolicy>(key: K, val: PasswordPolicy[K]) =>
    setPolicy(p => ({ ...p, [key]: val }));

  const TOGGLES: { key: Exclude<keyof PasswordPolicy, 'minLength'>; label: string }[] = [
    { key: 'requireUppercase', label: 'Require uppercase letter (A–Z)' },
    { key: 'requireLowercase', label: 'Require lowercase letter (a–z)' },
    { key: 'requireNumbers',   label: 'Require number (0–9)' },
    { key: 'requireSymbols',   label: 'Require symbol (!@#$…)' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Password Policy</h2>
      <p className="text-xs text-gray-500">Applied when users register or reset their password.</p>

      <div className="flex items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Minimum length</label>
          <input
            type="number" min={6} max={64} value={policy.minLength}
            onChange={e => set('minLength', Math.min(64, Math.max(6, parseInt(e.target.value) || 6)))}
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <p className="text-xs text-gray-400 mt-5">characters</p>
      </div>

      <div className="space-y-3">
        {TOGGLES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between py-1 border-t border-gray-50">
            <p className="text-sm text-gray-700">{label}</p>
            <Toggle checked={policy[key] as boolean} onChange={v => set(key, v as PasswordPolicy[typeof key])} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>Save Password Policy</Button>
        {saved && <SavedBadge />}
      </div>
    </div>
  );
}

// ─── Auth Audit Log section (tenant_admin) ────────────────────────────────────

interface AuditEntry {
  _id: string;
  email: string | null;
  event: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  login:                 '✅ Login',
  login_google:          '🔵 Google login',
  failed_login:          '❌ Failed login',
  logout:                '🚪 Logout',
  logout_all:            '🚪 Logout all',
  register:              '👤 Register',
  register_tenant:       '🏫 Org registered',
  email_verified:        '✉️ Email verified',
  password_reset_request:'🔑 Password reset req.',
  password_reset:        '🔑 Password reset',
  account_locked:        '🔒 Account locked',
  '2fa_enabled':         '🛡 2FA enabled',
  '2fa_disabled':        '⚠️ 2FA disabled',
  '2fa_verify_failed':   '⚠️ 2FA failed',
};

function AuthAuditLogSection() {
  const [eventFilter, setEventFilter] = useState('');
  const [skip, setSkip] = useState(0);
  const limit = 20;

  const { data: logs = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: ['auth-audit-logs', eventFilter, skip],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
      if (eventFilter) params.set('event', eventFilter);
      const { data } = await api.get(`/auth/audit-logs?${params}`);
      return data.data;
    },
    staleTime: 30_000,
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div>
          <p className="text-sm font-bold text-gray-800">Auth Audit Log</p>
          <p className="text-xs text-gray-400">Permanent security log — logins, failures, lockouts</p>
        </div>
        <select value={eventFilter} onChange={e => { setEventFilter(e.target.value); setSkip(0); }}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white">
          <option value="">All events</option>
          {Object.keys(EVENT_LABELS).map(e => (
            <option key={e} value={e}>{EVENT_LABELS[e]}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="sm" /></div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No log entries found</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Event</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Email</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500">IP</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(entry => (
                  <tr key={entry._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                      {EVENT_LABELS[entry.event] ?? entry.event}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{entry.email ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono">{entry.ip ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <button disabled={skip === 0} onClick={() => setSkip(s => Math.max(0, s - limit))}
              className="text-xs text-primary-600 hover:text-primary-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium">
              ← Previous
            </button>
            <span className="text-xs text-gray-400">Showing {skip + 1}–{skip + logs.length}</span>
            <button disabled={logs.length < limit} onClick={() => setSkip(s => s + limit)}
              className="text-xs text-primary-600 hover:text-primary-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium">
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const FLAG_META: { key: keyof FeatureFlags; label: string; desc: string }[] = [
  { key: 'liveClasses',   label: 'Live Classes',   desc: 'Zoom/live lesson scheduling for instructors' },
  { key: 'certificates',  label: 'Certificates',   desc: 'Issue completion certificates to students' },
  { key: 'assignments',   label: 'Assignments',    desc: 'Assignment submission and grading system' },
  { key: 'announcements', label: 'Announcements',  desc: 'Course and platform-wide announcements' },
  { key: 'payments',      label: 'Payments',       desc: 'Paid courses and Stripe Connect revenue' },
  { key: 'forums',        label: 'Forums',         desc: 'Discussion forums per course (beta)' },
];

function FeatureFlagsSection() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [local, setLocal] = useState<FeatureFlags | null>(null);

  const { data, isLoading } = useQuery<FeatureFlags>({
    queryKey: ['feature-flags'],
    queryFn: async () => { const { data } = await api.get('/tenant/feature-flags'); return data.data.featureFlags; },
  });

  useEffect(() => { if (data) setLocal(data); }, [data]);

  const mutation = useMutation({
    mutationFn: (flags: FeatureFlags) => api.patch('/tenant/feature-flags', flags),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feature-flags'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading || !local) return null;

  const toggle = (key: keyof FeatureFlags) =>
    setLocal(f => f ? { ...f, [key]: !f[key] } : f);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">Feature Flags</p>
          <p className="text-xs text-gray-400">Enable or disable platform modules for your organisation</p>
        </div>
      </div>
      <div className="p-6 space-y-1">
        {FLAG_META.map(({ key, label, desc }, i) => (
          <div key={key}>
            {i > 0 && <div className="border-t border-gray-50 my-1" />}
            <div className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <Toggle checked={local[key]} onChange={() => toggle(key)} />
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-100 mt-2">
          <Button onClick={() => mutation.mutate(local)} loading={mutation.isPending}>
            Save Feature Flags
          </Button>
          {saved && <SavedBadge />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STOREFRONT VISIBILITY SECTION
// ═══════════════════════════════════════════════════════════════════════════════

interface Category { _id: string; name: string; }
interface StorefrontCourse { _id: string; title: string; thumbnail?: string; categoryId?: { _id: string; name: string } | null; showOnStorefront: boolean; }

function StorefrontSection() {
  const qc = useQueryClient();

  const { data: catData } = useQuery({
    queryKey: ['categories-storefront'],
    queryFn: async () => { const { data } = await api.get('/courses/categories'); return data.data.categories as Category[]; },
  });

  const { data: courseData } = useQuery({
    queryKey: ['courses-storefront'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=200&status=published');
      return data.data.courses as StorefrontCourse[];
    },
  });

  const { data: tenantData } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => { const { data } = await api.get('/tenant'); return data.data.tenant ?? data.data; },
  });

  const [hiddenCats, setHiddenCats] = useState<string[]>([]);
  useEffect(() => {
    const saved = (tenantData as any)?.settings?.storefront?.hiddenCategories ?? [];
    setHiddenCats(saved.map((id: any) => id.toString()));
  }, [tenantData]);

  const catMutation = useMutation({
    mutationFn: (ids: string[]) => api.patch('/tenant/settings', { storefront: { hiddenCategories: ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant'] }),
  });

  const courseMutation = useMutation({
    mutationFn: ({ id, show }: { id: string; show: boolean }) =>
      api.patch(`/courses/${id}/storefront`, { showOnStorefront: show }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses-storefront'] }),
  });

  const toggleCategory = (id: string) => {
    const next = hiddenCats.includes(id) ? hiddenCats.filter(x => x !== id) : [...hiddenCats, id];
    setHiddenCats(next);
    catMutation.mutate(next);
  };

  const categories = catData ?? [];
  const courses    = courseData ?? [];

  return (
    <Section
      icon={
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      }
      title="Storefront Visibility"
      desc="Control which courses and categories appear on your public site."
    >
      {/* Category visibility */}
      {categories.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Category visibility</p>
          <div className="space-y-2">
            {categories.map(cat => {
              const hidden = hiddenCats.includes(cat._id);
              return (
                <div key={cat._id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                  <span className="text-sm text-gray-800">{cat.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{hidden ? 'Hidden' : 'Visible'}</span>
                    <Toggle checked={!hidden} onChange={() => toggleCategory(cat._id)} />
                  </div>
                </div>
              );
            })}
          </div>
          {catMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to save category visibility.</p>}
        </div>
      )}

      {/* Per-course visibility */}
      {courses.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Course visibility</p>
          <div className="space-y-2">
            {courses.map(course => {
              const isCatHidden = course.categoryId ? hiddenCats.includes(course.categoryId._id) : false;
              const visible = course.showOnStorefront !== false;
              return (
                <div
                  key={course._id}
                  className={cn('flex items-center justify-between rounded-lg px-4 py-2.5 border', isCatHidden ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-transparent')}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {course.thumbnail ? (
                      <img src={course.thumbnail} className="w-10 h-7 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-7 bg-gray-200 rounded flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{course.title}</p>
                      {course.categoryId && (
                        <p className="text-xs text-gray-400 truncate">{course.categoryId.name}{isCatHidden && ' · category hidden'}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">{visible ? 'Visible' : 'Hidden'}</span>
                    <Toggle
                      checked={visible}
                      onChange={v => courseMutation.mutate({ id: course._id, show: v })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {courses.length === 0 && categories.length === 0 && (
        <p className="text-sm text-gray-400 italic">No published courses yet. Publish a course to manage storefront visibility.</p>
      )}
    </Section>
  );
}

const SETTINGS_TABS = [
  { key: 'general',      label: 'General' },
  { key: 'storefront',   label: 'Storefront' },
  { key: 'email',        label: 'Email' },
  { key: 'security',     label: 'Security' },
  { key: 'features',     label: 'Features' },
  { key: 'integrations', label: 'Integrations' },
] as const;
type SettingsTab = typeof SETTINGS_TABS[number]['key'];

function AdminSettings() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const { data: tenant, isLoading: tenantLoading } = useQuery<Tenant>({
    queryKey: ['tenant'],
    queryFn: async () => { const { data } = await api.get('/tenant'); return data.data.tenant ?? data.data; },
  });
  const { data: plan } = useQuery<PlanInfo>({
    queryKey: ['tenant-plan'],
    queryFn: async () => { const { data } = await api.get('/tenant/plan'); return data.data; },
  });
  const { data: storage } = useQuery<StorageInfo>({
    queryKey: ['tenant-storage'],
    queryFn: async () => { const { data } = await api.get('/tenant/storage'); return data.data; },
  });

  const [form, setForm] = useState<TenantSettings>({ primaryColor: '#3B82F6', secondaryColor: '#8B5CF6', fontFamily: 'Inter', language: 'en', timezone: 'UTC', allowSelfRegistration: true, requireEmailVerification: true, idleTimeoutMinutes: 0, defaultInviteExpiryHours: 72, currency: 'USD', refundWindowDays: 30, taxRate: 0, taxLabel: 'Tax' });
  useEffect(() => {
    if (tenant?.settings) setForm({ primaryColor: tenant.settings.primaryColor ?? '#3B82F6', secondaryColor: (tenant.settings as any).secondaryColor ?? '#8B5CF6', fontFamily: (tenant.settings as any).fontFamily ?? 'Inter', language: tenant.settings.language ?? 'en', timezone: tenant.settings.timezone ?? 'UTC', allowSelfRegistration: tenant.settings.allowSelfRegistration ?? true, requireEmailVerification: tenant.settings.requireEmailVerification ?? true, idleTimeoutMinutes: tenant.settings.idleTimeoutMinutes ?? 0, defaultInviteExpiryHours: (tenant.settings as any).defaultInviteExpiryHours ?? 72, currency: (tenant.settings as any).currency ?? 'USD', refundWindowDays: (tenant.settings as any).refundWindowDays ?? 30, taxRate: (tenant.settings as any).taxRate ?? 0, taxLabel: (tenant.settings as any).taxLabel ?? 'Tax' });
  }, [tenant]);

  const mutation = useMutation({
    mutationFn: async (settings: TenantSettings) => { await api.patch('/tenant/settings', settings); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant'] }); setSaved(true); setTimeout(() => setSaved(false), 3000); },
  });

  // ── Logo ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');

  // ── Favicon ──
  const faviconRef = useRef<HTMLInputElement>(null);
  const [faviconError, setFaviconError] = useState('');

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('logo', file);
      return api.post('/tenant/logo', fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant'] });
      qc.invalidateQueries({ queryKey: ['tenant-settings-brand'] });
      setLogoUploading(false);
      setLogoError('');
    },
    onError: (err: any) => {
      setLogoUploading(false);
      setLogoError(err.response?.data?.message ?? 'Upload failed');
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: () => api.delete('/tenant/logo'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant'] });
      qc.invalidateQueries({ queryKey: ['tenant-settings-brand'] });
    },
  });

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoError('');
    logoUploadMutation.mutate(file);
    e.target.value = '';
  }

  const faviconUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('favicon', file);
      return api.post('/tenant/favicon', fd);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant'] }); setFaviconError(''); },
    onError: (err: any) => setFaviconError(err.response?.data?.message ?? 'Upload failed'),
  });

  const removeFaviconMutation = useMutation({
    mutationFn: () => api.delete('/tenant/favicon'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant'] }),
  });

  function handleFaviconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaviconError('');
    faviconUploadMutation.mutate(file);
    e.target.value = '';
  }

  const set = <K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) => setForm(f => ({ ...f, [key]: value }));

  if (tenantLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1 ml-[46px]">Manage your organisation settings</p>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {SETTINGS_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              activeTab === t.key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
      <>
      <Section
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
        title="Organisation"
        desc="Your school's identity on Coursel"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Organisation Name</label>
            <p className="text-sm text-gray-900 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">{tenant?.name ?? '—'}</p>
          </div>
          <div>
            <label className={labelCls}>Subdomain</label>
            <p className="text-sm text-gray-900 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">{tenant?.subdomain ?? '—'}</p>
          </div>
        </div>
      </Section>

      {plan && (
        <Section
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          }
          title="Plan"
          desc="Your subscription tier and usage"
        >
          <div className="flex items-center gap-3 mb-1">
            <span className="text-base font-semibold text-gray-900">{plan.plan?.name ?? '—'}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', plan.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700')}>{plan.isOnTrial ? 'Trial' : plan.status}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {[{ label: 'student limit', value: plan.plan?.limits?.students === -1 ? '∞' : plan.plan?.limits?.students ?? '—' }, { label: 'course limit', value: plan.plan?.limits?.courses === -1 ? '∞' : plan.plan?.limits?.courses ?? '—' }, { label: 'storage limit', value: `${plan.plan?.limits?.storageGB ?? '—'} GB` }].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl border border-gray-100 p-3.5 text-center">
                <p className="text-2xl font-extrabold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {storage && (
            <div className="pt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Storage used</span><span>{formatBytes(storage.usedBytes)} / {storage.limitGB} GB</span>
              </div>
              <StorageBar used={storage.usedBytes} max={storage.limitBytes} />
              <p className="text-xs text-gray-400 mt-1">{storage.percentUsed ?? 0}% used</p>
            </div>
          )}
        </Section>
      )}

      <Section
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8.5" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.5 12h17M12 3.5c2.2 2.6 3.4 5.6 3.4 8.5s-1.2 5.9-3.4 8.5c-2.2-2.6-3.4-5.6-3.4-8.5S9.8 6.1 12 3.5z" />
          </svg>
        }
        title="Regional & Billing"
        desc="Language, timezone, currency and tax defaults"
      >
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Language</label>
            <select value={form.language} onChange={e => set('language', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Timezone</label>
            <select value={form.timezone} onChange={e => set('timezone', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Payment Currency</label>
            <select value={form.currency} onChange={e => set('currency', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
              {[
                { code: 'USD', label: 'USD — US Dollar' },
                { code: 'EUR', label: 'EUR — Euro' },
                { code: 'GBP', label: 'GBP — British Pound' },
                { code: 'CAD', label: 'CAD — Canadian Dollar' },
                { code: 'AUD', label: 'AUD — Australian Dollar' },
                { code: 'SGD', label: 'SGD — Singapore Dollar' },
                { code: 'AED', label: 'AED — UAE Dirham' },
                { code: 'INR', label: 'INR — Indian Rupee' },
                { code: 'BRL', label: 'BRL — Brazilian Real' },
                { code: 'MXN', label: 'MXN — Mexican Peso' },
                { code: 'NGN', label: 'NGN — Nigerian Naira' },
                { code: 'PKR', label: 'PKR — Pakistani Rupee' },
              ].map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">All course prices will be charged in this currency.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Refund Window (days)</label>
            <input
              type="number" min={0} max={365}
              value={form.refundWindowDays}
              onChange={e => set('refundWindowDays', Math.max(0, Math.min(365, Number(e.target.value))))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">Students can request refunds within this many days of purchase. Set 0 to disable the window (always allow).</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Tax Rate (%)</label>
            <input
              type="number" min={0} max={100} step={0.01}
              value={form.taxRate}
              onChange={e => set('taxRate', Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">Applied to all subscription invoices. Set 0 to disable tax.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Tax Label</label>
            <input
              type="text" maxLength={20}
              value={form.taxLabel}
              onChange={e => set('taxLabel', e.target.value)}
              placeholder="e.g. VAT, GST, Sales Tax"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">Shown on invoices next to the tax line (e.g. "VAT 20%").</p>
          </div>
        </div>
      </Section>

      <Section
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
        title="Branding"
        desc="Logo, favicon and brand colors shown across your school"
      >
        {/* ── Logo ── */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Logo</label>
          <div className="flex items-center gap-4">
            {tenant?.settings?.logo ? (
              <img
                src={tenant.settings.logo}
                alt="Logo"
                className="w-16 h-16 rounded-xl object-contain border border-gray-200 bg-gray-50 p-1 flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 flex-shrink-0">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleLogoChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {logoUploading ? (
                  <><Spinner size="sm" /><span>Uploading…</span></>
                ) : (
                  tenant?.settings?.logo ? 'Change Logo' : 'Upload Logo'
                )}
              </button>
              {tenant?.settings?.logo && (
                <button
                  type="button"
                  onClick={() => removeLogoMutation.mutate()}
                  disabled={removeLogoMutation.isPending}
                  className="block text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {logoError && <p className="text-xs text-red-500 mt-1.5">{logoError}</p>}
          <p className="text-xs text-gray-400 mt-1.5">PNG, JPG or WebP · Max 5 MB · Recommended 200 × 200 px or larger</p>
        </div>

        {/* ── Favicon ── */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Favicon</label>
          <div className="flex items-center gap-4">
            {tenant?.settings?.favicon ? (
              <img
                src={tenant.settings.favicon}
                alt="Favicon"
                className="w-10 h-10 rounded-lg object-contain border border-gray-200 bg-gray-50 p-1 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 flex-shrink-0">
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div className="space-y-2">
              <input ref={faviconRef} type="file" accept="image/png,image/x-icon,image/svg+xml,image/webp" className="hidden" onChange={handleFaviconChange} />
              <button
                type="button"
                onClick={() => faviconRef.current?.click()}
                disabled={faviconUploadMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {faviconUploadMutation.isPending ? <><Spinner size="sm" /><span>Uploading…</span></> : (tenant?.settings?.favicon ? 'Change Favicon' : 'Upload Favicon')}
              </button>
              {tenant?.settings?.favicon && (
                <button type="button" onClick={() => removeFaviconMutation.mutate()} disabled={removeFaviconMutation.isPending}
                  className="block text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                  Remove
                </button>
              )}
            </div>
          </div>
          {faviconError && <p className="text-xs text-red-500 mt-1.5">{faviconError}</p>}
          <p className="text-xs text-gray-400 mt-1.5">PNG, ICO, SVG or WebP · Max 5 MB · Recommended 32 × 32 or 64 × 64 px</p>
        </div>

        {/* ── Brand Colors ── */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Primary Brand Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={form.primaryColor} onChange={e => { set('primaryColor', e.target.value); applyBrandColor(e.target.value); }} className="h-10 w-16 rounded-lg border border-gray-300 cursor-pointer p-1" />
            <input type="text" value={form.primaryColor} onChange={e => { const v = e.target.value; if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) set('primaryColor', v); }} maxLength={7} className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            <span className="text-xs text-gray-400">Used for headings, links & primary buttons</span>
          </div>
          {/* Preset swatches */}
          <div className="flex items-center gap-2 mt-2">
            {['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#EC4899','#0EA5E9','#6366F1'].map(c => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => { set('primaryColor', c); applyBrandColor(c); }}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1"
                style={{ backgroundColor: c, borderColor: form.primaryColor === c ? c : 'transparent' }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Secondary Brand Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={form.secondaryColor} onChange={e => { set('secondaryColor', e.target.value); applySecondaryColor(e.target.value); }} className="h-10 w-16 rounded-lg border border-gray-300 cursor-pointer p-1" />
            <input type="text" value={form.secondaryColor} onChange={e => { const v = e.target.value; if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) set('secondaryColor', v); }} maxLength={7} className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            <span className="text-xs text-gray-400">Used for accents — price badges, tags & highlights</span>
          </div>
          {/* Preset swatches */}
          <div className="flex items-center gap-2 mt-2">
            {['#8B5CF6','#3B82F6','#10B981','#F59E0B','#EF4444','#EC4899','#0EA5E9','#6366F1'].map(c => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => { set('secondaryColor', c); applySecondaryColor(c); }}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1"
                style={{ backgroundColor: c, borderColor: form.secondaryColor === c ? c : 'transparent' }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Font</label>
          <select
            value={form.fontFamily}
            onChange={e => { set('fontFamily', e.target.value); applyFontFamily(e.target.value); }}
            className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">
            Applied across your public storefront, login/register pages, and the LMS dashboard.
          </p>
        </div>
      </Section>

      <Section
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        }
        title="Registration & Security"
        desc="Control how new users sign up and how sessions expire"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-900">Allow Self-Registration</p>
              <p className="text-xs text-gray-500 mt-0.5">Students can create accounts without an invitation</p>
            </div>
            <Toggle checked={form.allowSelfRegistration} onChange={v => set('allowSelfRegistration', v)} />
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-900">Require Email Verification</p>
              <p className="text-xs text-gray-500 mt-0.5">New users must verify their email before logging in</p>
            </div>
            <Toggle checked={form.requireEmailVerification} onChange={v => set('requireEmailVerification', v)} />
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-900">Default Invite Link Expiry</p>
              <p className="text-xs text-gray-500 mt-0.5">Pre-selected expiry when sending user invitations</p>
            </div>
            <select
              value={form.defaultInviteExpiryHours}
              onChange={e => set('defaultInviteExpiryHours', Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              {[
                { value: 24,  label: '24 hours' },
                { value: 48,  label: '48 hours' },
                { value: 72,  label: '3 days' },
                { value: 168, label: '1 week' },
                { value: 336, label: '2 weeks' },
                { value: 720, label: '30 days' },
              ].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-900">Session Idle Timeout</p>
              <p className="text-xs text-gray-500 mt-0.5">Minutes of inactivity before auto sign-out. Set 0 to disable.</p>
            </div>
            <input
              type="number" min={0}
              value={form.idleTimeoutMinutes}
              onChange={e => set('idleTimeoutMinutes', Math.max(0, parseInt(e.target.value) || 0))}
              className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </Section>

      <div className="flex items-center gap-3 pb-4">
        <Button onClick={() => mutation.mutate(form)} loading={mutation.isPending} disabled={mutation.isPending}>Save Changes</Button>
        {saved && <SavedBadge />}
        {mutation.isError && <span className="text-sm text-red-600">Failed to save — {(mutation.error as Error)?.message ?? 'please try again'}</span>}
      </div>
      </>
      )}

      {activeTab === 'storefront' && <StorefrontSection />}
      {activeTab === 'email' && <EmailSettingsSection />}
      {activeTab === 'security' && (
        <>
          <PasswordPolicySection />
          <AuthAuditLogSection />
        </>
      )}
      {activeTab === 'features' && <FeatureFlagsSection />}
      {activeTab === 'integrations' && (
        <>
          <PaymentGatewaySection />
          <ZoomSection />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE ENTRY POINT — role-aware dispatcher
// ═══════════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const user = useAuthStore(s => s.user);

  if (!user) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  // Students and instructors see their personal settings
  if (user.role === 'student' || user.role === 'instructor') {
    return <StudentSettings />;
  }

  // Admins see the organisation settings
  return <AdminSettings />;
}
