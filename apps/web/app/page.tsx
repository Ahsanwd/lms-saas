'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { applyBrandColor, applySecondaryColor, applyFontFamily } from '@/lib/brandColor';
import { loadRecaptchaScript, executeRecaptcha } from '@/lib/recaptcha';
import { useTenantSubdomain } from '@/lib/useTenantSubdomain';
import { useTenantBrowserChrome } from '@/lib/useTenantBrowserChrome';
import { resolveSectionCourses } from '@/lib/tenantPageFetch';
import {
  PageSectionsRenderer,
  type PageSection,
  type PublicCourse,
  type NavPage,
  type HeaderConfig,
  type FooterConfig,
  type PublicBundle,
  type PublicMembershipPlan,
  SOCIAL_ICON_PATHS,
} from '@/components/website/LandingPageSections';

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
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [sections, setSections] = useState<PageSection[]>([]);
  const [pageId, setPageId] = useState<string | undefined>(undefined);
  const [navPages, setNavPages] = useState<NavPage[]>([]);
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [footerConfig, setFooterConfig] = useState<FooterConfig | null>(null);
  const [bundles, setBundles] = useState<PublicBundle[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<PublicMembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers = { 'X-Tenant-Subdomain': subdomain };
    Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/courses/public`, { headers }),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/tenant/pages/public/home`, { headers }).catch(() => null),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/tenant/pages/public`, { headers }).catch(() => null),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/bundles/public`, { headers }).catch(() => null),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/membership/plans/public`, { headers }).catch(() => null),
    ])
      .then(async ([coursesRes, pageRes, navRes, bundlesRes, plansRes]) => {
        let finalCourses = coursesRes.data.data.courses ?? [];
        setTenantName(coursesRes.data.data.tenantName ?? '');
        setLogoUrl(coursesRes.data.data.branding?.logoUrl ?? null);
        setFaviconUrl(coursesRes.data.data.branding?.faviconUrl ?? null);
        if (coursesRes.data.data.branding?.primaryColor) applyBrandColor(coursesRes.data.data.branding.primaryColor);
        if (coursesRes.data.data.branding?.secondaryColor) applySecondaryColor(coursesRes.data.data.branding.secondaryColor);
        applyFontFamily(coursesRes.data.data.branding?.fontFamily);
        setNavPages(navRes?.data?.data?.pages ?? []);
        setHeaderConfig(coursesRes.data.data.branding?.header ?? null);
        setFooterConfig(coursesRes.data.data.branding?.footer ?? null);
        setBundles(bundlesRes?.data?.data?.bundles ?? []);
        setMembershipPlans(plansRes?.data?.data?.plans ?? []);

        const page = pageRes?.data?.data;
        if (page?.isPublished) {
          setIsPublished(true);
          setSections(page.sections ?? []);
          setPageId(page._id);
          finalCourses = await resolveSectionCourses(headers, page.sections ?? [], finalCourses);
        }
        setCourses(finalCourses);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subdomain]);

  const displayName = tenantName || subdomain;

  useTenantBrowserChrome(displayName, faviconUrl, logoUrl);

  // Wait for branding + published-website state to resolve before rendering
  // anything — otherwise the page briefly flashes the default/fallback
  // layout before swapping to the tenant's real published content.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 rounded-full border-4 border-gray-100 border-t-primary-600 animate-spin" />
      </div>
    );
  }

  if (isPublished) {
    return (
      <PageSectionsRenderer
        sections={sections}
        courses={courses}
        coursesLoading={false}
        displayName={displayName}
        logoUrl={logoUrl}
        pages={navPages}
        subdomain={subdomain}
        pageId={pageId}
        headerConfig={headerConfig}
        footerConfig={footerConfig}
        bundles={bundles}
        membershipPlans={membershipPlans}
      />
    );
  }

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
              {courses.length > 0 ? `All Courses (${courses.length})` : 'No courses yet'}
            </h2>
          </div>

          {courses.length === 0 ? (
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
    icon: '🎨',
    title: 'Stunning Website Builder',
    desc: 'Launch with a beautifully designed site from our template library, then customize every page yourself — no code required.',
    gradient: 'from-violet-500 to-indigo-500',
  },
  {
    icon: '🎓',
    title: 'Powerful Course Builder',
    desc: 'Structure courses with sections, video/quiz/assignment lessons, and drip scheduling — all in one place.',
    gradient: 'from-blue-500 to-sky-500',
  },
  {
    icon: '📝',
    title: 'Advanced Quizzes & Assignments',
    desc: '9 question types, auto-graded or manual with rubrics, timers, randomization, and a full question bank.',
    gradient: 'from-rose-500 to-pink-500',
  },
  {
    icon: '🏆',
    title: 'Branded Certificates',
    desc: 'Auto-issued the moment a student passes — design your own certificate with a live preview builder.',
    gradient: 'from-amber-500 to-yellow-500',
  },
  {
    icon: '📹',
    title: 'Live Classes',
    desc: 'Real-time video classrooms built in — attendance tracking, recordings, no third-party Zoom setup needed.',
    gradient: 'from-red-500 to-rose-500',
  },
  {
    icon: '💬',
    title: 'Community & Chat',
    desc: 'Discussion forums with moderation, real-time student-instructor chat, and cohort/group learning.',
    gradient: 'from-teal-500 to-emerald-500',
  },
  {
    icon: '💰',
    title: 'Flexible Monetization',
    desc: 'Course bundles, coupons, and recurring memberships — connect your own payment gateway and keep 100% of revenue.',
    gradient: 'from-green-500 to-lime-500',
  },
  {
    icon: '🌐',
    title: 'Your Own Branded Domain',
    desc: 'Every school gets its own subdomain and custom domain support, with fully isolated, secure data.',
    gradient: 'from-cyan-500 to-sky-500',
  },
  {
    icon: '📊',
    title: 'Real-Time Analytics',
    desc: 'Revenue trends, student engagement, and instructor earnings — all in clear, visual dashboards.',
    gradient: 'from-purple-500 to-fuchsia-500',
  },
];

// Every one of these ships on every plan, including Free — no feature is
// gated behind a paid tier in this system. Plans differ purely on scale
// (student/instructor/course caps, storage, video minutes) — see `plans`
// below. Keeping this list honest matters: don't add a claim here (or to a
// plan's own `features`) that isn't actually true in the running system.
const includedInAllPlans = [
  'Website Builder & Design Library',
  'Live Classes',
  'Quizzes & Assignments',
  'Branded Certificates',
  'Community Forum & Chat',
  'Course Bundles & Coupons',
  'Student Memberships',
  'Your Own Payment Gateway',
  'Custom Domain Support',
];

const plans = [
  {
    name: 'Free',
    slug: 'free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'Explore the full platform for 14 days — no credit card required.',
    features: [
      'Up to 50 students',
      '3 instructors',
      '5 courses',
      '2 GB storage',
      'Email support',
    ],
    highlighted: false,
  },
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
      'Built-in video hosting — 300 min library / 3,000 min watch-time',
      'Email support',
    ],
    highlighted: false,
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
      'Built-in video hosting — 600 min library / 6,000 min watch-time',
      'Advanced analytics & CSV export',
      'Priority support',
    ],
    highlighted: true,
  },
];

function PlatformLandingPage() {
  const [yearly, setYearly] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', message: '', website: '' });
  const [contactStatus, setContactStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  useEffect(() => { loadRecaptchaScript(); }, []);

  const setContactField = (field: keyof typeof contactForm, value: string) =>
    setContactForm((prev) => ({ ...prev, [field]: value }));

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setContactStatus('submitting');
    try {
      const recaptchaToken = await executeRecaptcha('platform_contact').catch(() => '');
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/contact`, { ...contactForm, recaptchaToken });
      setContactStatus('success');
      setContactForm({ name: '', email: '', phone: '', message: '', website: '' });
    } catch {
      setContactStatus('error');
    }
  }

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
            <Link href="/guides" className="hover:text-indigo-600 transition-colors">Guides</Link>
            <a href="#contact" className="hover:text-indigo-600 transition-colors">Contact</a>
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
      <section id="features" className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest uppercase text-indigo-600 mb-3">Everything Included</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Everything you need to run your academy</h2>
            <div className="w-14 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto mb-5" />
            <p className="text-gray-500 max-w-xl mx-auto text-lg">
              No plugins, no patchwork. Coursel ships with all the tools your school needs out of the box.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="group p-7 rounded-2xl bg-white border border-gray-100 hover:border-transparent hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-2xl mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  {f.icon}
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{f.title}</h3>
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
            <p className="text-xs font-bold tracking-widest uppercase text-indigo-600 mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Simple, transparent pricing</h2>
            <div className="w-14 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto mb-5" />
            <p className="text-gray-500 mb-8 text-lg">Start with a 14-day free trial. No credit card required.</p>

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

          {/* Every plan includes — no feature here is gated behind a paid
              tier; plans differ purely on scale (below), never on features. */}
          <div className="max-w-3xl mx-auto mb-12 p-6 rounded-2xl bg-white border border-gray-200">
            <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4 text-center">Every plan includes</p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
              {includedInAllPlans.map((item) => (
                <span key={item} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
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
                  {plan.monthlyPrice === 0 ? (
                    <span className={`text-4xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                      Free
                    </span>
                  ) : (
                    <>
                      <span className={`text-4xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                        ${yearly ? plan.yearlyPrice : plan.monthlyPrice}
                      </span>
                      <span className={`text-sm ml-1 ${plan.highlighted ? 'text-indigo-200' : 'text-gray-400'}`}>
                        /{yearly ? 'year' : 'month'}
                      </span>
                    </>
                  )}
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
                  className={`block text-center text-sm font-semibold py-3 rounded-xl transition-all mb-3 ${
                    plan.highlighted
                      ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {plan.monthlyPrice === 0 ? 'Get Started Free' : 'Start Free Trial'}
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-400 mt-8">
            After your trial, choose a plan to continue. Payments are handled securely by Lemon Squeezy.
          </p>
        </div>
      </section>

      {/* ── Guides ───────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold tracking-widest uppercase text-indigo-600 mb-3">Help & Guides</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Step-by-step guides for every role</h2>
            <div className="w-14 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto mb-5" />
            <p className="text-gray-500 text-lg">Whether you run the school, teach, or learn — there's a complete guide for you.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { role: 'admin', icon: '🏫', title: 'Admin Guide', desc: 'Set up your school, build courses, and manage everything.' },
              { role: 'instructor', icon: '🎓', title: 'Instructor Guide', desc: 'Create courses, quizzes, assignments, and live classes.' },
              { role: 'student', icon: '📖', title: 'Student Guide', desc: 'Enroll, learn at your own pace, and earn certificates.' },
            ].map((g) => (
              <Link
                key={g.role}
                href={`/guides/${g.role}`}
                className="group flex flex-col items-center text-center p-7 rounded-2xl bg-gray-50 border border-gray-100 hover:border-indigo-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <span className="text-3xl mb-3">{g.icon}</span>
                <h3 className="font-bold text-gray-900 mb-1.5 group-hover:text-indigo-600 transition-colors">{g.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{g.desc}</p>
              </Link>
            ))}
          </div>

          <p className="text-center mt-8">
            <Link href="/guides" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
              Browse all guides →
            </Link>
          </p>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────── */}
      <section id="contact" className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest uppercase text-indigo-600 mb-3">Contact Us</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">We'd love to hear from you</h2>
            <div className="w-14 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto mb-5" />
            <p className="text-gray-500 text-lg">Questions about Coursel? Send us a message, or reach out directly on WhatsApp.</p>
          </div>

          <div className="grid md:grid-cols-5 gap-8 items-start">
            {/* WhatsApp card */}
            <div className="md:col-span-2 flex flex-col gap-4">
              <a
                href="https://wa.me/923054838799?text=Hi%2C%20I%27m%20interested%20in%20Coursel"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-6 rounded-2xl bg-green-50 border border-green-100 hover:border-green-300 hover:shadow-md transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-[#25D366] flex items-center justify-center flex-shrink-0 shadow-md shadow-green-900/10">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12.001 2C6.478 2 2 6.477 2 12c0 1.876.52 3.7 1.505 5.29L2 22l4.86-1.475A9.958 9.958 0 0012.001 22C17.524 22 22 17.523 22 12S17.524 2 12.001 2zm0 18.15a8.13 8.13 0 01-4.146-1.135l-.297-.176-3.096.94.949-3.02-.193-.309A8.13 8.13 0 013.85 12c0-4.5 3.65-8.15 8.151-8.15 4.5 0 8.149 3.65 8.149 8.15 0 4.501-3.649 8.15-8.149 8.15z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Chat on WhatsApp</p>
                  <p className="font-semibold text-gray-900">+92 305 4838799</p>
                </div>
              </a>
              <p className="text-sm text-gray-400 px-1">We typically reply within a few hours during business days.</p>
            </div>

            {/* Contact form */}
            <form
              onSubmit={handleContactSubmit}
              className="md:col-span-3 bg-gray-50 border border-gray-100 rounded-2xl p-6 sm:p-8 space-y-4"
            >
              {/* Honeypot — invisible to real visitors, catches basic bots that fill every field */}
              <input
                type="text"
                name="website"
                value={contactForm.website}
                onChange={(e) => setContactField('website', e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="absolute w-px h-px opacity-0 -z-10 pointer-events-none"
                aria-hidden="true"
              />

              <div className="grid sm:grid-cols-2 gap-4">
                <input
                  type="text"
                  required
                  placeholder="Your name"
                  value={contactForm.name}
                  onChange={(e) => setContactField('name', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="email"
                  required
                  placeholder="Your email"
                  value={contactForm.email}
                  onChange={(e) => setContactField('email', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={contactForm.phone}
                onChange={(e) => setContactField('phone', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <textarea
                required
                rows={4}
                placeholder="How can we help?"
                value={contactForm.message}
                onChange={(e) => setContactField('message', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />

              <button
                type="submit"
                disabled={contactStatus === 'submitting'}
                className="w-full bg-indigo-600 text-white text-sm font-semibold py-3.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {contactStatus === 'submitting' ? 'Sending…' : 'Send Message'}
              </button>

              {contactStatus === 'success' && (
                <p className="text-sm text-green-600 text-center">Thanks — your message has been sent. We'll get back to you soon.</p>
              )}
              {contactStatus === 'error' && (
                <p className="text-sm text-red-600 text-center">Something went wrong. Please try again or reach us on WhatsApp.</p>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="py-10 px-6 border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <span className="font-semibold text-indigo-600">Coursel</span>
          <span>© {new Date().getFullYear()} Coursel. All rights reserved.</span>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/login" className="hover:text-gray-600 transition-colors">Sign in</Link>
            <Link href="/register-tenant" className="hover:text-gray-600 transition-colors">Get started</Link>
            <Link href="/guides" className="hover:text-gray-600 transition-colors">Guides</Link>
            <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms of Service</Link>
            <Link href="/refund-policy" className="hover:text-gray-600 transition-colors">Refund Policy</Link>
            <a
              href="https://www.facebook.com/profile.php?id=61593305887586"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Coursel on Facebook"
              className="hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d={SOCIAL_ICON_PATHS.facebook} />
              </svg>
            </a>
          </div>
        </div>
      </footer>

      {/* ── Floating WhatsApp button ─────────────────────────── */}
      <a
        href="https://wa.me/923054838799?text=Hi%2C%20I%27m%20interested%20in%20Coursel"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        title="Chat with us on WhatsApp"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] shadow-lg shadow-green-900/20 flex items-center justify-center hover:scale-110 hover:shadow-xl transition-all duration-200"
      >
        <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12.001 2C6.478 2 2 6.477 2 12c0 1.876.52 3.7 1.505 5.29L2 22l4.86-1.475A9.958 9.958 0 0012.001 22C17.524 22 22 17.523 22 12S17.524 2 12.001 2zm0 18.15a8.13 8.13 0 01-4.146-1.135l-.297-.176-3.096.94.949-3.02-.193-.309A8.13 8.13 0 013.85 12c0-4.5 3.65-8.15 8.151-8.15 4.5 0 8.149 3.65 8.149 8.15 0 4.501-3.649 8.15-8.149 8.15z" />
        </svg>
      </a>

    </div>
  );
}

// ─── Root Page — detects platform vs tenant ───────────────────────────────────

export default function RootPage() {
  const subdomain = useTenantSubdomain();

  if (subdomain === null) return null; // brief flash prevention

  if (subdomain) return <TenantLandingPage subdomain={subdomain} />;
  return <PlatformLandingPage />;
}
