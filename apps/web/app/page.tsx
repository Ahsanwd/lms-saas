'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { applyBrandColor, applySecondaryColor, applyFontFamily } from '@/lib/brandColor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicCourse {
  _id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  thumbnail: string | null;
  price: number;
  isFree: boolean;
  level: string;
  enrollmentCount: number;
  rating: { average: number; count: number };
  totalLessons: number;
  totalDurationSeconds: number;
  instructorId: { firstName: string; lastName: string; avatar: string | null } | null;
  categoryId: { name: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all: 'All levels',
};

// ─── Course Card ──────────────────────────────────────────────────────────────

function CourseCard({ course }: { course: PublicCourse }) {
  const instructor = course.instructorId;
  const instructorName = instructor
    ? `${instructor.firstName} ${instructor.lastName}`
    : 'Instructor';

  return (
    <Link
      href={`/login?redirect=/courses/${course._id}`}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-primary-200 transition-all"
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-video bg-primary-50 overflow-hidden">
        {course.thumbnail ? (
          <img
            src={course.thumbnail}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-primary-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
        )}
        {/* Price badge */}
        <span className="absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-full shadow bg-white text-secondary-600">
          {course.isFree ? 'Free' : `$${course.price}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        {course.categoryId && (
          <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-1">
            {course.categoryId.name}
          </span>
        )}
        <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1 line-clamp-2 group-hover:text-primary-600 transition-colors">
          {course.title}
        </h3>
        {course.shortDescription && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{course.shortDescription}</p>
        )}

        <div className="mt-auto space-y-2">
          {/* Rating */}
          {course.rating.count > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-500 font-medium">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {course.rating.average.toFixed(1)}
              <span className="text-gray-400">({course.rating.count})</span>
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{LEVEL_LABEL[course.level] ?? course.level}</span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {course.totalLessons} lessons
            </span>
            {course.totalDurationSeconds > 0 && (
              <span>{formatDuration(course.totalDurationSeconds)}</span>
            )}
          </div>

          {/* Instructor */}
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            {instructor?.avatar ? (
              <img src={instructor.avatar} alt={instructorName} className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-secondary-100 flex items-center justify-center text-secondary-600 text-xs font-bold">
                {instructor?.firstName?.[0] ?? 'I'}
              </div>
            )}
            <span className="text-xs text-gray-500 truncate">{instructorName}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Tenant Landing Page ──────────────────────────────────────────────────────

function TenantLandingPage({ subdomain }: { subdomain: string }) {
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [tenantName, setTenantName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/api/courses/public`, {
        headers: { 'X-Tenant-Subdomain': subdomain },
      })
      .then((res) => {
        setCourses(res.data.data.courses ?? []);
        setTenantName(res.data.data.tenantName ?? '');
        setLogoUrl(res.data.data.branding?.logoUrl ?? null);
        if (res.data.data.branding?.primaryColor) applyBrandColor(res.data.data.branding.primaryColor);
        if (res.data.data.branding?.secondaryColor) applySecondaryColor(res.data.data.branding.secondaryColor);
        applyFontFamily(res.data.data.branding?.fontFamily);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subdomain]);

  const displayName = tenantName || subdomain;

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {logoUrl ? (
            <img src={logoUrl} alt={displayName} className="h-9 object-contain" />
          ) : (
            <span className="text-xl font-bold text-primary-600 tracking-tight capitalize">
              {displayName}
            </span>
          )}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-secondary-600 text-white px-4 py-2 rounded-lg hover:bg-secondary-700 transition-colors"
            >
              Sign up free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-16 pb-12 px-6 text-center bg-gradient-to-b from-primary-50 to-white">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-extrabold text-gray-900 leading-tight mb-4">
            Learn with{' '}
            <span className="text-primary-600 capitalize">{displayName}</span>
          </h1>
          <p className="text-base text-gray-500 mb-6 max-w-lg mx-auto">
            Browse our courses below and start learning today. Sign up for free to enroll.
          </p>
          <Link
            href="/register"
            className="inline-block bg-primary-600 text-white text-sm font-semibold px-7 py-3 rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-200"
          >
            Create free account
          </Link>
        </div>
      </section>

      {/* Courses */}
      <section className="py-14 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900">
              {loading ? 'Loading courses…' : courses.length > 0 ? `All Courses (${courses.length})` : 'No courses yet'}
            </h2>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                  <div className="aspect-video bg-gray-100" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-4 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-lg font-medium">No published courses yet</p>
              <p className="text-sm mt-1">Check back soon!</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {courses.map((course) => (
                <CourseCard key={course._id} course={course} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <span className="font-semibold text-primary-600 capitalize">{displayName}</span>
          <span>Powered by <a href="https://coursel.space" className="hover:text-primary-500 transition-colors">Coursel</a></span>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-gray-600 transition-colors">Sign in</Link>
            <Link href="/register" className="hover:text-gray-600 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Platform Landing Page (coursel.space) ────────────────────────────────────

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
    ],
    highlighted: false,
    monthlyCheckout: 'https://coursel.lemonsqueezy.com/checkout/buy/473b73c3-f646-4d5f-aa8b-65a83f17db15',
    yearlyCheckout:  'https://coursel.lemonsqueezy.com/checkout/buy/c1dde874-556d-4c75-8f62-170be01b6151',
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
    ],
    highlighted: true,
    monthlyCheckout: 'https://coursel.lemonsqueezy.com/checkout/buy/0e0b2fb6-3ba2-4e1e-93f6-802828bbb3e7',
    yearlyCheckout:  'https://coursel.lemonsqueezy.com/checkout/buy/c89afe0e-29e8-49c3-b430-c46b21b54eaf',
  },
];

function PlatformLandingPage() {
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
                <a
                  href={yearly ? plan.yearlyCheckout : plan.monthlyCheckout}
                  className={`block text-center text-sm font-semibold py-3 rounded-xl transition-all mb-3 ${
                    plan.highlighted
                      ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  Get {plan.name} Plan
                </a>
                <Link
                  href="/register-tenant"
                  className={`block text-center text-xs font-medium py-2 rounded-xl transition-all border ${
                    plan.highlighted
                      ? 'border-indigo-400 text-indigo-200 hover:text-white hover:border-white'
                      : 'border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Try free for 14 days
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
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/login" className="hover:text-gray-600 transition-colors">Sign in</Link>
            <Link href="/register-tenant" className="hover:text-gray-600 transition-colors">Get started</Link>
            <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms of Service</Link>
            <Link href="/refund-policy" className="hover:text-gray-600 transition-colors">Refund Policy</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}

// ─── Root Page — detects platform vs tenant ───────────────────────────────────

export default function RootPage() {
  const [subdomain, setSubdomain] = useState<string | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'coursel.space';
    if (host !== rootDomain && host !== `www.${rootDomain}` && host.endsWith(`.${rootDomain}`)) {
      setSubdomain(host.replace(`.${rootDomain}`, ''));
    } else {
      setSubdomain('');
    }
  }, []);

  if (subdomain === null) return null; // brief flash prevention

  if (subdomain) return <TenantLandingPage subdomain={subdomain} />;
  return <PlatformLandingPage />;
}
