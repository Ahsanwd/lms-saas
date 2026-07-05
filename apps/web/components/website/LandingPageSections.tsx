'use client';

import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicCourse {
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

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  avatarUrl: string | null;
}

export interface WebsiteContent {
  instituteType: 'school' | 'academy' | 'college' | 'university' | null;
  isPublished: boolean;
  hero: { headline: string; subheadline: string; ctaText: string; ctaLink: string; backgroundImageUrl: string | null };
  about: { heading: string; body: string; imageUrl: string | null };
  coursesSection: { heading: string; subheading: string };
  testimonials: Testimonial[];
  cta: { heading: string; subtext: string; buttonText: string; buttonLink: string };
  contact: { email: string; phone: string; address: string };
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

// Renders a real Link when enabled, or an inert span with the same classes when
// disabled (used in the builder's preview, where nothing should navigate away).
function MaybeLink({ href, disabled, className, children }: { href: string; disabled?: boolean; className: string; children: React.ReactNode }) {
  if (disabled) return <span className={className}>{children}</span>;
  return <Link href={href} className={className}>{children}</Link>;
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────

export function LandingNavBar({ logoUrl, displayName, linksDisabled }: { logoUrl: string | null; displayName: string; linksDisabled?: boolean }) {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {logoUrl ? (
          <img src={logoUrl} alt={displayName} className="h-9 object-contain" />
        ) : (
          <span className="text-xl font-bold text-primary-600 tracking-tight capitalize">{displayName}</span>
        )}
        <div className="flex items-center gap-3">
          <MaybeLink href="/login" disabled={linksDisabled} className="text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors cursor-pointer">
            Sign in
          </MaybeLink>
          <MaybeLink href="/register" disabled={linksDisabled} className="text-sm font-semibold bg-secondary-600 text-white px-4 py-2 rounded-lg hover:bg-secondary-700 transition-colors cursor-pointer">
            Sign up free
          </MaybeLink>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

export function HeroSection({ hero, displayName, linksDisabled }: { hero: WebsiteContent['hero']; displayName: string; linksDisabled?: boolean }) {
  const bgStyle = hero.backgroundImageUrl
    ? { backgroundImage: `url(${hero.backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
  return (
    <section
      className={bgStyle ? 'pt-20 pb-16 px-6 text-center relative' : 'pt-16 pb-12 px-6 text-center bg-gradient-to-b from-primary-50 to-white'}
      style={bgStyle}
    >
      {bgStyle && <div className="absolute inset-0 bg-black/40" />}
      <div className={bgStyle ? 'max-w-2xl mx-auto relative' : 'max-w-2xl mx-auto'}>
        <h1 className={bgStyle ? 'text-4xl font-extrabold leading-tight mb-4 text-white' : 'text-4xl font-extrabold text-gray-900 leading-tight mb-4'}>
          {hero.headline || <>Learn with <span className="text-primary-600 capitalize">{displayName}</span></>}
        </h1>
        <p className={bgStyle ? 'text-base mb-6 max-w-lg mx-auto text-gray-100' : 'text-base text-gray-500 mb-6 max-w-lg mx-auto'}>
          {hero.subheadline || 'Browse our courses below and start learning today. Sign up for free to enroll.'}
        </p>
        {linksDisabled ? (
          <span className="inline-block bg-primary-600 text-white text-sm font-semibold px-7 py-3 rounded-xl shadow-lg shadow-primary-200 cursor-pointer">
            {hero.ctaText || 'Create free account'}
          </span>
        ) : (
          <Link
            href={hero.ctaLink || '/register'}
            className="inline-block bg-primary-600 text-white text-sm font-semibold px-7 py-3 rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-200"
          >
            {hero.ctaText || 'Create free account'}
          </Link>
        )}
      </div>
    </section>
  );
}

// ─── About ────────────────────────────────────────────────────────────────────

export function AboutSection({ about }: { about: WebsiteContent['about'] }) {
  if (!about.heading && !about.body) return null;
  return (
    <section className="py-14 px-6 bg-gray-50">
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
        {about.imageUrl && (
          <img src={about.imageUrl} alt={about.heading} className="w-full rounded-2xl object-cover aspect-video md:aspect-square" />
        )}
        <div className={about.imageUrl ? '' : 'md:col-span-2 text-center max-w-2xl mx-auto'}>
          {about.heading && <h2 className="text-2xl font-bold text-gray-900 mb-3">{about.heading}</h2>}
          {about.body && <p className="text-gray-600 leading-relaxed whitespace-pre-line">{about.body}</p>}
        </div>
      </div>
    </section>
  );
}

// ─── Course Card + Grid ───────────────────────────────────────────────────────

export function CourseCard({ course, linksDisabled }: { course: PublicCourse; linksDisabled?: boolean }) {
  const instructor = course.instructorId;
  const instructorName = instructor ? `${instructor.firstName} ${instructor.lastName}` : 'Instructor';

  return (
    <MaybeLink
      href={`/login?redirect=/courses/${course._id}`}
      disabled={linksDisabled}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-primary-200 transition-all cursor-pointer"
    >
      <div className="relative w-full aspect-video bg-primary-50 overflow-hidden">
        {course.thumbnail ? (
          <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-primary-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
        )}
        <span className="absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-full shadow bg-white text-secondary-600">
          {course.isFree ? 'Free' : `$${course.price}`}
        </span>
      </div>

      <div className="flex flex-col flex-1 p-4">
        {course.categoryId && (
          <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-1">{course.categoryId.name}</span>
        )}
        <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1 line-clamp-2 group-hover:text-primary-600 transition-colors">
          {course.title}
        </h3>
        {course.shortDescription && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{course.shortDescription}</p>}

        <div className="mt-auto space-y-2">
          {course.rating.count > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-500 font-medium">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {course.rating.average.toFixed(1)}
              <span className="text-gray-400">({course.rating.count})</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{LEVEL_LABEL[course.level] ?? course.level}</span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {course.totalLessons} lessons
            </span>
            {course.totalDurationSeconds > 0 && <span>{formatDuration(course.totalDurationSeconds)}</span>}
          </div>
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
    </MaybeLink>
  );
}

export function CoursesGrid({
  courses, loading, coursesSection, linksDisabled,
}: {
  courses: PublicCourse[]; loading: boolean; coursesSection: WebsiteContent['coursesSection']; linksDisabled?: boolean;
}) {
  return (
    <section className="py-14 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            {coursesSection.heading || (loading ? 'Loading courses…' : courses.length > 0 ? `All Courses (${courses.length})` : 'No courses yet')}
          </h2>
          {coursesSection.subheading && <p className="text-gray-500 mt-2 max-w-lg mx-auto">{coursesSection.subheading}</p>}
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
              <CourseCard key={course._id} course={course} linksDisabled={linksDisabled} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

export function TestimonialsSection({ testimonials }: { testimonials: Testimonial[] }) {
  if (!testimonials || testimonials.length === 0) return null;
  return (
    <section className="py-14 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">What our students say</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6">
              <p className="text-gray-600 text-sm leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3">
                {t.avatarUrl ? (
                  <img src={t.avatarUrl} alt={t.name} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-sm font-bold">
                    {t.name?.[0] ?? '?'}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.name || 'Student'}</p>
                  {t.role && <p className="text-xs text-gray-400">{t.role}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────

export function CTASection({ cta, linksDisabled }: { cta: WebsiteContent['cta']; linksDisabled?: boolean }) {
  if (!cta.heading && !cta.subtext) return null;
  return (
    <section className="py-16 px-6 bg-primary-600 text-center">
      <div className="max-w-xl mx-auto">
        {cta.heading && <h2 className="text-2xl font-bold text-white mb-3">{cta.heading}</h2>}
        {cta.subtext && <p className="text-primary-100 mb-6">{cta.subtext}</p>}
        {(cta.buttonText || linksDisabled) && (
          linksDisabled ? (
            <span className="inline-block bg-white text-primary-700 text-sm font-semibold px-7 py-3 rounded-xl cursor-pointer">
              {cta.buttonText || 'Get Started'}
            </span>
          ) : (
            <Link href={cta.buttonLink || '/register'} className="inline-block bg-white text-primary-700 text-sm font-semibold px-7 py-3 rounded-xl hover:bg-primary-50 transition-colors">
              {cta.buttonText || 'Get Started'}
            </Link>
          )
        )}
      </div>
    </section>
  );
}

// ─── Contact ──────────────────────────────────────────────────────────────────

export function ContactSection({ contact }: { contact: WebsiteContent['contact'] }) {
  if (!contact.email && !contact.phone && !contact.address) return null;
  return (
    <section className="py-14 px-6 bg-white border-t border-gray-100">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Get in touch</h2>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-gray-600">
          {contact.email && <span className="flex items-center gap-2">✉️ {contact.email}</span>}
          {contact.phone && <span className="flex items-center gap-2">📞 {contact.phone}</span>}
          {contact.address && <span className="flex items-center gap-2">📍 {contact.address}</span>}
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function LandingFooter({ displayName, linksDisabled }: { displayName: string; linksDisabled?: boolean }) {
  return (
    <footer className="py-8 px-6 border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
        <span className="font-semibold text-primary-600 capitalize">{displayName}</span>
        <span>Powered by <a href="https://coursel.space" className="hover:text-primary-500 transition-colors">Coursel</a></span>
        <div className="flex gap-5">
          <MaybeLink href="/login" disabled={linksDisabled} className="hover:text-gray-600 transition-colors cursor-pointer">Sign in</MaybeLink>
          <MaybeLink href="/register" disabled={linksDisabled} className="hover:text-gray-600 transition-colors cursor-pointer">Sign up</MaybeLink>
        </div>
      </div>
    </footer>
  );
}

export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  instituteType: null,
  isPublished: false,
  hero: { headline: '', subheadline: '', ctaText: '', ctaLink: '', backgroundImageUrl: null },
  about: { heading: '', body: '', imageUrl: null },
  coursesSection: { heading: '', subheading: '' },
  testimonials: [],
  cta: { heading: '', subtext: '', buttonText: '', buttonLink: '' },
  contact: { email: '', phone: '', address: '' },
};
