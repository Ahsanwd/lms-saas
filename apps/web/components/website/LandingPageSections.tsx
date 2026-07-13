'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { executeRecaptcha } from '@/lib/recaptcha';

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
  categoryId: { _id: string; name: string } | null;
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
  about: { heading: string; body: string; imageUrl: string | null; ctaText: string; ctaLink: string };
  coursesSection: {
    heading: string;
    subheading: string;
    displayMode: 'all' | 'category' | 'selected';
    categoryId: string | null;
    courseIds: string[];
    layout: 'grid' | 'slider';
  };
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
function MaybeLink({ href, disabled, className, children, onClick }: { href: string; disabled?: boolean; className: string; children: React.ReactNode; onClick?: () => void }) {
  if (disabled) return <span className={className} onClick={onClick}>{children}</span>;
  return <Link href={href} className={className} onClick={onClick}>{children}</Link>;
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────

export interface NavPage {
  slug: string;
  title: string;
  isHomePage: boolean;
}

export function LandingNavBar({
  logoUrl, displayName, linksDisabled, hasAbout = true, hasTestimonials = true, hasContact = true, pages,
}: {
  logoUrl: string | null; displayName: string; linksDisabled?: boolean;
  hasAbout?: boolean; hasTestimonials?: boolean; hasContact?: boolean;
  // When provided (the real multi-page site), the nav links to actual pages
  // instead of same-page anchors. Omitted in the builder's single-page
  // preview, which falls back to anchor-jumping within that one page.
  pages?: NavPage[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const usingRealPages = !!pages && pages.length > 0;

  const pageLinks = usingRealPages
    ? pages!.map((p) => ({ href: p.isHomePage ? '/' : `/${p.slug}`, label: p.title }))
    : [];

  const anchorLinks = [
    { href: '#home', label: 'Home', show: true },
    { href: '#about', label: 'About', show: hasAbout },
    { href: '#courses', label: 'Courses', show: true },
    { href: '#testimonials', label: 'Testimonials', show: hasTestimonials },
    { href: '#contact', label: 'Contact', show: hasContact },
  ].filter((l) => l.show);

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {logoUrl ? (
          <img src={logoUrl} alt={displayName} className="h-9 object-contain flex-shrink-0" />
        ) : (
          <span className="text-xl font-bold text-primary-600 tracking-tight capitalize flex-shrink-0">{displayName}</span>
        )}

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-7">
          {usingRealPages
            ? pageLinks.map((l) => (
                <MaybeLink key={l.href} href={l.href} disabled={linksDisabled} className="text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors cursor-pointer">
                  {l.label}
                </MaybeLink>
              ))
            : anchorLinks.map((l) => (
                <a key={l.href} href={l.href} className="text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors">
                  {l.label}
                </a>
              ))}
        </div>

        <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
          <MaybeLink href="/login" disabled={linksDisabled} className="text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors cursor-pointer">
            Sign in
          </MaybeLink>
          <MaybeLink href="/register" disabled={linksDisabled} className="text-sm font-semibold bg-secondary-600 text-white px-4 py-2 rounded-lg hover:bg-secondary-700 transition-colors cursor-pointer">
            Sign up free
          </MaybeLink>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="lg:hidden p-2 -mr-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown panel */}
      {menuOpen && (
        <div className="lg:hidden border-t border-gray-100 bg-white px-6 py-4">
          <div className="flex flex-col">
            {usingRealPages
              ? pageLinks.map((l) => (
                  <MaybeLink key={l.href} href={l.href} disabled={linksDisabled} onClick={() => setMenuOpen(false)}
                    className="py-2.5 text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors cursor-pointer">
                    {l.label}
                  </MaybeLink>
                ))
              : anchorLinks.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="py-2.5 text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
          </div>
          <div className="pt-3 mt-2 border-t border-gray-100 flex flex-col gap-2">
            <MaybeLink
              href="/login" disabled={linksDisabled}
              className="text-center text-sm font-medium text-gray-600 hover:text-primary-600 py-2.5 rounded-lg border border-gray-200 cursor-pointer"
            >
              Sign in
            </MaybeLink>
            <MaybeLink
              href="/register" disabled={linksDisabled}
              className="text-center text-sm font-semibold bg-secondary-600 text-white py-2.5 rounded-lg hover:bg-secondary-700 transition-colors cursor-pointer"
            >
              Sign up free
            </MaybeLink>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

export function HeroSection({ hero, displayName, linksDisabled, heightClass = 'min-h-screen' }: { hero: WebsiteContent['hero']; displayName: string; linksDisabled?: boolean; heightClass?: string }) {
  const hasBg = !!hero.backgroundImageUrl;
  const bgStyle = hasBg
    ? { backgroundImage: `url(${hero.backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
  return (
    <section
      id="home"
      className={
        hasBg
          ? `${heightClass} flex flex-col items-center justify-center px-6 text-center relative scroll-mt-16`
          : `${heightClass} flex flex-col items-center justify-center px-6 text-center bg-gradient-to-b from-primary-50 via-white to-white scroll-mt-16`
      }
      style={bgStyle}
    >
      {hasBg && <div className="absolute inset-0 bg-black/50" />}
      <div className={hasBg ? 'max-w-3xl mx-auto relative' : 'max-w-3xl mx-auto'}>
        <h1 className={hasBg ? 'text-5xl sm:text-6xl font-extrabold leading-tight mb-6 text-white' : 'text-5xl sm:text-6xl font-extrabold text-gray-900 leading-tight mb-6'}>
          {hero.headline || <>Learn with <span className="text-primary-600 capitalize">{displayName}</span></>}
        </h1>
        <p className={hasBg ? 'text-lg sm:text-xl mb-10 max-w-xl mx-auto text-gray-100' : 'text-lg sm:text-xl text-gray-500 mb-10 max-w-xl mx-auto'}>
          {hero.subheadline || 'Browse our courses below and start learning today. Sign up for free to enroll.'}
        </p>
        {linksDisabled ? (
          <span className="inline-block bg-primary-600 text-white text-base font-semibold px-9 py-4 rounded-xl shadow-lg shadow-primary-200 cursor-pointer">
            {hero.ctaText || 'Create free account'}
          </span>
        ) : (
          <Link
            href={hero.ctaLink || '/register'}
            className="inline-block bg-primary-600 text-white text-base font-semibold px-9 py-4 rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-200"
          >
            {hero.ctaText || 'Create free account'}
          </Link>
        )}
      </div>

      {/* Scroll cue */}
      <div className={hasBg ? 'absolute bottom-8 left-1/2 -translate-x-1/2 text-white/80 animate-bounce' : 'absolute bottom-8 left-1/2 -translate-x-1/2 text-gray-300 animate-bounce'}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>
  );
}

// ─── About ────────────────────────────────────────────────────────────────────

export function AboutSection({ about, linksDisabled }: { about: WebsiteContent['about']; linksDisabled?: boolean }) {
  if (!about.heading && !about.body) return null;
  return (
    <section id="about" className="py-20 px-6 bg-gray-50 scroll-mt-16">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 items-center min-h-[26rem]">
        {about.imageUrl ? (
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary-100 to-secondary-100 rounded-3xl -z-10 hidden md:block" />
            <img src={about.imageUrl} alt={about.heading} className="w-full h-full max-h-[32rem] rounded-2xl object-cover shadow-xl aspect-square md:aspect-auto" />
          </div>
        ) : (
          <div className="hidden md:flex items-center justify-center h-full max-h-[32rem] rounded-2xl bg-gradient-to-br from-primary-50 to-secondary-50 aspect-square">
            <svg className="w-20 h-20 text-primary-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 8h16M4 4h16v16H4V4z" />
            </svg>
          </div>
        )}
        <div>
          {about.heading && <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-5 leading-tight">{about.heading}</h2>}
          {about.body && <p className="text-gray-600 text-lg leading-relaxed whitespace-pre-line mb-8">{about.body}</p>}
          {about.ctaText && (
            <MaybeLink
              href={about.ctaLink || '/register'}
              disabled={linksDisabled}
              className="inline-block bg-primary-600 text-white text-sm font-semibold px-7 py-3 rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-100 cursor-pointer"
            >
              {about.ctaText}
            </MaybeLink>
          )}
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

// Applies the builder's displayMode/categoryId/courseIds settings. 'all' (the
// default for every tenant who hasn't touched this) returns the list untouched,
// in the same order the API already sorts it — zero behavior change.
function selectCourses(courses: PublicCourse[], cs: WebsiteContent['coursesSection']): PublicCourse[] {
  if (cs.displayMode === 'category' && cs.categoryId) {
    return courses.filter((c) => c.categoryId?._id === cs.categoryId);
  }
  if (cs.displayMode === 'selected' && cs.courseIds.length > 0) {
    const byId = new Map(courses.map((c) => [c._id, c]));
    return cs.courseIds.map((id) => byId.get(id)).filter((c): c is PublicCourse => !!c);
  }
  return courses;
}

function CoursesSlider({ courses, linksDisabled }: { courses: PublicCourse[]; linksDisabled?: boolean }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const CARD_STEP = 320; // card width (288/w-72) + gap-6 (24)

  const scrollBy = (dir: number) => scrollerRef.current?.scrollBy({ left: dir * CARD_STEP, behavior: 'smooth' });
  const scrollToIndex = (i: number) => scrollerRef.current?.scrollTo({ left: i * CARD_STEP, behavior: 'smooth' });

  const handleScroll = () => {
    if (!scrollerRef.current) return;
    setActiveIndex(Math.round(scrollerRef.current.scrollLeft / CARD_STEP));
  };

  const showControls = courses.length > 1;
  const showDots = showControls && courses.length <= 8;

  return (
    <div className="relative">
      {/* Right-edge fade — a visual cue that there's more to scroll, especially on mobile */}
      {showControls && <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-10 bg-gradient-to-l from-white to-transparent z-10" />}

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {courses.map((course) => (
          <div key={course._id} className="snap-start flex-shrink-0 w-72">
            <CourseCard course={course} linksDisabled={linksDisabled} />
          </div>
        ))}
      </div>

      {showControls && (
        <>
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="flex absolute left-1 top-[35%] -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/95 shadow-md border border-gray-200 items-center justify-center text-gray-500 hover:text-primary-600 active:scale-95 transition-all z-20"
            aria-label="Scroll left"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="flex absolute right-1 top-[35%] -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/95 shadow-md border border-gray-200 items-center justify-center text-gray-500 hover:text-primary-600 active:scale-95 transition-all z-20"
            aria-label="Scroll right"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Dot indicators — the clearest "this is swipeable" signal on mobile */}
      {showDots && (
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {courses.map((course, i) => (
            <button
              key={course._id}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to course ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIndex ? 'w-5 bg-primary-600' : 'w-1.5 bg-gray-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CoursesGrid({
  courses, loading, coursesSection, linksDisabled,
}: {
  courses: PublicCourse[]; loading: boolean; coursesSection: WebsiteContent['coursesSection']; linksDisabled?: boolean;
}) {
  const shown = selectCourses(courses, coursesSection);
  return (
    <section id="courses" className="py-14 px-6 bg-white scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            {coursesSection.heading || (loading ? 'Loading courses…' : shown.length > 0 ? `All Courses (${shown.length})` : 'No courses yet')}
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
        ) : shown.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p className="text-lg font-medium">No published courses yet</p>
            <p className="text-sm mt-1">Check back soon!</p>
          </div>
        ) : coursesSection.layout === 'slider' ? (
          <CoursesSlider courses={shown} linksDisabled={linksDisabled} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {shown.map((course) => (
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
    <section id="testimonials" className="py-14 px-6 bg-gray-50 scroll-mt-16">
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
    <section id="contact" className="py-14 px-6 bg-white border-t border-gray-100 scroll-mt-16">
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

// ─── Custom Code ──────────────────────────────────────────────────────────────
// Renders tenant-supplied HTML/CSS/JS inside a sandboxed iframe. Deliberately
// NOT sanitized — the sandbox attribute (allow-scripts only, no
// allow-same-origin) is the security boundary, not input filtering. Never add
// allow-same-origin, allow-top-navigation, or allow-popups here: the iframe
// must keep a unique opaque origin with no access to the parent window,
// cookies, localStorage, or same-origin fetches carrying ambient credentials.
// This protects the platform and other tenants; it does not protect a
// tenant's own visitors from that tenant's own content (same trust model as
// CodePen/Webflow custom-code blocks — a Trust & Safety concern, not a
// technical one). isEnabled is a support/ops kill-switch for abuse reports.
export function CustomCodeSection({ data }: { data: CustomCodeData }) {
  if (data.isEnabled === false) return null;
  if (!data.html && !data.css && !data.js) return null;

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8" /><style>body{margin:0;}${data.css || ''}</style></head><body>${data.html || ''}<script>${data.js || ''}<\/script></body></html>`;

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      style={{ width: '100%', height: `${data.heightPx || 400}px`, border: 'none', display: 'block' }}
      title="Custom section"
    />
  );
}

// ─── Contact Form ─────────────────────────────────────────────────────────────
// Distinct from ContactSection above (which just displays static info) — this
// is a real, submittable form. The only interactive/network-calling section
// in this file; everything else is display-only.

export interface ContactFormData {
  heading: string;
  subheading: string;
  fields: { name: boolean; phone: boolean; subject: boolean }; // email + message are always shown
  recipientEmail: string | null;
}

export function ContactFormSection({
  data, subdomain, pageId, linksDisabled,
}: {
  data: ContactFormData;
  subdomain?: string;
  pageId?: string;
  linksDisabled?: boolean;
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  if (!data) return null;

  const set = (field: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (linksDisabled) return; // builder preview — inert
    setStatus('submitting');
    try {
      const recaptchaToken = await executeRecaptcha('contact_form').catch(() => '');
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/tenant/contact-submissions/submit`,
        { ...form, pageId, recaptchaToken },
        { headers: { 'X-Tenant-Subdomain': subdomain || '' } }
      );
      setStatus('success');
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch {
      setStatus('error');
    }
  }

  const inputCls = 'w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400';

  return (
    <section id="contact-form" className="py-14 px-6 bg-gray-50 scroll-mt-16">
      <div className="max-w-xl mx-auto">
        {(data.heading || data.subheading) && (
          <div className="text-center mb-8">
            {data.heading && <h2 className="text-2xl font-bold text-gray-900">{data.heading}</h2>}
            {data.subheading && <p className="text-gray-500 mt-2">{data.subheading}</p>}
          </div>
        )}
        {status === 'success' ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-gray-200">
            <p className="text-lg font-semibold text-gray-900">Thanks — your message has been sent!</p>
            <p className="text-sm text-gray-500 mt-1">We'll get back to you soon.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            {data.fields?.name && (
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your name" className={inputCls} />
            )}
            <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Your email" className={inputCls} />
            {data.fields?.phone && (
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Phone number" className={inputCls} />
            )}
            {data.fields?.subject && (
              <input value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Subject" className={inputCls} />
            )}
            <textarea required rows={4} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="Your message" className={`${inputCls} resize-none`} />
            {status === 'error' && <p className="text-sm text-red-600">Something went wrong — please try again.</p>}
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-primary-600 text-white text-sm font-semibold py-3 rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {status === 'submitting' ? 'Sending…' : 'Send Message'}
            </button>
            {linksDisabled && <p className="text-xs text-gray-400 text-center">Preview mode — submissions are disabled here.</p>}
          </form>
        )}
      </div>
    </section>
  );
}

// ─── Course Application ────────────────────────────────────────────────────────
// Distinct from ContactFormSection above — a visitor picks a specific course
// they want to join. The course list comes from the courses prop already
// threaded through PageSectionsRenderer (same one CoursesGrid uses), not from
// section-level config.

export interface CourseApplicationData {
  heading: string;
  subheading: string;
}

export function CourseApplicationSection({
  data, courses, subdomain, pageId, linksDisabled,
}: {
  data: CourseApplicationData;
  courses: PublicCourse[];
  subdomain?: string;
  pageId?: string;
  linksDisabled?: boolean;
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', gender: '', courseId: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  if (!data) return null;

  const set = (field: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (linksDisabled) return; // builder preview — inert
    setStatus('submitting');
    try {
      const recaptchaToken = await executeRecaptcha('course_application').catch(() => '');
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/course-applications/submit`,
        { ...form, pageId, recaptchaToken },
        { headers: { 'X-Tenant-Subdomain': subdomain || '' } }
      );
      setStatus('success');
      setForm({ name: '', email: '', phone: '', gender: '', courseId: '' });
    } catch {
      setStatus('error');
    }
  }

  const inputCls = 'w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400';

  return (
    <section id="course-application" className="py-14 px-6 bg-gray-50 scroll-mt-16">
      <div className="max-w-xl mx-auto">
        {(data.heading || data.subheading) && (
          <div className="text-center mb-8">
            {data.heading && <h2 className="text-2xl font-bold text-gray-900">{data.heading}</h2>}
            {data.subheading && <p className="text-gray-500 mt-2">{data.subheading}</p>}
          </div>
        )}
        {status === 'success' ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-gray-200">
            <p className="text-lg font-semibold text-gray-900">Thanks — your application has been submitted!</p>
            <p className="text-sm text-gray-500 mt-1">We'll be in touch once it's reviewed.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your name" className={inputCls} />
            <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Your email" className={inputCls} />
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Phone number" className={inputCls} />
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className={inputCls}>
              <option value="">Gender (optional)</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <select required value={form.courseId} onChange={(e) => set('courseId', e.target.value)} className={inputCls}>
              <option value="">Select a course…</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>{c.title}</option>
              ))}
            </select>
            {status === 'error' && <p className="text-sm text-red-600">Something went wrong — please try again.</p>}
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-primary-600 text-white text-sm font-semibold py-3 rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {status === 'submitting' ? 'Submitting…' : 'Submit Application'}
            </button>
            {linksDisabled && <p className="text-xs text-gray-400 text-center">Preview mode — submissions are disabled here.</p>}
          </form>
        )}
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

// ─── Generic multi-page section renderer ──────────────────────────────────────
// Used by the new multi-page routes (app/[pageSlug]/page.tsx and, going
// forward, the Home page too) — a TenantPage document's sections[] array,
// rendered in order. 'custom' sections render nothing yet (Phase 2).

export interface PageSection {
  _id?: string; // Mongoose-assigned; absent for a section not yet saved
  type: 'hero' | 'about' | 'coursesSection' | 'testimonials' | 'cta' | 'contact' | 'custom' | 'contactForm' | 'courseApplication';
  order: number;
  data: unknown;
}

export interface CustomCodeData {
  html: string;
  css: string;
  js: string;
  heightPx: number;
  isEnabled: boolean;
}

export function PageSectionsRenderer({
  sections, courses, coursesLoading, displayName, logoUrl, linksDisabled, pages, subdomain, pageId,
}: {
  sections: PageSection[];
  courses: PublicCourse[];
  coursesLoading: boolean;
  displayName: string;
  logoUrl: string | null;
  linksDisabled?: boolean;
  pages?: NavPage[];
  subdomain?: string;
  pageId?: string;
}) {
  const hasAbout = sections.some((s) => {
    if (s.type !== 'about') return false;
    const d = s.data as WebsiteContent['about'];
    return !!(d?.heading || d?.body);
  });
  const hasTestimonials = sections.some((s) => s.type === 'testimonials' && Array.isArray(s.data) && s.data.length > 0);
  const hasContact = sections.some((s) => {
    if (s.type !== 'contact') return false;
    const d = s.data as WebsiteContent['contact'];
    return !!(d?.email || d?.phone || d?.address);
  });

  const ordered = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingNavBar
        logoUrl={logoUrl}
        displayName={displayName}
        linksDisabled={linksDisabled}
        hasAbout={hasAbout}
        hasTestimonials={hasTestimonials}
        hasContact={hasContact}
        pages={pages}
      />
      {ordered.map((section, i) => {
        switch (section.type) {
          case 'hero':
            return <HeroSection key={i} hero={section.data as WebsiteContent['hero']} displayName={displayName} linksDisabled={linksDisabled} />;
          case 'about':
            return <AboutSection key={i} about={section.data as WebsiteContent['about']} linksDisabled={linksDisabled} />;
          case 'coursesSection':
            return (
              <CoursesGrid
                key={i}
                courses={courses}
                loading={coursesLoading}
                coursesSection={section.data as WebsiteContent['coursesSection']}
                linksDisabled={linksDisabled}
              />
            );
          case 'testimonials':
            return <TestimonialsSection key={i} testimonials={section.data as Testimonial[]} />;
          case 'cta':
            return <CTASection key={i} cta={section.data as WebsiteContent['cta']} linksDisabled={linksDisabled} />;
          case 'contact':
            return <ContactSection key={i} contact={section.data as WebsiteContent['contact']} />;
          case 'custom':
            return <CustomCodeSection key={i} data={section.data as CustomCodeData} />;
          case 'contactForm':
            return <ContactFormSection key={i} data={section.data as ContactFormData} subdomain={subdomain} pageId={pageId} linksDisabled={linksDisabled} />;
          case 'courseApplication':
            return <CourseApplicationSection key={i} data={section.data as CourseApplicationData} courses={courses} subdomain={subdomain} pageId={pageId} linksDisabled={linksDisabled} />;
          default:
            return null;
        }
      })}
      <LandingFooter displayName={displayName} linksDisabled={linksDisabled} />
    </div>
  );
}

export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  instituteType: null,
  isPublished: false,
  hero: { headline: '', subheadline: '', ctaText: '', ctaLink: '', backgroundImageUrl: null },
  about: { heading: '', body: '', imageUrl: null, ctaText: '', ctaLink: '' },
  coursesSection: { heading: '', subheading: '', displayMode: 'all', categoryId: null, courseIds: [], layout: 'grid' },
  testimonials: [],
  cta: { heading: '', subtext: '', buttonText: '', buttonLink: '' },
  contact: { email: '', phone: '', address: '' },
};
