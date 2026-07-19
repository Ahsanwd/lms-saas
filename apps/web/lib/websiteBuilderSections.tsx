// Shared section-type presentational constants — used by both the website
// builder's editor UI (apps/web/app/(dashboard)/website-builder/page.tsx)
// and PageSectionsRenderer's in-canvas "add section" picker
// (apps/web/components/website/LandingPageSections.tsx). Split out here so
// LandingPageSections.tsx can use them without a circular import (page.tsx
// imports PageSectionsRenderer from there).
//
// DEFAULT_SECTION_DATA intentionally stays in page.tsx — only the builder
// mutates section data, LandingPageSections.tsx only ever renders it.

import type { ReactElement } from 'react';

// Fixed types: 0-or-1 per page. 'custom' is the one repeatable type — any
// number of Custom Code sections are allowed per page.
export type FixedSectionType =
  | 'hero' | 'about' | 'coursesSection' | 'testimonials' | 'cta' | 'contact'
  | 'contactForm' | 'courseApplication' | 'team' | 'bundlesSection' | 'membershipPlansSection';
export type SectionType = FixedSectionType | 'custom';

export const SECTION_TYPE_ORDER: FixedSectionType[] = [
  'hero', 'about', 'coursesSection', 'bundlesSection', 'membershipPlansSection',
  'team', 'testimonials', 'cta', 'contact', 'contactForm', 'courseApplication',
];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero', about: 'About', coursesSection: 'Courses Section',
  testimonials: 'Testimonials', cta: 'Call To Action', contact: 'Contact', custom: 'Custom Code',
  contactForm: 'Contact Form', courseApplication: 'Course Application', team: 'Team / Instructors',
  bundlesSection: 'Bundles Section', membershipPlansSection: 'Membership Plans Section',
};

// One icon per section type, so the outline is scannable at a glance instead
// of every card reading as an identical gray bar (matches the colored
// icon-chip pattern already used for lesson types in the course curriculum).
export const SECTION_ICON_PATHS: Record<SectionType, string> = {
  hero: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  about: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  coursesSection: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  team: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  testimonials: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  cta: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
  contact: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  contactForm: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  courseApplication: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 9l2 2 4-4',
  custom: 'M10 20l4-16M6 8l-4 4 4 4M18 8l4 4-4 4',
  bundlesSection: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  membershipPlansSection: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
};

export function SectionIcon({ type, className = 'w-4 h-4' }: { type: SectionType; className?: string }): ReactElement {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SECTION_ICON_PATHS[type]} />
    </svg>
  );
}
