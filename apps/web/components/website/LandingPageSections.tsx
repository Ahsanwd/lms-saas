'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { executeRecaptcha } from '@/lib/recaptcha';
import { ReorderControls } from '@/components/ui/ReorderControls';
import { SectionIcon, SECTION_LABELS, type SectionType } from '@/lib/websiteBuilderSections';

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

export interface PublicBundle {
  _id: string;
  title: string;
  description: string | null;
  courseIds: { _id: string; title: string; thumbnail: string | null; price: number }[];
  price: number;
}

export interface BundlesSectionData {
  heading: string | null;
  subheading: string | null;
  displayMode: 'all' | 'selected';
  bundleIds: string[];
  layout: 'grid' | 'slider';
}

export interface PublicMembershipPlan {
  _id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  courseAccess: 'all' | 'selected';
  courses: { _id: string; title: string; thumbnail: string | null }[];
  features: string[];
  trialDays: number;
}

export interface MembershipPlansSectionData {
  heading: string | null;
  subheading: string | null;
}

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  avatarUrl: string | null;
  rating?: number; // 1-5, optional — renders a star row when set
}

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  photoUrl: string | null;
  linkedinUrl: string | null;
}

export interface WebsiteContent {
  instituteType: 'school' | 'academy' | 'college' | 'university' | null;
  isPublished: boolean;
  hero: { headline: string; subheadline: string; ctaText: string; ctaLink: string; backgroundImageUrl: string | null; eyebrow?: string; badgeText?: string };
  about: { heading: string; body: string; imageUrl: string | null; ctaText: string; ctaLink: string; eyebrow?: string };
  coursesSection: {
    heading: string;
    subheading: string;
    displayMode: 'all' | 'category' | 'selected';
    categoryId: string | null;
    courseIds: string[];
    layout: 'grid' | 'slider';
    eyebrow?: string;
  };
  testimonials: Testimonial[];
  cta: { heading: string; subtext: string; buttonText: string; buttonLink: string; eyebrow?: string };
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
function MaybeLink({ href, disabled, className, children, onClick, style }: { href: string; disabled?: boolean; className: string; children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  if (disabled) return <span className={className} onClick={onClick} style={style}>{children}</span>;
  return <Link href={href} className={className} onClick={onClick} style={style}>{children}</Link>;
}

// Small bold uppercase label shown above a section heading — the recurring
// "eyebrow" motif used across every redesigned section below. Renders
// nothing when empty so older saved content (with no eyebrow set) looks
// exactly as before.
function SectionEyebrow({ text, align = 'center' }: { text?: string; align?: 'center' | 'left' }) {
  if (!text) return null;
  return (
    <p className={`text-xs font-bold tracking-widest uppercase text-primary-600 mb-3 ${align === 'center' ? 'text-center' : 'text-left'}`}>
      {text}
    </p>
  );
}

// Short gradient accent bar under a section heading — the other half of the
// eyebrow+underline motif. Purely decorative, always renders (unlike the
// eyebrow, which depends on tenant-entered text).
function HeadingAccent({ align = 'center' }: { align?: 'center' | 'left' }) {
  return (
    <div className={`w-14 h-1.5 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 mt-3 mb-1 ${align === 'center' ? 'mx-auto' : ''}`} />
  );
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────

export interface NavPage {
  slug: string;
  title: string;
  isHomePage: boolean;
}

export interface MenuOverride {
  pageSlug: string;
  label: string | null;
  hidden: boolean;
  order: number;
  parentSlug: string | null;
}

export interface HeaderConfig {
  logoHeightPx: number;
  backgroundColor: string;
  menuTextColor: string;
  signInText: string;
  signUpText: string;
  buttonStyle: 'solid' | 'outline';
  menuOverrides: MenuOverride[];
  // Optional extra sandboxed HTML/CSS/JS block rendered below the built-in
  // nav bar — additive, so tenants who never touch it keep today's exact
  // header. Reuses CustomCodeData/CustomCodeSection (declared further down)
  // — same shape and sandboxing as a page-level Custom Code section.
  customCode?: CustomCodeData | null;
}

export type SocialPlatform = 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok';

export interface FooterConfig {
  backgroundColor: string;
  textColor: string;
  tagline: string | null;
  copyrightText: string | null;
  socialLinks: { platform: SocialPlatform; url: string }[];
  // Optional extra sandboxed HTML/CSS/JS block rendered above the built-in
  // footer content — additive, same shape/sandboxing as HeaderConfig's.
  customCode?: CustomCodeData | null;
}

interface NavItem {
  href: string;
  label: string;
  children?: NavItem[];
}

// Merges the tenant's real pages with the Header Builder's menuOverrides
// (rename/hide/reorder/nest) into a ready-to-render tree, one level deep by
// construction — the editor only ever lets a page be nested under a
// TOP-LEVEL page, so a child can never itself have children here. Falls back
// to today's flat, page-order behavior when there are no overrides at all
// (every tenant who hasn't opened the Header Builder yet).
export function buildNavMenu(pages: NavPage[], overrides: MenuOverride[] | undefined): NavItem[] {
  if (!overrides || overrides.length === 0) {
    return pages.map((p) => ({ href: p.isHomePage ? '/' : `/${p.slug}`, label: p.title }));
  }
  const overrideBySlug = new Map(overrides.map((o) => [o.pageSlug, o]));

  type Entry = { slug: string; href: string; label: string; order: number; parentSlug: string | null };
  const visibleSlugs = new Set<string>();
  pages.forEach((p) => {
    const slug = p.isHomePage ? 'home' : p.slug;
    if (!overrideBySlug.get(slug)?.hidden) visibleSlugs.add(slug);
  });

  const visible: Entry[] = pages.reduce<Entry[]>((acc, p, i) => {
    const slug = p.isHomePage ? 'home' : p.slug;
    const o = overrideBySlug.get(slug);
    if (o?.hidden) return acc;
    const parentSlug = o?.parentSlug && o.parentSlug !== slug && visibleSlugs.has(o.parentSlug) ? o.parentSlug : null;
    acc.push({ slug, href: p.isHomePage ? '/' : `/${p.slug}`, label: o?.label || p.title, order: o?.order ?? i, parentSlug });
    return acc;
  }, []);

  const topLevel = visible.filter((e) => !e.parentSlug).sort((a, b) => a.order - b.order);
  return topLevel.map((e) => {
    const children = visible
      .filter((c) => c.parentSlug === e.slug)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ href: c.href, label: c.label }));
    return { href: e.href, label: e.label, ...(children.length ? { children } : {}) };
  });
}

