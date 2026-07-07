'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, { setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { cn } from '@/lib/utils';
import { loadRecaptchaScript, executeRecaptcha, RECAPTCHA_SITE_KEY } from '@/lib/recaptcha';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function pwStrength(p: string): { label: string; pct: number; color: string } {
  if (p.length === 0) return { label: '', pct: 0, color: '' };
  if (p.length < 6)   return { label: 'Too short', pct: 15, color: 'bg-red-400' };
  if (p.length < 8)   return { label: 'Weak',      pct: 35, color: 'bg-orange-400' };
  if (p.length < 12)  return { label: 'Good',      pct: 65, color: 'bg-blue-400' };
  return                     { label: 'Strong',    pct: 100, color: 'bg-emerald-500' };
}

// ─── Step indicator ────────────────────────────────────────────────────────────

const STEP_LABELS = ['About You', 'Your School', 'Invite Team', 'Done'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-7">
      {STEP_LABELS.map((label, i) => {
        const n      = i + 1;
        const done   = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                done   ? 'bg-primary-600 text-white' :
                active ? 'bg-primary-600 text-white ring-4 ring-primary-100' :
                         'bg-gray-100 text-gray-400',
              )}>
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : n}
              </div>
              <span className={cn('text-[10px] font-medium',
                active ? 'text-primary-700' : done ? 'text-gray-400' : 'text-gray-300',
              )}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={cn('w-8 h-0.5 rounded mb-4 transition-colors', done ? 'bg-primary-400' : 'bg-gray-200')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Invite row ────────────────────────────────────────────────────────────────

interface InviteRow { email: string; role: 'instructor' | 'student'; }

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function RegisterTenantPage() {
  const router      = useRouter();
  const setUser     = useAuthStore(s => s.setUser);
  const setSubdomain = useAuthStore(s => s.setSubdomain);

  const [step,    setStep]    = useState(1);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // ── Step 1: Account ──
  const [firstName,        setFirstName]       = useState('');
  const [lastName,         setLastName]        = useState('');
  const [email,            setEmail]           = useState('');
  const [password,         setPassword]        = useState('');
  const [confirmPassword,  setConfirmPassword] = useState('');
  const [showPwd,          setShowPwd]         = useState(false);

  // ── Step 2: School ──
  const [tenantName,         setTenantName]        = useState('');
  const [subdomain,          setSubdomain_]         = useState('');
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const [checkingSubdomain,  setCheckingSubdomain]  = useState(false);
  const userEditedSubdomain = useRef(false);

  // ── Step 3: Invite ──
  const [invites, setInvites] = useState<InviteRow[]>([{ email: '', role: 'instructor' }]);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResults, setInviteResults] = useState<{ email: string; ok: boolean }[]>([]);

  // ── Step 4: Result ──
  const [result, setResult] = useState<{
    accessToken: string;
    user: any;
    tenant: { name: string; subdomain: string };
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Load reCAPTCHA script
  useEffect(() => { loadRecaptchaScript(); }, []);

  // Auto-suggest subdomain from school name
  useEffect(() => {
    if (userEditedSubdomain.current) return;
    const slug = slugify(tenantName);
    if (slug.length >= 3) setSubdomain_(slug);
  }, [tenantName]);

  // Debounced subdomain availability check
  useEffect(() => {
    setSubdomainAvailable(null);
    if (!subdomain || subdomain.length < 3 || !SUBDOMAIN_RE.test(subdomain)) return;
    const timer = setTimeout(async () => {
      setCheckingSubdomain(true);
      try {
        const res = await api.get(`/auth/check-subdomain?subdomain=${subdomain}`);
        setSubdomainAvailable(res.data.data.available);
      } catch {
        setSubdomainAvailable(null);
      } finally {
        setCheckingSubdomain(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [subdomain]);

  // ── Validation ──
  function validateStep1(): string | null {
    if (!firstName.trim()) return 'First name is required';
    if (!lastName.trim())  return 'Last name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address';
    if (password.length < 8)         return 'Password must be at least 8 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    return null;
  }

  function handleNext() {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError('');
    setStep(2);
  }

  async function handleCreate() {
    setError('');
    if (!tenantName.trim() || tenantName.trim().length < 2)
      return setError('Organisation name must be at least 2 characters');
    if (subdomain.length < 3 || !SUBDOMAIN_RE.test(subdomain))
      return setError('Subdomain must be 3–30 lowercase letters, numbers or hyphens');
    if (subdomainAvailable === false)
      return setError('This subdomain is already taken — try a different one');

    setLoading(true);
    try {
      const recaptchaToken = await executeRecaptcha('register_tenant').catch(() => '');
      const res = await api.post('/auth/register-tenant', {
        firstName:  firstName.trim(),
        lastName:   lastName.trim(),
        email:      email.trim().toLowerCase(),
        password,
        tenantName: tenantName.trim(),
        subdomain:  subdomain.toLowerCase(),
        recaptchaToken,
      });
      const data = res.data.data;

      // Auto-login: hydrate auth store without an extra round-trip
      setSubdomain(data.tenant.subdomain);
      setAccessToken(data.accessToken);
      setUser(data.user);

      setResult(data);
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendInvites() {
    const valid = invites.filter(r => r.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()));
    if (!valid.length) { setStep(4); return; }

    setInviteSending(true);
    const results: { email: string; ok: boolean }[] = [];
    await Promise.all(valid.map(async row => {
      try {
        await api.post('/users/invite', { email: row.email.trim().toLowerCase(), role: row.role });
        results.push({ email: row.email, ok: true });
      } catch {
        results.push({ email: row.email, ok: false });
      }
    }));
    setInviteResults(results);
    setInviteSending(false);
    setStep(4);
  }

  function addInviteRow() {
    if (invites.length >= 5) return;
    setInvites(prev => [...prev, { email: '', role: 'instructor' }]);
  }

  function updateInvite(i: number, field: keyof InviteRow, value: string) {
    setInvites(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function removeInvite(i: number) {
    setInvites(prev => prev.filter((_, idx) => idx !== i));
  }

  const pw = pwStrength(password);

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <>
      <StepIndicator current={step} />

      {/* ── Step 1: Account ─────────────────────────────────────────────── */}
      {step === 1 && (
        <>
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-gray-900">First, tell us about yourself</h2>
            <p className="text-sm text-gray-500 mt-1">You will be the owner and admin of your online school</p>
          </div>

          {error && <Alert variant="error" className="mb-4">{error}</Alert>}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name" placeholder="Jane" value={firstName}
                onChange={e => setFirstName(e.target.value)} autoFocus />
              <Input label="Last Name"  placeholder="Smith" value={lastName}
                onChange={e => setLastName(e.target.value)} />
            </div>

            <Input label="Email Address" type="email" autoComplete="email"
              placeholder="jane@school.com" value={email}
              onChange={e => setEmail(e.target.value)} />

            <div>
              <Input label="Password" type={showPwd ? 'text' : 'password'}
                autoComplete="new-password" placeholder="Min 8 characters"
                value={password} onChange={e => setPassword(e.target.value)} />
              {password.length > 0 && (
                <div className="mt-1.5">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-300', pw.color)}
                      style={{ width: `${pw.pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{pw.label}</p>
                </div>
              )}
            </div>

            <Input label="Confirm Password" type={showPwd ? 'text' : 'password'}
              autoComplete="new-password" placeholder="Repeat password"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />

            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-500">
              <input type="checkbox" className="rounded border-gray-300"
                checked={showPwd} onChange={e => setShowPwd(e.target.checked)} />
              Show passwords
            </label>

            <Button className="w-full" onClick={handleNext}>Continue →</Button>
          </div>

          <p className="mt-5 text-center text-sm text-gray-500">
            Already launched a school?{' '}
            <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">Sign in</Link>
          </p>

          {RECAPTCHA_SITE_KEY && (
            <p className="mt-4 text-center text-[11px] text-gray-400 leading-relaxed">
              Protected by reCAPTCHA —{' '}
              <a href="https://policies.google.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">Privacy</a>
              {' '}·{' '}
              <a href="https://policies.google.com/terms" className="underline" target="_blank" rel="noopener noreferrer">Terms</a>
            </p>
          )}
        </>
      )}

      {/* ── Step 2: School ──────────────────────────────────────────────── */}
      {step === 2 && (
        <>
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-gray-900">Name your school</h2>
            <p className="text-sm text-gray-500 mt-1">
              We'll create a private website just for your students — like <span className="font-medium text-gray-700">yourschool.coursel.space</span>
            </p>
          </div>

          {error && <Alert variant="error" className="mb-4">{error}</Alert>}

          <div className="space-y-4">
            <Input
              label="What is your school called?"
              placeholder="e.g. Sarah's Art Academy, TechBootcamp, City Coding Club"
              value={tenantName}
              onChange={e => setTenantName(e.target.value)}
              autoFocus
            />

            {/* Web address — presented as a preview, not a form field */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Your students will log in at:
              </label>

              {/* Live preview */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 mb-2">
                <p className="text-xs text-gray-400 mb-0.5">Your school's web address</p>
                <p className={cn(
                  'text-base font-mono font-semibold transition-colors',
                  subdomain ? 'text-primary-600' : 'text-gray-300',
                )}>
                  {subdomain || 'yourschool'}.coursel.space
                </p>
                {checkingSubdomain && <p className="text-xs text-gray-400 mt-1">Checking…</p>}
                {!checkingSubdomain && subdomain.length >= 3 && SUBDOMAIN_RE.test(subdomain) && subdomainAvailable === true && (
                  <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    This address is available!
                  </p>
                )}
                {!checkingSubdomain && subdomainAvailable === false && (
                  <p className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    This address is taken — change the school name or edit below
                  </p>
                )}
              </div>

              {/* Editable slug — secondary, collapsible feel */}
              <details className="group">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-primary-600 transition-colors select-none list-none flex items-center gap-1">
                  <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Want a different web address? Edit it here
                </summary>
                <div className={cn(
                  'flex rounded-lg border overflow-hidden mt-2 transition-shadow',
                  'focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent',
                  subdomainAvailable === false ? 'border-red-300' :
                  subdomainAvailable === true  ? 'border-emerald-400' :
                  'border-gray-300',
                )}>
                  <input
                    type="text"
                    value={subdomain}
                    onChange={e => {
                      userEditedSubdomain.current = true;
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+/, '').slice(0, 30);
                      setSubdomain_(v);
                    }}
                    placeholder="your-school-name"
                    className="flex-1 px-3 py-2 text-sm bg-white focus:outline-none min-w-0"
                  />
                  <span className="flex items-center px-3 bg-gray-50 border-l border-gray-200 text-xs text-gray-400 whitespace-nowrap shrink-0">
                    .coursel.space
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Only lowercase letters, numbers and hyphens</p>
              </details>
            </div>

            {/* Trial notice */}
            <div className="rounded-xl bg-primary-50 border border-primary-100 p-4">
              <p className="text-sm font-semibold text-primary-800">✓ 14-day free trial — no credit card needed</p>
              <p className="text-xs text-primary-600 mt-0.5">Full access to all features. Cancel anytime.</p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setError(''); setStep(1); }}>← Back</Button>
              <Button className="flex-1" onClick={handleCreate} loading={loading}
                disabled={loading || subdomainAvailable === false}>
                Launch My School →
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Step 3: Invite teammates ─────────────────────────────────────── */}
      {step === 3 && (
        <>
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-gray-900">Want to invite anyone? (optional)</h2>
            <p className="text-sm text-gray-500 mt-1">
              Add a teacher or a student now, or skip — you can always invite people later from your dashboard.
            </p>
          </div>

          <div className="space-y-3">
            {invites.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="email"
                  placeholder="colleague@email.com"
                  value={row.email}
                  onChange={e => updateInvite(i, 'email', e.target.value)}
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-w-0"
                />
                <select
                  value={row.role}
                  onChange={e => updateInvite(i, 'role', e.target.value)}
                  className="px-2.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white flex-shrink-0"
                >
                  <option value="instructor">Instructor</option>
                  <option value="student">Student</option>
                </select>
                {invites.length > 1 && (
                  <button
                    onClick={() => removeInvite(i)}
                    className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {invites.length < 5 && (
              <button
                onClick={addInviteRow}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add another
              </button>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep(4)}
              disabled={inviteSending}
            >
              Skip
            </Button>
            <Button
              className="flex-1"
              onClick={handleSendInvites}
              loading={inviteSending}
              disabled={inviteSending}
            >
              Send Invites →
            </Button>
          </div>
        </>
      )}

      {/* ── Step 4: Done ─────────────────────────────────────────────────── */}
      {step === 4 && result && (
        <div className="text-center space-y-5">
          {/* Success icon */}
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900">🎉 Your school is live!</h2>
            <p className="text-sm text-gray-500 mt-1">Welcome to {result.tenant.name} — let's build something great.</p>
          </div>

          {/* School URL card */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-left">
            <p className="text-xs font-medium text-gray-500 mb-1.5">Your students log in at this address</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-2 truncate">
                {result.tenant.subdomain}.coursel.space
              </code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`https://${result.tenant.subdomain}.coursel.space`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                title="Copy URL"
                className="shrink-0 p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Invite results */}
          {inviteResults.length > 0 && (
            <div className="text-left">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Invitations</p>
              <div className="space-y-1.5">
                {inviteResults.map(r => (
                  <div key={r.email} className="flex items-center gap-2 text-sm">
                    <span className={r.ok ? 'text-emerald-500' : 'text-red-400'}>
                      {r.ok ? '✓' : '✗'}
                    </span>
                    <span className={r.ok ? 'text-gray-700' : 'text-gray-400'}>{r.email}</span>
                    {!r.ok && <span className="text-xs text-red-400">(failed — try again from Users)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What's ready */}
          <div className="text-left space-y-2 text-sm text-gray-600">
            {[
              '14-day free trial activated — no credit card needed',
              'Welcome email sent to your inbox',
              'You are the owner and admin of your school',
              'Create courses, add students, track progress from your dashboard',
            ].map(item => (
              <div key={item} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </div>
            ))}
          </div>

          <Button className="w-full" onClick={() => router.push('/dashboard')}>
            Go to my dashboard →
          </Button>
        </div>
      )}
    </>
  );
}
