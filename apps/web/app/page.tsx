'use client';

import { useState } from 'react';
import Link from 'next/link';

const features = [
  {
    icon: '🎓',
    title: 'Course Builder',
    desc: 'Create structured courses with videos, quizzes, assignments, and drip scheduling — all in one place.',
  },
  {
    icon: '💳',
    title: 'Built-in Payments',
    desc: 'Accept course payments via Stripe or PayPal. Set your own prices, run coupons, and issue refunds.',
  },
  {
    icon: '📊',
    title: 'Analytics & Reports',
    desc: 'Track student progress, revenue trends, and instructor earnings with beautiful visual dashboards.',
  },
  {
    icon: '🏆',
    title: 'Certificates',
    desc: 'Issue branded certificates automatically when students pass a course or quiz.',
  },
  {
    icon: '💬',
    title: 'Live & Community',
    desc: 'Host live sessions via Zoom, run discussion forums, and message students in real-time chat.',
  },
  {
    icon: '🔒',
    title: 'Multi-Tenant & Secure',
    desc: 'Every school gets its own subdomain, custom branding, and fully isolated data.',
  },
];

const plans = [
  {
    name: 'Basic',
    slug: 'basic',
    monthlyPrice: 29,
    yearlyPrice: 290,
    description: 'Perfect for solo instructors and small schools getting started.',
    features: [
      'Up to 100 students',
      '3 instructors',
      '10 courses',
      '10 GB storage',
      'Course payments (Stripe + PayPal)',
      'Quizzes & Assignments',
      'Email notifications',
      'Community forum',
      'Certificate builder',
      '14-day free trial',
    ],
    highlighted: false,
    cta: 'Start Free Trial',
  },
  {
    name: 'Pro',
    slug: 'pro',
    monthlyPrice: 59,
    yearlyPrice: 590,
    description: 'For growing academies that need more power and student capacity.',
    features: [
      'Unlimited students',
      'Unlimited instructors',
      'Unlimited courses',
      '50 GB storage',
      'Everything in Basic',
      'Live learning (Zoom)',
      'Advanced analytics & CSV export',
      'Student memberships',
      'Custom domain support',
      'Priority support',
      '14-day free trial',
    ],
    highlighted: true,
    cta: 'Start Free Trial',
  },
];

export default function LandingPage() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── Navbar ───────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-indigo-600 tracking-tight">
            Coursel
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-indigo-600 transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register-tenant"
              className="text-sm font-semibold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="pt-20 pb-24 px-6 text-center bg-gradient-to-b from-indigo-50 to-white">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block mb-4 text-xs font-semibold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full uppercase tracking-wide">
            14-day free trial · No credit card required
          </span>
          <h1 className="text-5xl font-extrabold text-gray-900 leading-tight mb-6">
            Launch your online school <br />
            <span className="text-indigo-600">in minutes</span>
          </h1>
          <p className="text-lg text-gray-500 mb-10 max-w-xl mx-auto">
            Coursel gives you everything to create, sell, and manage online courses — with your own branding, students, and payments.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register-tenant"
              className="bg-indigo-600 text-white text-base font-semibold px-8 py-3.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
            >
              Start Free Trial
            </Link>
            <a
              href="#pricing"
              className="border border-gray-300 text-gray-700 text-base font-semibold px-8 py-3.5 rounded-xl hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              View Pricing
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Everything you need to run your academy</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              No plugins, no patchwork. Coursel ships with all the tools your school needs out of the box.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f) => (
              <div key={f.title} className="p-6 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Simple, transparent pricing</h2>
            <p className="text-gray-500 mb-8">Start with a 14-day free trial. No credit card required.</p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-3 bg-white border border-gray-200 rounded-full p-1">
              <button
                onClick={() => setYearly(false)}
                className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  !yearly ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  yearly ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Yearly
                <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
                  Save 17%
                </span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.slug}
                className={`rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-200 ring-2 ring-indigo-600'
                    : 'bg-white border border-gray-200 shadow-sm'
                }`}
              >
                {plan.highlighted && (
                  <span className="self-start text-xs font-semibold bg-white text-indigo-600 px-3 py-1 rounded-full mb-4">
                    Most Popular
                  </span>
                )}
                <h3 className={`text-xl font-bold mb-1 ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mb-6 ${plan.highlighted ? 'text-indigo-200' : 'text-gray-500'}`}>
                  {plan.description}
                </p>
                <div className="mb-6">
                  <span className={`text-4xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                    ${yearly ? plan.yearlyPrice : plan.monthlyPrice}
                  </span>
                  <span className={`text-sm ml-1 ${plan.highlighted ? 'text-indigo-200' : 'text-gray-400'}`}>
                    /{yearly ? 'year' : 'month'}
                  </span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm">
                      <svg
                        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-indigo-200' : 'text-indigo-500'}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className={plan.highlighted ? 'text-indigo-100' : 'text-gray-600'}>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register-tenant"
                  className={`block text-center text-sm font-semibold py-3 rounded-xl transition-all ${
                    plan.highlighted
                      ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-400 mt-8">
            After your trial, choose a plan to continue. Payments are handled securely by Lemon Squeezy.
          </p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="py-10 px-6 border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <span className="font-semibold text-indigo-600">Coursel</span>
          <span>© {new Date().getFullYear()} Coursel. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/login" className="hover:text-gray-600 transition-colors">Sign in</Link>
            <Link href="/register-tenant" className="hover:text-gray-600 transition-colors">Get started</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