// One-level dropdown, hover-revealed on desktop. Used for any nav item that
// has children (a page another page was nested under via the Header Builder).
function NavDropdown({ item, linkStyle, linkClass, disabled }: { item: NavItem; linkStyle?: React.CSSProperties; linkClass: string; disabled?: boolean }) {
  return (
    <div className="relative group">
      <MaybeLink href={item.href} disabled={disabled} className={`${linkClass} flex items-center gap-1`}>
        <span style={linkStyle}>{item.label}</span>
        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </MaybeLink>
      <div className="absolute left-0 top-full pt-2 hidden group-hover:block z-10">
        <div className="bg-white rounded-lg shadow-lg border border-gray-100 py-1.5 min-w-[160px]">
          {item.children!.map((c) => (
            <MaybeLink key={c.href} href={c.href} disabled={disabled}
              className="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-primary-600 transition-colors cursor-pointer">
              {c.label}
            </MaybeLink>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingNavBar({
  logoUrl, displayName, linksDisabled, hasAbout = true, hasTestimonials = true, hasContact = true, hasTeam = true, pages, headerConfig,
}: {
  logoUrl: string | null; displayName: string; linksDisabled?: boolean;
  hasAbout?: boolean; hasTestimonials?: boolean; hasContact?: boolean; hasTeam?: boolean;
  // When provided (the real multi-page site), the nav links to actual pages
  // instead of same-page anchors. Omitted in the builder's single-page
  // preview, which falls back to anchor-jumping within that one page.
  pages?: NavPage[];
  // Header Builder settings — omitted (or any individual field unset) falls
  // back to today's exact hardcoded look, so existing tenants see no change.
  headerConfig?: HeaderConfig | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const usingRealPages = !!pages && pages.length > 0;

  const navItems: NavItem[] = usingRealPages ? buildNavMenu(pages!, headerConfig?.menuOverrides) : [];

  const anchorLinks = [
    { href: '#home', label: 'Home', show: true },
    { href: '#about', label: 'About', show: hasAbout },
    { href: '#courses', label: 'Courses', show: true },
    { href: '#team', label: 'Team', show: hasTeam },
    { href: '#testimonials', label: 'Testimonials', show: hasTestimonials },
    { href: '#contact', label: 'Contact', show: hasContact },
  ].filter((l) => l.show);

  const hasCustomMenuColor = !!headerConfig?.menuTextColor;
  const linkStyle = hasCustomMenuColor ? { color: headerConfig!.menuTextColor } : undefined;
  const linkClass = hasCustomMenuColor
    ? 'text-sm font-medium transition-opacity hover:opacity-70 cursor-pointer'
    : 'text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors cursor-pointer';

  const navStyle = headerConfig?.backgroundColor ? { backgroundColor: headerConfig.backgroundColor } : undefined;
  const logoHeight = headerConfig?.logoHeightPx ?? 36;
  const signInText = headerConfig?.signInText || 'Sign in';
  const signUpText = headerConfig?.signUpText || 'Sign up free';
  const outlineButton = headerConfig?.buttonStyle === 'outline';

  return (
    <>
    <nav className="sticky top-0 z-50 border-b border-gray-100 shadow-sm" style={navStyle ?? { backgroundColor: '#ffffff' }}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {logoUrl ? (
          <img src={logoUrl} alt={displayName} className="object-contain flex-shrink-0" style={{ height: logoHeight }} />
        ) : (
          <span className="text-xl font-bold text-primary-600 tracking-tight capitalize flex-shrink-0">{displayName}</span>
        )}

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-7">
          {usingRealPages
            ? navItems.map((item) =>
                item.children?.length ? (
                  <NavDropdown key={item.href} item={item} linkStyle={linkStyle} linkClass={linkClass} disabled={linksDisabled} />
                ) : (
                  <MaybeLink key={item.href} href={item.href} disabled={linksDisabled} className={linkClass}>
                    <span style={linkStyle}>{item.label}</span>
                  </MaybeLink>
                )
              )
            : anchorLinks.map((l) => (
                <a key={l.href} href={l.href} className={hasCustomMenuColor ? linkClass : 'text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors'} style={linkStyle}>
                  {l.label}
                </a>
              ))}
        </div>

        <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
          <MaybeLink href="/login" disabled={linksDisabled} className={linkClass}>
            <span style={linkStyle}>{signInText}</span>
          </MaybeLink>
          {outlineButton ? (
            <MaybeLink href="/register" disabled={linksDisabled}
              className="text-sm font-semibold border-2 border-secondary-600 text-secondary-600 px-4 py-2 rounded-lg hover:bg-secondary-600 hover:text-white transition-colors cursor-pointer">
              {signUpText}
            </MaybeLink>
          ) : (
            <MaybeLink href="/register" disabled={linksDisabled} className="text-sm font-semibold bg-secondary-600 text-white px-4 py-2 rounded-lg hover:bg-secondary-700 transition-colors cursor-pointer">
              {signUpText}
            </MaybeLink>
          )}
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
              ? navItems.map((item) => (
                  <div key={item.href}>
                    <MaybeLink href={item.href} disabled={linksDisabled} onClick={() => setMenuOpen(false)}
                      className="py-2.5 text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors cursor-pointer block">
                      {item.label}
                    </MaybeLink>
                    {item.children?.length ? (
                      <div className="pl-4 flex flex-col">
                        {item.children.map((c) => (
                          <MaybeLink key={c.href} href={c.href} disabled={linksDisabled} onClick={() => setMenuOpen(false)}
                            className="py-2 text-sm text-gray-500 hover:text-primary-600 transition-colors cursor-pointer">
                            {c.label}
                          </MaybeLink>
                        ))}
                      </div>
                    ) : null}
                  </div>
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
              {signInText}
            </MaybeLink>
            <MaybeLink
              href="/register" disabled={linksDisabled}
              className={outlineButton
                ? 'text-center text-sm font-semibold border-2 border-secondary-600 text-secondary-600 py-2.5 rounded-lg hover:bg-secondary-600 hover:text-white transition-colors cursor-pointer'
                : 'text-center text-sm font-semibold bg-secondary-600 text-white py-2.5 rounded-lg hover:bg-secondary-700 transition-colors cursor-pointer'}
            >
              {signUpText}
            </MaybeLink>
          </div>
        </div>
      )}
    </nav>
    {headerConfig?.customCode?.isEnabled && <CustomCodeSection data={headerConfig.customCode} />}
    </>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

export function HeroSection({ hero, displayName, linksDisabled, heightClass = 'min-h-screen' }: { hero: WebsiteContent['hero']; displayName: string; linksDisabled?: boolean; heightClass?: string }) {
  const hasImage = !!hero.backgroundImageUrl;
  return (
    <section
      id="home"
      className={`${heightClass} flex items-center px-6 sm:px-10 lg:px-16 py-16 relative bg-gradient-to-b from-primary-50 via-white to-white scroll-mt-16`}
    >
      <div className="max-w-6xl mx-auto w-full grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Left: text */}
        <div className="text-center lg:text-left">
          {hero.eyebrow && (
            <p className="text-xs font-bold tracking-widest uppercase text-primary-600 mb-4">{hero.eyebrow}</p>
          )}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-2">
            {hero.headline || <>Learn with <span className="text-primary-600 capitalize">{displayName}</span></>}
          </h1>
          <div className="w-16 h-1.5 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 mb-6 mx-auto lg:mx-0" />
          <p className="text-lg sm:text-xl text-gray-500 mb-10 max-w-xl mx-auto lg:mx-0">
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

        {/* Right: uploaded image, or a self-contained decorative treatment
            when none is set (no external stock imagery — everything here is
            CSS/SVG) */}
        <div className="relative hidden lg:block">
          {hasImage ? (
            <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-[4/5]">
              <img src={hero.backgroundImageUrl!} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="relative aspect-[4/5] rounded-3xl bg-gradient-to-br from-primary-100 via-primary-50 to-secondary-100 overflow-hidden">
              <div
                className="absolute inset-0 opacity-60"
                style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}
              />
              <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-secondary-200/60 blur-3xl" />
              <div className="absolute -bottom-10 -left-10 w-64 h-64 rounded-full bg-primary-200/60 blur-3xl" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-24 h-24 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
          )}
          {/* Floating stat/quote badge, EduMall-style */}
          {hero.badgeText && (
            <div className="absolute -bottom-6 left-8 bg-white rounded-2xl shadow-xl px-5 py-3.5 border border-gray-100 flex items-center gap-2 max-w-[85%]">
              <span className="text-sm font-semibold text-gray-800">{hero.badgeText}</span>
            </div>
          )}
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-gray-300 animate-bounce">
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
          <SectionEyebrow text={about.eyebrow} align="left" />
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

// Caps the grid to as many columns as there are courses (up to 4) and keeps
// it centered, instead of always reserving 4 columns' width and leaving a
// large empty gap when a tenant only has 1-3 published courses.
function coursesGridClass(count: number): string {
  if (count <= 1) return 'grid grid-cols-1 gap-6 max-w-sm mx-auto';
  if (count === 2) return 'grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto';
  if (count === 3) return 'grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto';
  return 'grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mx-auto';
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
          <SectionEyebrow text={coursesSection.eyebrow} />
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {coursesSection.heading || (loading ? 'Loading courses…' : shown.length > 0 ? `All Courses (${shown.length})` : 'No courses yet')}
          </h2>
          <HeadingAccent />
          {coursesSection.subheading && <p className="text-gray-500 mt-3 max-w-lg mx-auto">{coursesSection.subheading}</p>}
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
          <div className={coursesGridClass(shown.length)}>
            {shown.map((course) => (
              <CourseCard key={course._id} course={course} linksDisabled={linksDisabled} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Bundles ──────────────────────────────────────────────────────────────────

export function BundleCard({ bundle, linksDisabled }: { bundle: PublicBundle; linksDisabled?: boolean }) {
  const worth = bundle.courseIds.reduce((sum, c) => sum + (c.price || 0), 0);
  const savings = worth - bundle.price;
  const thumb = bundle.courseIds.find((c) => c.thumbnail)?.thumbnail ?? null;

  return (
    <MaybeLink
      href="/login?redirect=/bundles"
      disabled={linksDisabled}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-primary-200 transition-all cursor-pointer"
    >
      <div className="relative w-full aspect-video bg-secondary-50 overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={bundle.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-secondary-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}
        <span className="absolute top-2 left-2 text-xs font-bold px-2 py-1 rounded-full shadow bg-white text-primary-600">
          {bundle.courseIds.length} courses
        </span>
        {savings > 0 && (
          <span className="absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-full shadow bg-secondary-600 text-white">
            Save ${savings.toFixed(0)}
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4">
        <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1 line-clamp-2 group-hover:text-primary-600 transition-colors">
          {bundle.title}
        </h3>
        {bundle.description && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{bundle.description}</p>}

        <div className="mt-auto space-y-2">
          <ul className="space-y-0.5">
            {bundle.courseIds.slice(0, 3).map((c) => (
              <li key={c._id} className="text-xs text-gray-500 flex items-center gap-1.5 truncate">
                <svg className="w-3 h-3 text-primary-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="truncate">{c.title}</span>
              </li>
            ))}
            {bundle.courseIds.length > 3 && (
              <li className="text-xs text-gray-400">+{bundle.courseIds.length - 3} more</li>
            )}
          </ul>
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-lg font-bold text-gray-900">${bundle.price.toFixed(0)}</span>
            {savings > 0 && <span className="text-xs text-gray-400 line-through">${worth.toFixed(0)}</span>}
          </div>
        </div>
      </div>
    </MaybeLink>
  );
}

// Applies the builder's displayMode/bundleIds settings — same shape and
// zero-config-default behavior as selectCourses above.
function selectBundles(bundles: PublicBundle[], bs: BundlesSectionData): PublicBundle[] {
  if (bs.displayMode === 'selected' && bs.bundleIds?.length > 0) {
    const byId = new Map(bundles.map((b) => [b._id, b]));
    return bs.bundleIds.map((id) => byId.get(id)).filter((b): b is PublicBundle => !!b);
  }
  return bundles;
}

export function BundlesGrid({
  bundles, loading, bundlesSection, linksDisabled,
}: {
  bundles: PublicBundle[]; loading: boolean; bundlesSection: BundlesSectionData; linksDisabled?: boolean;
}) {
  const shown = selectBundles(bundles, bundlesSection);
  return (
    <section id="bundles" className="py-14 px-6 bg-gray-50 scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            {bundlesSection.heading || (loading ? 'Loading bundles…' : shown.length > 0 ? 'Course Bundles' : 'No bundles yet')}
          </h2>
          {bundlesSection.subheading && <p className="text-gray-500 mt-2 max-w-lg mx-auto">{bundlesSection.subheading}</p>}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-lg font-medium">No bundles published yet</p>
            <p className="text-sm mt-1">Check back soon!</p>
          </div>
        ) : bundlesSection.layout === 'slider' ? (
          <div className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2" style={{ scrollbarWidth: 'none' }}>
            {shown.map((bundle) => (
              <div key={bundle._id} className="snap-start flex-shrink-0 w-72">
                <BundleCard bundle={bundle} linksDisabled={linksDisabled} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {shown.map((bundle) => (
              <BundleCard key={bundle._id} bundle={bundle} linksDisabled={linksDisabled} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Membership Plans ─────────────────────────────────────────────────────────

export function MembershipPlanCard({ plan, yearly, linksDisabled }: { plan: PublicMembershipPlan; yearly: boolean; linksDisabled?: boolean }) {
  const price = yearly ? plan.yearlyPrice : plan.monthlyPrice;
  const isFree = price === 0;

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-primary-200 transition-all p-6">
      <h3 className="font-semibold text-gray-900 text-lg">{plan.name}</h3>
      {plan.description && <p className="text-sm text-gray-500 mt-1">{plan.description}</p>}

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-gray-900">{isFree ? 'Free' : `$${price.toFixed(0)}`}</span>
        {!isFree && <span className="text-sm text-gray-400">/{yearly ? 'year' : 'month'}</span>}
      </div>
      {plan.trialDays > 0 && (
        <span className="mt-2 inline-flex w-fit items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-secondary-50 text-secondary-700">
          {plan.trialDays}-day free trial
        </span>
      )}

      {plan.features.length > 0 && (
        <ul className="mt-4 space-y-2">
          {plan.features.map((f, i) => (
            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
              <svg className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Courses included</p>
        {plan.courseAccess === 'all' ? (
          <p className="text-sm text-gray-700 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            All courses included
          </p>
        ) : plan.courses.length > 0 ? (
          <ul className="space-y-0.5">
            {plan.courses.slice(0, 4).map((c) => (
              <li key={c._id} className="text-sm text-gray-600 flex items-center gap-1.5 truncate">
                <svg className="w-3 h-3 text-primary-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="truncate">{c.title}</span>
              </li>
            ))}
            {plan.courses.length > 4 && <li className="text-xs text-gray-400">+{plan.courses.length - 4} more</li>}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 italic">No courses assigned yet</p>
        )}
      </div>

      <MaybeLink
        href="/login?redirect=/membership"
        disabled={linksDisabled}
        className="mt-6 block text-center text-sm font-semibold bg-primary-600 text-white py-2.5 rounded-xl hover:bg-primary-700 transition-colors cursor-pointer"
      >
        Get Started
      </MaybeLink>
    </div>
  );
}

export function MembershipPlansSection({
  plans, loading, membershipPlansSection, linksDisabled,
}: {
  plans: PublicMembershipPlan[]; loading: boolean; membershipPlansSection: MembershipPlansSectionData; linksDisabled?: boolean;
}) {
  const [yearly, setYearly] = useState(false);
  const hasYearlyDiscount = plans.some((p) => p.yearlyPrice > 0 && p.yearlyPrice < p.monthlyPrice * 12);

  return (
    <section id="membership-plans" className="py-14 px-6 bg-white scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            {membershipPlansSection.heading || (loading ? 'Loading plans…' : plans.length > 0 ? 'Membership Plans' : 'No plans yet')}
          </h2>
          {membershipPlansSection.subheading && <p className="text-gray-500 mt-2 max-w-lg mx-auto">{membershipPlansSection.subheading}</p>}

          {!loading && plans.length > 0 && (
            <div className="inline-flex items-center gap-3 mt-6 bg-gray-100 rounded-full p-1">
              <button type="button" onClick={() => setYearly(false)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${!yearly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                Monthly
              </button>
              <button type="button" onClick={() => setYearly(true)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center gap-1.5 ${yearly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                Yearly
                {hasYearlyDiscount && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-secondary-100 text-secondary-700">Save</span>}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 p-6 animate-pulse space-y-3">
                <div className="h-4 bg-gray-100 rounded w-1/2" />
                <div className="h-8 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            <p className="text-lg font-medium">No membership plans published yet</p>
            <p className="text-sm mt-1">Check back soon!</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <MembershipPlanCard key={plan._id} plan={plan} yearly={yearly} linksDisabled={linksDisabled} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5 mb-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className={`w-4 h-4 ${i < rating ? 'text-amber-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.447a1 1 0 00-.363 1.118l1.287 3.957c.3.921-.755 1.688-1.538 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.783.57-1.838-.197-1.538-1.118l1.287-3.957a1 1 0 00-.363-1.118L2.98 9.384c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.957z" />
        </svg>
      ))}
    </div>
  );
}

export function TestimonialsSection({ testimonials }: { testimonials: Testimonial[] }) {
  if (!testimonials || testimonials.length === 0) return null;
  return (
    <section id="testimonials" className="py-16 px-6 bg-gray-50 scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <SectionEyebrow text="Testimonials" />
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">What our students say</h2>
          <HeadingAccent />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-primary-200 transition-all">
              <span className="block font-serif text-5xl leading-none text-primary-200 mb-1">&ldquo;</span>
              {typeof t.rating === 'number' && t.rating > 0 && <StarRating rating={t.rating} />}
              <p className="text-gray-600 text-sm leading-relaxed mb-5">{t.quote}</p>
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

// ─── Team ─────────────────────────────────────────────────────────────────────

export function TeamSection({ team }: { team: TeamMember[] }) {
  if (!team || team.length === 0) return null;
  return (
    <section id="team" className="py-14 px-6 bg-white scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Meet the Team</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {team.map((m, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
              {m.photoUrl ? (
                <img src={m.photoUrl} alt={m.name} className="w-20 h-20 rounded-full object-cover mx-auto mb-4" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-xl font-bold mx-auto mb-4">
                  {m.name?.[0] ?? '?'}
                </div>
              )}
              <p className="text-sm font-semibold text-gray-900">{m.name || 'Team member'}</p>
              {m.role && <p className="text-xs text-primary-600 font-medium mt-0.5">{m.role}</p>}
              {m.bio && <p className="text-xs text-gray-500 mt-2 leading-relaxed">{m.bio}</p>}
              {m.linkedinUrl && (
                <a href={m.linkedinUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center mt-3 text-gray-400 hover:text-[#0077b5] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              )}
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
    <section className="relative overflow-hidden py-20 px-6 text-center bg-gradient-to-br from-primary-600 to-primary-700">
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{ backgroundImage: 'radial-gradient(#fff 1.5px, transparent 1.5px)', backgroundSize: '26px 26px' }}
      />
      <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-secondary-400/20 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
      <div className="max-w-xl mx-auto relative">
        {cta.eyebrow && <p className="text-xs font-bold tracking-widest uppercase text-primary-100 mb-4">{cta.eyebrow}</p>}
        {cta.heading && <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">{cta.heading}</h2>}
        {cta.subtext && <p className="text-primary-100 text-lg mb-8">{cta.subtext}</p>}
        {(cta.buttonText || linksDisabled) && (
          linksDisabled ? (
            <span className="inline-block bg-white text-primary-700 text-base font-semibold px-8 py-3.5 rounded-xl shadow-lg cursor-pointer">
              {cta.buttonText || 'Get Started'}
            </span>
          ) : (
            <Link href={cta.buttonLink || '/register'} className="inline-block bg-white text-primary-700 text-base font-semibold px-8 py-3.5 rounded-xl shadow-lg hover:bg-primary-50 transition-colors">
              {cta.buttonText || 'Get Started'}
            </Link>
          )
        )}
      </div>
    </section>
  );
}

// ─── Contact ──────────────────────────────────────────────────────────────────

const CONTACT_ICON_PATHS: Record<'email' | 'phone' | 'address', string> = {
  email: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  address: 'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
};

function ContactInfoCard({ type, label, value }: { type: 'email' | 'phone' | 'address'; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center text-center p-6 rounded-2xl border border-gray-200 bg-gray-50">
      <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center mb-4">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={CONTACT_ICON_PATHS[type]} />
        </svg>
      </div>
      <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-1.5">{label}</p>
      <p className="text-sm text-gray-700 break-words">{value}</p>
    </div>
  );
}

export function ContactSection({ contact }: { contact: WebsiteContent['contact'] }) {
  if (!contact.email && !contact.phone && !contact.address) return null;
  return (
    <section id="contact" className="py-16 px-6 bg-white border-t border-gray-100 scroll-mt-16">
      <div className="max-w-4xl mx-auto text-center">
        <SectionEyebrow text="Get In Touch" />
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">We&apos;d love to hear from you</h2>
        <HeadingAccent />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
          {contact.email && <ContactInfoCard type="email" label="Email" value={contact.email} />}
          {contact.phone && <ContactInfoCard type="phone" label="Phone" value={contact.phone} />}
          {contact.address && <ContactInfoCard type="address" label="Address" value={contact.address} />}
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
//
// Height is measured from the iframe's own content instead of a manual px
// field — a small script appended to the sandboxed doc reports
// document.documentElement.scrollHeight via postMessage (the only channel
// available without allow-same-origin, which must never be added here) on
// load, on any ResizeObserver-detected change, and once more after a short
// delay to catch late-loading images/fonts. data.heightPx (still present on
// older saved sections, no longer editable in the builder) is only used as
// the initial paint estimate before the first real measurement arrives.
const CUSTOM_CODE_RESIZE_SCRIPT = `(function(){function report(){try{parent.postMessage({__customCodeHeight:document.documentElement.scrollHeight},'*');}catch(e){}}if(window.ResizeObserver){new ResizeObserver(report).observe(document.body);}window.addEventListener('load',report);report();setTimeout(report,150);})();`;

export function CustomCodeSection({ data }: { data: CustomCodeData }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(data.heightPx || 400);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const measured = e.data?.__customCodeHeight;
      if (typeof measured === 'number' && measured > 0) setHeight(measured);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (data.isEnabled === false) return null;
  if (!data.html && !data.css && !data.js) return null;

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8" /><style>body{margin:0;}${data.css || ''}</style></head><body>${data.html || ''}<script>${data.js || ''}<\/script><script>${CUSTOM_CODE_RESIZE_SCRIPT}<\/script></body></html>`;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-top-navigation-by-user-activation allow-popups allow-popups-to-escape-sandbox allow-forms"
      referrerPolicy="no-referrer"
      style={{ width: '100%', height: `${height}px`, border: 'none', display: 'block', transition: 'height 0.15s ease' }}
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

export const SOCIAL_ICON_PATHS: Record<SocialPlatform, string> = {
  facebook: 'M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z',
  twitter: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  instagram: 'M12 2c-2.72 0-3.06.01-4.12.06-1.06.05-1.79.22-2.43.47a4.92 4.92 0 00-1.78 1.16A4.9 4.9 0 002.5 5.47c-.25.64-.42 1.37-.47 2.43C1.99 8.96 1.98 9.3 1.98 12s.01 3.04.06 4.1c.05 1.06.22 1.79.47 2.43a4.9 4.9 0 001.16 1.78 4.9 4.9 0 001.78 1.16c.64.25 1.37.42 2.43.47 1.06.05 1.4.06 4.12.06s3.06-.01 4.12-.06c1.06-.05 1.79-.22 2.43-.47a4.9 4.9 0 001.78-1.16 4.9 4.9 0 001.16-1.78c.25-.64.42-1.37.47-2.43.05-1.06.06-1.4.06-4.1s-.01-3.04-.06-4.1c-.05-1.06-.22-1.79-.47-2.43a4.9 4.9 0 00-1.16-1.78A4.9 4.9 0 0018.6 2.53c-.64-.25-1.37-.42-2.43-.47C15.11 2.01 14.77 2 12.05 2H12zm0 1.8c2.67 0 2.99.01 4.04.06.98.04 1.51.2 1.86.34.47.18.8.4 1.15.75.35.35.57.68.75 1.15.14.35.3.88.34 1.86.05 1.05.06 1.37.06 4.04s-.01 2.99-.06 4.04c-.04.98-.2 1.51-.34 1.86-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.35.14-.88.3-1.86.34-1.05.05-1.37.06-4.04.06s-2.99-.01-4.04-.06c-.98-.04-1.51-.2-1.86-.34a3.1 3.1 0 01-1.15-.75 3.1 3.1 0 01-.75-1.15c-.14-.35-.3-.88-.34-1.86-.05-1.05-.06-1.37-.06-4.04s.01-2.99.06-4.04c.04-.98.2-1.51.34-1.86.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.35-.14.88-.3 1.86-.34C9.01 3.81 9.33 3.8 12 3.8zm0 3.05a5.15 5.15 0 100 10.3 5.15 5.15 0 000-10.3zm0 8.5a3.35 3.35 0 110-6.7 3.35 3.35 0 010 6.7zm5.35-8.7a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0z',
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  youtube: 'M23.5 6.2a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.56A3.02 3.02 0 00.5 6.2 31.6 31.6 0 000 12a31.6 31.6 0 00.5 5.8 3.02 3.02 0 002.12 2.14c1.88.56 9.38.56 9.38.56s7.5 0 9.38-.56a3.02 3.02 0 002.12-2.14A31.6 31.6 0 0024 12a31.6 31.6 0 00-.5-5.8zM9.6 15.4V8.6l6.4 3.4-6.4 3.4z',
  tiktok: 'M16.6 5.82a4.28 4.28 0 01-3.14-1.36V14.9a5.6 5.6 0 11-4.83-5.55v2.62a3 3 0 103 3.09V.06h2.7a4.28 4.28 0 004.27 4.27v2.7a6.9 6.9 0 01-2-.3z',
};

function resolveCopyrightText(template: string, tenantName: string) {
  return template
    .replace(/\{\{\s*year\s*\}\}/gi, String(new Date().getFullYear()))
    .replace(/\{\{\s*tenantName\s*\}\}/gi, tenantName);
}

export function LandingFooter({ displayName, linksDisabled, footerConfig }: { displayName: string; linksDisabled?: boolean; footerConfig?: FooterConfig | null }) {
  const style = footerConfig?.backgroundColor ? { backgroundColor: footerConfig.backgroundColor } : undefined;
  const textStyle = footerConfig?.textColor ? { color: footerConfig.textColor } : undefined;
  const hasSocial = !!footerConfig?.socialLinks?.length;

  return (
    <>
    {footerConfig?.customCode?.isEnabled && <CustomCodeSection data={footerConfig.customCode} />}
    <footer className="py-8 px-6 border-t border-gray-100" style={style ?? { backgroundColor: '#ffffff' }}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm" style={textStyle ?? { color: '#9ca3af' }}>
          <div className="text-center sm:text-left">
            <span className="font-semibold text-primary-600 capitalize">{displayName}</span>
            {footerConfig?.tagline && <p className="text-xs mt-0.5" style={textStyle}>{footerConfig.tagline}</p>}
          </div>

          {hasSocial && (
            <div className="flex items-center gap-4">
              {footerConfig!.socialLinks.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="hover:opacity-70 transition-opacity" style={textStyle} aria-label={s.platform}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d={SOCIAL_ICON_PATHS[s.platform]} />
                  </svg>
                </a>
              ))}
            </div>
          )}

          <div className="flex gap-5">
            <MaybeLink href="/login" disabled={linksDisabled} className="hover:opacity-70 transition-opacity cursor-pointer" style={textStyle}>Sign in</MaybeLink>
            <MaybeLink href="/register" disabled={linksDisabled} className="hover:opacity-70 transition-opacity cursor-pointer" style={textStyle}>Sign up</MaybeLink>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs pt-3 border-t border-gray-100" style={textStyle ?? { color: '#9ca3af' }}>
          {footerConfig?.copyrightText ? (
            <span>{resolveCopyrightText(footerConfig.copyrightText, displayName)}</span>
          ) : <span />}
          <span>Powered by <a href="https://coursel.space" className="hover:opacity-70 transition-opacity">Coursel</a></span>
        </div>
      </div>
    </footer>
    </>
  );
}

// ─── Generic multi-page section renderer ──────────────────────────────────────
// Used by the new multi-page routes (app/[pageSlug]/page.tsx and, going
// forward, the Home page too) — a TenantPage document's sections[] array,
// rendered in order. 'custom' sections render nothing yet (Phase 2).

export interface PageSection {
  _id?: string; // Mongoose-assigned; absent for a section not yet saved
  type: 'hero' | 'about' | 'coursesSection' | 'testimonials' | 'cta' | 'contact' | 'custom' | 'contactForm' | 'courseApplication' | 'team' | 'bundlesSection' | 'membershipPlansSection';
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

// Builder-only wrapper around a rendered section — adds a hover outline, a
// floating select/reorder/remove toolbar, and an active-state ring. Never
// rendered outside builderMode, so the public site's output is untouched.
function BuilderSectionWrapper({
  index, length, isActive, onSelect, onMove, onRemove, children,
}: {
  index: number;
  length: number;
  isActive: boolean;
  onSelect: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group/section relative cursor-pointer transition-shadow ${
        isActive ? 'ring-2 ring-inset ring-primary-500' : 'hover:ring-2 hover:ring-inset hover:ring-primary-200'
      }`}
    >
      <div
        className={`absolute top-2 right-2 z-30 flex items-center gap-1 bg-white rounded-lg shadow-md border border-gray-200 px-1.5 py-1 transition-opacity ${
          isActive ? 'opacity-100' : 'opacity-0 group-hover/section:opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <ReorderControls index={index} length={length} onMove={onMove} />
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remove section"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}

// Builder-only "add a section here" affordance — a dashed bar that expands
// in place into a widget picker. variant="empty" fills the canvas instead,
// used when the page has no sections at all yet.
function AddSectionPlaceholder({
  availableTypes, onAdd, variant = 'inline',
}: {
  availableTypes: SectionType[];
  onAdd: (type: SectionType) => void;
  variant?: 'inline' | 'empty';
}) {
  const [expanded, setExpanded] = useState(variant === 'empty');
  const pickable: SectionType[] = [...availableTypes, 'custom'];

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-gray-200 text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-sm font-medium">Add section</span>
      </button>
    );
  }

  return (
    <div className={variant === 'empty' ? 'py-20 px-6' : 'py-6 px-6 bg-gray-50 border-y border-gray-100'}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-600">Choose a section to add</p>
          {variant === 'inline' && (
            <button type="button" onClick={() => setExpanded(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {pickable.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onAdd(type);
                if (variant === 'inline') setExpanded(false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-600 transition-colors"
            >
              <SectionIcon type={type} className="w-4 h-4" />
              {SECTION_LABELS[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PageSectionsRenderer({
  sections, courses, coursesLoading, displayName, logoUrl, linksDisabled, pages, subdomain, pageId, headerConfig, footerConfig,
  bundles = [], bundlesLoading = false, membershipPlans = [], membershipPlansLoading = false,
  builderMode = false, activeSectionIndex = null, availableSectionTypes = [],
  onSelectSection, onMoveSection, onRemoveSection, onAddSectionAt,
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
  headerConfig?: HeaderConfig | null;
  footerConfig?: FooterConfig | null;
  bundles?: PublicBundle[];
  bundlesLoading?: boolean;
  membershipPlans?: PublicMembershipPlan[];
  membershipPlansLoading?: boolean;
  // Canvas-first editing mode for the Website Builder — all omitted (the
  // default) so the real public site (app/page.tsx, app/[pageSlug]/page.tsx)
  // renders exactly as before. Only page.tsx's PageEditorScreen passes these.
  builderMode?: boolean;
  activeSectionIndex?: number | null;
  availableSectionTypes?: SectionType[];
  onSelectSection?: (index: number) => void;
  onMoveSection?: (index: number, dir: -1 | 1) => void;
  onRemoveSection?: (index: number) => void;
  onAddSectionAt?: (insertIndex: number, type: SectionType) => void;
}) {
  const hasAbout = sections.some((s) => {
    if (s.type !== 'about') return false;
    const d = s.data as WebsiteContent['about'];
    return !!(d?.heading || d?.body);
  });
  const hasTestimonials = sections.some((s) => s.type === 'testimonials' && Array.isArray(s.data) && s.data.length > 0);
  const hasTeam = sections.some((s) => s.type === 'team' && Array.isArray(s.data) && s.data.length > 0);
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
        hasTeam={hasTeam}
        pages={pages}
        headerConfig={headerConfig}
      />
      {builderMode && ordered.length === 0 && (
        <AddSectionPlaceholder
          variant="empty"
          availableTypes={availableSectionTypes}
          onAdd={(type) => onAddSectionAt?.(0, type)}
        />
      )}
      {ordered.map((section, i) => {
        const el = (() => {
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
            case 'team':
              return <TeamSection key={i} team={section.data as TeamMember[]} />;
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
            case 'bundlesSection':
              return (
                <BundlesGrid
                  key={i}
                  bundles={bundles}
                  loading={bundlesLoading}
                  bundlesSection={section.data as BundlesSectionData}
                  linksDisabled={linksDisabled}
                />
              );
            case 'membershipPlansSection':
              return (
                <MembershipPlansSection
                  key={i}
                  plans={membershipPlans}
                  loading={membershipPlansLoading}
                  membershipPlansSection={section.data as MembershipPlansSectionData}
                  linksDisabled={linksDisabled}
                />
              );
            default:
              return null;
          }
        })();

        if (!builderMode) return el;
        // Some section types render nothing until their fields are filled in
        // (About/Testimonials/Team/Contact all `return null` when empty). A
        // JSX element like <AboutSection .../> is always a truthy object —
        // its own "return null" only happens deep inside React's render, so
        // `el` itself is never null/falsy here and can't be used to detect
        // this. Mirror each component's own emptiness check instead, so the
        // canvas-first builder can stand in a placeholder purely for
        // builderMode; the real public site is unaffected since `el` (not
        // this placeholder) is what non-builder mode returns above.
        const isEmptySection = (() => {
          switch (section.type) {
            case 'about': {
              const d = section.data as WebsiteContent['about'];
              return !d?.heading && !d?.body;
            }
            case 'testimonials':
            case 'team':
              return !Array.isArray(section.data) || section.data.length === 0;
            case 'cta': {
              const d = section.data as WebsiteContent['cta'];
              return !d?.heading && !d?.subtext;
            }
            case 'contact': {
              const d = section.data as WebsiteContent['contact'];
              return !d?.email && !d?.phone && !d?.address;
            }
            default:
              return false;
          }
        })();
        const content = isEmptySection ? (
          <div className="py-14 px-6 text-center text-gray-400 border-y border-dashed border-gray-200 bg-gray-50">
            <p className="text-sm font-medium">{SECTION_LABELS[section.type as SectionType]} — no content yet</p>
            <p className="text-xs mt-1">Fill in its fields on the left to see it here.</p>
          </div>
        ) : el;
        return (
          <BuilderSectionWrapper
            key={i}
            index={i}
            length={ordered.length}
            isActive={activeSectionIndex === i}
            onSelect={() => onSelectSection?.(i)}
            onMove={(dir) => onMoveSection?.(i, dir)}
            onRemove={() => onRemoveSection?.(i)}
          >
            {content}
          </BuilderSectionWrapper>
        );
      })}
      {builderMode && ordered.length > 0 && (
        <AddSectionPlaceholder
          availableTypes={availableSectionTypes}
          onAdd={(type) => onAddSectionAt?.(ordered.length, type)}
        />
      )}
      <LandingFooter displayName={displayName} linksDisabled={linksDisabled} footerConfig={footerConfig} />
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
