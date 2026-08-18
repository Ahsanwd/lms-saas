'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { loadRecaptchaScript, executeRecaptcha } from '@/lib/recaptcha';

type Stage = {
  title: string;
  items: { text: string; note?: string }[];
  highlight?: boolean;
};

const STAGES: Stage[] = [
  {
    title: 'Stage 1 — Validate the idea',
    items: [
      { text: 'Narrow to one specific problem you can solve', note: '"Freelance invoicing for Pakistani exporters" beats "business skills"' },
      { text: 'Ask 10 people in your niche if they’d pay for this', note: 'Not "would you take this" — "would you pay for this"' },
      { text: 'Check that 2–3 people already teach something similar online', note: 'Competition here is a sign of real demand' },
    ],
  },
  {
    title: 'Stage 2 — Build the course',
    items: [
      { text: 'Outline modules and lessons before recording anything' },
      { text: 'Record in short lessons, 8–15 minutes each', note: 'Easier for you to finish, easier for students to watch' },
      { text: 'Price in both PKR and USD', note: 'Some students will be paying from outside Pakistan' },
      { text: 'Add one downloadable resource per module' },
    ],
  },
  {
    title: 'Stage 3 — Get paid (the part that stops most people)',
    items: [
      { text: 'Drop the assumption that you need a US/UK company to sell online', note: 'You don’t — this is the myth that stalls most launches here' },
      { text: 'Pick a platform that lets students pay you directly by bank transfer, JazzCash, or EasyPaisa', note: 'No gateway approval to wait on' },
      { text: 'Test the full flow yourself first', note: 'Transfer, upload proof, approve it, confirm enrollment unlocks' },
      { text: 'Decide how fast you’ll review and approve payments', note: 'Slow approval is the #1 way this flow frustrates students' },
    ],
    highlight: true,
  },
  {
    title: 'Stage 4 — Build your launch page',
    items: [
      { text: 'Write the page around the outcome, not the curriculum' },
      { text: 'Show your face and a short bio', note: 'A real person converts better than a logo' },
      { text: 'Add 2–3 testimonials, even from free beta students' },
      { text: 'Test the buy button yourself, on mobile, before announcing anything' },
    ],
  },
  {
    title: 'Stage 5 — Get your first students',
    items: [
      { text: 'Post value, not ads, in 3–5 Facebook groups where your audience gathers' },
      { text: 'Build an email list before launch day, not after', note: '50 warm emails beats zero on day one' },
      { text: 'Offer a founding-cohort discount for your first 10–20 students' },
      { text: 'Personally message the first 10 people who show interest' },
    ],
  },
  {
    title: 'Stage 6 — After you launch',
    items: [
      { text: 'Give students a simple way to ask questions' },
      { text: 'Issue a certificate on completion', note: 'Small touch, real credibility' },
      { text: 'Ask every completed student for a testimonial while it’s fresh' },
      { text: 'Revisit your price after the first 20 sales', note: 'Most creators underprice at launch' },
    ],
  },
];

const TOTAL_ITEMS = STAGES.reduce((n, s) => n + s.items.length, 0);

export function ChecklistOptIn() {
  const [form, setForm] = useState({ name: '', email: '', website: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => { loadRecaptchaScript(); }, []);

  const doneCount = Object.values(checked).filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    try {
      const recaptchaToken = await executeRecaptcha('checklist_optin').catch(() => '');
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/marketing/checklist-optin`, {
        email: form.email,
        name: form.name || undefined,
        website: form.website,
        recaptchaToken,
      });
      setUnlocked(true);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <nav className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-indigo-600 tracking-tight">Coursel</Link>
          <Link
            href="/register-tenant"
            className="text-sm font-semibold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Start Free Trial
          </Link>
        </div>
      </nav>

      <section className="pt-16 pb-10 px-6 text-center bg-gradient-to-b from-indigo-50 to-white">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block mb-4 text-xs font-semibold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full uppercase tracking-wide">
            Free Launch Checklist
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
            Sell online courses from Pakistan — <span className="text-indigo-600">without Stripe</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Six stages, in order, from validating your idea to collecting your first payment through a gateway that actually works here.
          </p>
        </div>
      </section>

      {!unlocked ? (
        <section className="px-6 pb-24">
          <form
            onSubmit={handleSubmit}
            className="max-w-md mx-auto bg-white border border-gray-100 shadow-xl rounded-2xl p-8 -mt-2"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="email">Email *</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="you@example.com"
                />
              </div>
              {/* Honeypot — hidden from real visitors via CSS, catches bots that fill every field */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full mt-6 bg-indigo-600 text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {status === 'submitting' ? 'Sending…' : 'Send me the checklist'}
            </button>
            {status === 'error' && (
              <p className="mt-3 text-sm text-red-600 text-center">Something went wrong — please try again.</p>
            )}
            <p className="mt-4 text-xs text-gray-400 text-center">No spam. Unsubscribe anytime.</p>
          </form>
        </section>
      ) : (
        <section className="px-6 pb-24">
          <div className="max-w-2xl mx-auto">
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-5 py-4 mb-8 text-center">
              You're in — the checklist is also on its way to <strong>{form.email}</strong>.
            </div>

            <div className="flex items-center gap-3 mb-8">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all"
                  style={{ width: `${(doneCount / TOTAL_ITEMS) * 100}%` }}
                />
              </div>
              <span className="text-sm text-gray-500 whitespace-nowrap tabular-nums">{doneCount} of {TOTAL_ITEMS} done</span>
            </div>

            <div className="space-y-8">
              {STAGES.map((stage) => (
                <div key={stage.title}>
                  <h2
                    className={`text-base font-bold mb-3 pb-2 border-b ${
                      stage.highlight ? 'text-amber-700 border-amber-200' : 'text-gray-900 border-gray-100'
                    }`}
                  >
                    {stage.title}
                  </h2>
                  <ul className="space-y-1">
                    {stage.items.map((item) => {
                      const key = `${stage.title}::${item.text}`;
                      const isChecked = !!checked[key];
                      return (
                        <li key={key}>
                          <label className="flex items-start gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => setChecked((p) => ({ ...p, [key]: !p[key] }))}
                              className="mt-1 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                            />
                            <span>
                              <span className={`text-sm ${isChecked ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.text}</span>
                              {item.note && <span className="block text-xs text-gray-500 mt-0.5">{item.note}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-10 bg-indigo-50 border border-indigo-100 rounded-2xl p-7 text-center">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">If Stage 3 is what's been holding you back</p>
              <h3 className="text-xl font-bold text-gray-900 mb-3">That's the one problem Coursel was built to solve.</h3>
              <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                Stripe works if you have access to it — if you don't, students pay you directly by bank transfer, JazzCash, or EasyPaisa, and you approve each one. No foreign company required.
              </p>
              <Link
                href="/register-tenant"
                className="inline-block bg-indigo-600 text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Start free at coursel.space
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
