'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner, ReorderControls } from '@/components/ui';
import { moveArrayItem } from '@/lib/utils';
import {
  type FixedSectionType,
  type SectionType,
  SECTION_TYPE_ORDER,
  SECTION_LABELS,
  SectionIcon,
} from '@/lib/websiteBuilderSections';
import { AxiosError } from 'axios';
import {
  PageSectionsRenderer,
  LandingNavBar,
  LandingFooter,
  SOCIAL_ICON_PATHS,
  type PageSection,
  type WebsiteContent,
  type PublicCourse,
  type Testimonial,
  type TeamMember,
  type CustomCodeData,
  type ContactFormData,
  type CourseApplicationData,
  type NavPage,
  type HeaderConfig,
  type FooterConfig,
  type MenuOverride,
  type SocialPlatform,
  type BundlesSectionData,
  type PublicBundle,
  type MembershipPlansSectionData,
  type PublicMembershipPlan,
} from '@/components/website/LandingPageSections';

type InstituteType = 'school' | 'academy' | 'college' | 'university';

const DEFAULT_SECTION_DATA: Record<SectionType, unknown> = {
  hero: { headline: '', subheadline: '', ctaText: '', ctaLink: '', backgroundImageUrl: null },
  about: { heading: '', body: '', imageUrl: null, ctaText: '', ctaLink: '' },
  coursesSection: { heading: '', subheading: '', displayMode: 'all', categoryId: null, courseIds: [], layout: 'grid' },
  testimonials: [] as Testimonial[],
  team: [] as TeamMember[],
  cta: { heading: '', subtext: '', buttonText: '', buttonLink: '' },
  contact: { email: '', phone: '', address: '' },
  custom: { html: '', css: '', js: '', heightPx: 400, isEnabled: true } as CustomCodeData,
  contactForm: { heading: 'Get in touch', subheading: '', fields: { name: true, phone: false, subject: true }, recipientEmail: null } as ContactFormData,
  courseApplication: { heading: 'Apply Now', subheading: '' } as CourseApplicationData,
  bundlesSection: { heading: '', subheading: '', displayMode: 'all', bundleIds: [], layout: 'grid' } as BundlesSectionData,
  membershipPlansSection: { heading: '', subheading: '' } as MembershipPlansSectionData,
};

const INSTITUTE_LABELS: Record<InstituteType, string> = {
  school: 'School', academy: 'Academy', college: 'College', university: 'University',
};
const INSTITUTE_ICONS: Record<InstituteType, string> = {
  school: '🏫', academy: '🎯', college: '🎓', university: '🏛️',
};

// Starter copy per institute type, expressed as a full sections[] array — seeded
// into the Home page's first run only (see the institute picker below).
const TEMPLATES: Record<InstituteType, PageSection[]> = {
  school: [
    { type: 'hero', order: 0, data: { headline: 'Where Every Student Finds Their Path', subheadline: 'Engaging online classes designed for young learners, built around a curriculum that grows with them.', ctaText: 'Enroll Today', ctaLink: '/register', backgroundImageUrl: null } },
    { type: 'about', order: 1, data: { heading: 'About Our School', body: 'We believe learning should be joyful and personal. Our teachers combine proven methods with modern tools to help every student build confidence, one lesson at a time.', imageUrl: null, ctaText: 'Meet Our Teachers', ctaLink: '/register' } },
    { type: 'coursesSection', order: 2, data: { heading: 'Our Classes', subheading: 'Pick a class and start learning today.', displayMode: 'all', categoryId: null, courseIds: [], layout: 'grid' } },
    { type: 'testimonials', order: 3, data: [
      { name: 'Amina R.', role: 'Parent', quote: 'My daughter looks forward to class every single day.', avatarUrl: null },
      { name: 'Bilal K.', role: 'Student', quote: 'The teachers actually make learning fun.', avatarUrl: null },
    ] },
    { type: 'cta', order: 4, data: { heading: 'Ready to get started?', subtext: 'Join hundreds of students learning with us.', buttonText: 'Sign Up Free', buttonLink: '/register' } },
    { type: 'contact', order: 5, data: { email: '', phone: '', address: '' } },
  ],
  academy: [
    { type: 'hero', order: 0, data: { headline: 'Master New Skills, Faster', subheadline: 'Practical, hands-on courses taught by industry practitioners — built to get you job-ready.', ctaText: 'Start Learning', ctaLink: '/register', backgroundImageUrl: null } },
    { type: 'about', order: 1, data: { heading: 'About Our Academy', body: 'We focus on real-world skills over theory. Every course is built with input from working professionals, so what you learn today you can use tomorrow.', imageUrl: null, ctaText: 'Meet Our Instructors', ctaLink: '/register' } },
    { type: 'coursesSection', order: 2, data: { heading: 'Explore Our Courses', subheading: 'From beginner to advanced — find your next skill.', displayMode: 'all', categoryId: null, courseIds: [], layout: 'grid' } },
    { type: 'testimonials', order: 3, data: [
      { name: 'Sara M.', role: 'Graduate', quote: 'I landed a job two weeks after finishing the course.', avatarUrl: null },
      { name: 'Usman T.', role: 'Student', quote: 'The instructors actually respond and care about your progress.', avatarUrl: null },
    ] },
    { type: 'cta', order: 4, data: { heading: 'Level up your career', subtext: 'New cohorts starting soon — reserve your seat.', buttonText: 'Get Started', buttonLink: '/register' } },
    { type: 'contact', order: 5, data: { email: '', phone: '', address: '' } },
  ],
  college: [
    { type: 'hero', order: 0, data: { headline: 'Higher Education, Reimagined Online', subheadline: 'Accredited-style programs and expert faculty, accessible from anywhere.', ctaText: 'Apply Now', ctaLink: '/register', backgroundImageUrl: null } },
    { type: 'about', order: 1, data: { heading: 'About Our College', body: 'For years we’ve prepared students for meaningful careers. Our online programs bring the same rigor and mentorship to a flexible, digital-first classroom.', imageUrl: null, ctaText: 'Learn About Our Faculty', ctaLink: '/register' } },
    { type: 'coursesSection', order: 2, data: { heading: 'Our Programs', subheading: 'Structured courses designed by experienced faculty.', displayMode: 'all', categoryId: null, courseIds: [], layout: 'grid' } },
    { type: 'testimonials', order: 3, data: [
      { name: 'Dr. Hina F.', role: 'Alumnus', quote: 'The quality of instruction here rivals any campus program.', avatarUrl: null },
      { name: 'Ali H.', role: 'Current Student', quote: 'Flexible enough to fit around my job, rigorous enough to matter.', avatarUrl: null },
    ] },
    { type: 'cta', order: 4, data: { heading: 'Begin your academic journey', subtext: 'Applications are open for the next intake.', buttonText: 'Apply Now', buttonLink: '/register' } },
    { type: 'contact', order: 5, data: { email: '', phone: '', address: '' } },
  ],
  university: [
    { type: 'hero', order: 0, data: { headline: 'Excellence in Education Since Day One', subheadline: 'A distinguished faculty and a rigorous curriculum, delivered through a modern online campus.', ctaText: 'Explore Programs', ctaLink: '/register', backgroundImageUrl: null } },
    { type: 'about', order: 1, data: { heading: 'About the University', body: 'Our mission is to deliver world-class education without boundaries. Backed by respected faculty and a research-driven curriculum, our online campus serves students everywhere.', imageUrl: null, ctaText: 'Explore Our Faculty', ctaLink: '/register' } },
    { type: 'coursesSection', order: 2, data: { heading: 'Degree & Certificate Programs', subheading: 'Choose from a wide range of accredited-style programs.', displayMode: 'all', categoryId: null, courseIds: [], layout: 'grid' } },
    { type: 'testimonials', order: 3, data: [
      { name: 'Prof. Zara N.', role: 'Faculty', quote: 'Our online cohort performs just as strongly as our on-campus students.', avatarUrl: null },
      { name: 'Hamza S.', role: 'Student', quote: 'The academic rigor here is unmatched by other online platforms.', avatarUrl: null },
    ] },
    { type: 'cta', order: 4, data: { heading: 'Join our next intake', subtext: 'Limited seats available per program.', buttonText: 'Apply Now', buttonLink: '/register' } },
    { type: 'contact', order: 5, data: { email: '', phone: '', address: '' } },
  ],
};

const SAMPLE_COURSES: PublicCourse[] = [
  {
    _id: 'sample-1', title: 'Introduction to the Subject', slug: 'sample-1',
    shortDescription: 'A hands-on beginner course covering all the fundamentals.',
    thumbnail: null, price: 49, isFree: false, level: 'beginner', enrollmentCount: 128,
    rating: { average: 4.8, count: 42 }, totalLessons: 24, totalDurationSeconds: 18000,
    instructorId: { firstName: 'Jane', lastName: 'Doe', avatar: null }, categoryId: { _id: 'sample-cat-1', name: 'Foundations' },
  },
  {
    _id: 'sample-2', title: 'Advanced Concepts & Practice', slug: 'sample-2',
    shortDescription: 'Deepen your understanding with real-world projects.',
    thumbnail: null, price: 0, isFree: true, level: 'intermediate', enrollmentCount: 87,
    rating: { average: 4.6, count: 21 }, totalLessons: 18, totalDurationSeconds: 14400,
    instructorId: { firstName: 'John', lastName: 'Smith', avatar: null }, categoryId: { _id: 'sample-cat-2', name: 'Practice' },
  },
  {
    _id: 'sample-3', title: 'Mastery Track', slug: 'sample-3',
    shortDescription: 'For learners ready to go all the way.',
    thumbnail: null, price: 99, isFree: false, level: 'advanced', enrollmentCount: 53,
    rating: { average: 4.9, count: 15 }, totalLessons: 32, totalDurationSeconds: 27000,
    instructorId: { firstName: 'Amina', lastName: 'Rahim', avatar: null }, categoryId: { _id: 'sample-cat-3', name: 'Mastery' },
  },
];

interface CategoryOption { _id: string; name: string }
interface AdminCourseListItem {
  _id: string; title: string; slug: string; shortDescription: string | null; thumbnail: string | null;
  price: number; isFree: boolean; level: string; enrollmentCount: number;
  rating?: { average: number; count: number }; totalLessons?: number; totalDurationSeconds?: number;
  instructorId: { name: string; avatar: string | null } | null;
  categoryId: { _id: string; name: string } | null;
}

// The builder's authenticated course list uses a single `name` field on the
// instructor (vs the public endpoint's firstName/lastName) — split it so the
// preview can reuse the same shared CourseCard as the real site.
function toPublicCourse(c: AdminCourseListItem): PublicCourse {
  const [firstName, ...rest] = (c.instructorId?.name ?? '').split(' ');
  return {
    _id: c._id, title: c.title, slug: c.slug, shortDescription: c.shortDescription, thumbnail: c.thumbnail,
    price: c.price, isFree: c.isFree, level: c.level, enrollmentCount: c.enrollmentCount,
    rating: c.rating ?? { average: 0, count: 0 }, totalLessons: c.totalLessons ?? 0, totalDurationSeconds: c.totalDurationSeconds ?? 0,
    instructorId: c.instructorId ? { firstName: firstName || 'Instructor', lastName: rest.join(' '), avatar: c.instructorId.avatar } : null,
    categoryId: c.categoryId,
  };
}

interface TenantPageSummary {
  _id: string; slug: string; title: string; isHomePage: boolean; isPublished: boolean; navOrder: number;
}
interface TenantPageFull extends TenantPageSummary {
  instituteType: InstituteType | null;
  sections: PageSection[];
}

const Section = ({ title }: { title: string }) => (
  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-2">{title}</p>
);

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white';
const textareaCls = `${inputCls} resize-none`;

// ═══════════════════════════════════════════════════════════════════════════
// Pages List screen
// ═══════════════════════════════════════════════════════════════════════════
function PagesListScreen({ onEditPage, onEditChrome }: { onEditPage: (id: string) => void; onEditChrome: (chrome: 'header' | 'footer') => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-pages'],
    queryFn: async () => {
      const { data } = await api.get('/tenant/pages');
      return (data.data?.pages ?? []) as TenantPageSummary[];
    },
  });
  const pages = data ?? [];

  const createMutation = useMutation({
    mutationFn: (title: string) => api.post('/tenant/pages', { title }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tenant-pages'] });
      setNewTitle(''); setCreating(false); setError('');
      onEditPage(res.data.data.page._id);
    },
    onError: (e: AxiosError<{ message: string }>) => setError(e.response?.data?.message ?? 'Failed to create page'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tenant/pages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-pages'] }),
  });

  const publishMutation = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) => api.patch(`/tenant/pages/${id}`, { isPublished }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-pages'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => api.post('/tenant/pages/reorder', { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-pages'] }),
  });

  function movePage(id: string, dir: -1 | 1) {
    const others = pages.filter((p) => !p.isHomePage);
    const idx = others.findIndex((p) => p._id === id);
    if (idx === -1) return;
    const moved = moveArrayItem(others, idx, dir);
    reorderMutation.mutate(moved.map((p) => p._id));
  }

  const home = pages.find((p) => p.isHomePage);
  const others = pages.filter((p) => !p.isHomePage);

  if (isLoading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="flex-shrink-0 h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-3">
        <button onClick={() => router.push('/settings')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          title="Back to Settings">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <p className="text-sm font-semibold text-gray-900">Website Builder — Pages</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Site-wide</h2>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => onEditChrome('header')}
                className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-primary-300 hover:shadow-sm transition-all text-left">
                <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 6a2 2 0 012-2h12a2 2 0 012 2m-16 0v10a2 2 0 002 2h12a2 2 0 002-2V6" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Header</p>
                  <p className="text-[11px] text-gray-400">Logo, menu, buttons</p>
                </div>
              </button>
              <button onClick={() => onEditChrome('footer')}
                className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-primary-300 hover:shadow-sm transition-all text-left">
                <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 18h16M4 18a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Footer</p>
                  <p className="text-[11px] text-gray-400">Colors, social links, copyright</p>
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Your Pages</h1>
              <p className="text-sm text-gray-500 mt-0.5">Manage the pages on your public website.</p>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>+ New Page</Button>
          </div>

          {creating && (
            <div className="mb-4 p-4 bg-white border border-gray-200 rounded-xl">
              {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
              <div className="flex gap-2">
                <input autoFocus className={inputCls} placeholder="Page title, e.g. About Us"
                  value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) createMutation.mutate(newTitle.trim()); }} />
                <Button size="sm" loading={createMutation.isPending} disabled={!newTitle.trim()}
                  onClick={() => createMutation.mutate(newTitle.trim())}>Create</Button>
                <button onClick={() => { setCreating(false); setError(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2">Cancel</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {home && (
              <div className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{home.title}</span>
                    <span className="text-[10px] font-bold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded uppercase">Home</span>
                  </div>
                  <p className="text-xs text-gray-400">/</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${home.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {home.isPublished ? 'Live' : 'Draft'}
                </span>
                <button onClick={() => onEditPage(home._id)}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5">Edit</button>
              </div>
            )}

            {others.map((page, i) => (
              <div key={page._id} className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl">
                <ReorderControls index={i} length={others.length} onMove={(dir) => movePage(page._id, dir)} />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-gray-900 truncate block">{page.title}</span>
                  <p className="text-xs text-gray-400">/{page.slug}</p>
                </div>
                <button
                  onClick={() => publishMutation.mutate({ id: page._id, isPublished: !page.isPublished })}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                    page.isPublished ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {page.isPublished ? 'Live' : 'Draft'}
                </button>
                <button onClick={() => onEditPage(page._id)}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5">Edit</button>
                <button
                  onClick={() => { if (confirm(`Delete "${page.title}"? This can't be undone.`)) deleteMutation.mutate(page._id); }}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors" title="Delete page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {others.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No additional pages yet — create one to add About, Contact, or any page you'd like.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// A compact, always-visible list of every section on the page — click a row
// to open its editor below, reorder with the arrows, or remove it. This is
// the left-panel counterpart to clicking a section directly in the canvas
// preview (see BuilderSectionWrapper in LandingPageSections.tsx) — both are
// wired to the same onSelect/onMove/onRemove handlers, so either one works.
function SectionsNavigator({
  sections, activeIndex, onSelect, onMove, onRemove,
}: {
  sections: PageSection[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
}) {
  if (sections.length === 0) return null;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
      {sections.map((section, idx) => (
        <div
          key={section._id ?? idx}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(idx)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(idx); } }}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
            activeIndex === idx ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'
          }`}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium min-w-0">
            <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
              activeIndex === idx ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'
            }`}>
              <SectionIcon type={section.type as SectionType} className="w-3 h-3" />
            </span>
            <span className={`truncate ${activeIndex === idx ? 'text-primary-700' : 'text-gray-700'}`}>
              {SECTION_LABELS[section.type as SectionType]}
              {section.type === 'custom' && ` #${sections.slice(0, idx + 1).filter((s) => s.type === 'custom').length}`}
            </span>
          </span>
          <span className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <ReorderControls index={idx} length={sections.length} onMove={(dir) => onMove(idx, dir)} />
            <button onClick={() => onRemove(idx)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Remove section">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Page Editor screen
// ═══════════════════════════════════════════════════════════════════════════
function PageEditorScreen({ pageId, onBack }: { pageId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [sections, setSections] = useState<PageSection[]>([]);
  const [title, setTitle] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [instituteType, setInstituteType] = useState<InstituteType | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Which section's editor is shown in the left panel — selected by clicking
  // a section (or an "add section" placeholder) in the canvas, or a row in
  // SectionsNavigator.
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(null);
  const heroImgRef = useRef<HTMLInputElement>(null);
  const aboutImgRef = useRef<HTMLInputElement>(null);

  const { data: pageData, isLoading } = useQuery({
    queryKey: ['tenant-page', pageId],
    queryFn: async () => {
      const { data } = await api.get(`/tenant/pages/${pageId}`);
      return data.data.page as TenantPageFull;
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories-website-builder'],
    queryFn: async () => {
      const { data } = await api.get('/courses/categories');
      return (data.data?.categories ?? []) as CategoryOption[];
    },
    staleTime: 60_000,
  });
  const categories = categoriesData ?? [];

  const { data: coursesData } = useQuery({
    queryKey: ['courses-website-builder'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=200&status=published');
      return (data.data?.courses ?? []) as AdminCourseListItem[];
    },
    staleTime: 60_000,
  });
  const allCourses = coursesData ?? [];
  const previewCourses = allCourses.length > 0 ? allCourses.map(toPublicCourse) : SAMPLE_COURSES;

  const { data: bundlesData } = useQuery({
    queryKey: ['bundles-website-builder'],
    queryFn: async () => {
      const { data } = await api.get('/bundles/admin?status=published&limit=200');
      return (data.data?.bundles ?? []) as PublicBundle[];
    },
    staleTime: 60_000,
  });
  const allBundles = bundlesData ?? [];

  const { data: plansData } = useQuery({
    queryKey: ['membership-plans-website-builder'],
    queryFn: async () => {
      const { data } = await api.get('/membership/plans');
      return (data.data?.plans ?? []) as PublicMembershipPlan[];
    },
    staleTime: 60_000,
  });
  const allPlans = plansData ?? [];

  useEffect(() => {
    if (pageData && !loaded) {
      // Sections state is always kept in display order (array index === .order)
      // from here on — every mutation below preserves that invariant, so a
      // plain .map() renders correctly with no separate sort step needed.
      const loadedSections = [...(pageData.sections ?? [])].sort((a, b) => a.order - b.order);
      setSections(loadedSections);
      setTitle(pageData.title);
      setIsPublished(pageData.isPublished);
      setInstituteType(pageData.instituteType);
      // Auto-open the first section so the editor never opens to a blank
      // left panel when a page already has saved content.
      setActiveSectionIndex(loadedSections.length > 0 ? 0 : null);
      setLoaded(true);
    }
  }, [pageData, loaded]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch(`/tenant/pages/${pageId}`, { title, isPublished, instituteType, sections }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-page', pageId] });
      qc.invalidateQueries({ queryKey: ['tenant-pages'] });
      setSaved(true); setSaveError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: AxiosError<{ message: string }>) => setSaveError(e.response?.data?.message ?? 'Save failed'),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file }: { field: 'hero' | 'about' | 'team'; file: File; sectionIndex?: number; memberIndex?: number }) => {
      const fd = new FormData();
      fd.append('image', file);
      return api.post('/tenant/pages/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res, vars) => {
      if (vars.field === 'team') {
        // Team members are repeatable (array within one section), so unlike
        // hero/about below, the target isn't found by type — the caller
        // passes the exact section + member index instead.
        if (vars.sectionIndex === undefined || vars.memberIndex === undefined) return;
        const team = sections[vars.sectionIndex].data as TeamMember[];
        setSectionWholeAt(vars.sectionIndex, team.map((m, j) => j === vars.memberIndex ? { ...m, photoUrl: res.data.data.url } : m));
        return;
      }
      // Hero/About are still 0-or-1 per page, so looking up by type is safe here.
      const idx = sections.findIndex((s) => s.type === vars.field);
      if (idx === -1) return;
      if (vars.field === 'hero') setSectionFieldAt<WebsiteContent['hero']>(idx, 'backgroundImageUrl', res.data.data.url);
      if (vars.field === 'about') setSectionFieldAt<WebsiteContent['about']>(idx, 'imageUrl', res.data.data.url);
    },
    onError: (e: AxiosError<{ message: string }>) => setSaveError(e.response?.data?.message ?? 'Upload failed'),
  });

  // All section mutations are index-based (not type-based) — Custom Code
  // sections are repeatable, so `type` alone can't identify a specific one.
  function setSectionFieldAt<T extends object>(index: number, field: keyof T, value: unknown) {
    setSections((prev) => {
      const current = prev[index].data as T;
      const next = [...prev];
      next[index] = { ...next[index], data: { ...current, [field]: value } };
      return next;
    });
  }

  function setSectionWholeAt(index: number, data: unknown) {
    setSections((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], data };
      return next;
    });
  }

  function hasSection(type: FixedSectionType) { return sections.some((s) => s.type === type); }

  // insertAt lets the canvas's "add section" placeholders insert at a
  // specific position (e.g. before the first section, or after the last);
  // omitting it keeps the original "always append" behavior.
  function addSection(type: SectionType, insertAt?: number) {
    const idx = insertAt === undefined ? sections.length : Math.max(0, Math.min(insertAt, sections.length));
    setSections((prev) => {
      const next = [...prev.slice(0, idx), { type, order: idx, data: DEFAULT_SECTION_DATA[type] }, ...prev.slice(idx)];
      return next.map((s, i) => ({ ...s, order: i }));
    });
    setActiveSectionIndex(idx);
  }

  function removeSectionAt(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
    setActiveSectionIndex((current) => {
      if (current === null) return null;
      if (current < index) return current;
      const newLength = sections.length - 1;
      if (newLength <= 0) return null;
      return Math.min(current === index ? index : current - 1, newLength - 1);
    });
  }

  function moveSectionAt(index: number, dir: -1 | 1) {
    setSections((prev) => moveArrayItem(prev, index, dir).map((s, i) => ({ ...s, order: i })));
    setActiveSectionIndex((current) => {
      if (current === index) return index + dir;
      if (current === index + dir) return index;
      return current;
    });
  }

  function pickInstituteType(type: InstituteType) {
    setInstituteType(type);
    setSections(TEMPLATES[type]);
    setActiveSectionIndex(0);
  }

  if (isLoading || !loaded) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  const isHome = pageData?.isHomePage ?? false;

  // First-run: Home page, no institute type chosen yet, no sections at all.
  if (isHome && !instituteType && sections.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <div className="flex-shrink-0 h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Back to Pages">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <p className="text-sm font-semibold text-gray-900">Website Builder</p>
        </div>
        <div className="flex-1 overflow-y-auto flex items-center justify-center px-6 py-10">
          <div className="max-w-2xl w-full text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">What type of institute are you?</h1>
            <p className="text-sm text-gray-500 mb-10">We'll pre-fill your website with starter copy you can fully edit afterward.</p>
            <div className="grid grid-cols-2 gap-4">
              {(Object.keys(INSTITUTE_LABELS) as InstituteType[]).map((type) => (
                <button key={type} onClick={() => pickInstituteType(type)}
                  className="flex flex-col items-center gap-2 p-6 rounded-2xl border border-gray-200 bg-white hover:border-primary-400 hover:shadow-md transition-all">
                  <span className="text-3xl">{INSTITUTE_ICONS[type]}</span>
                  <span className="font-semibold text-gray-900">{INSTITUTE_LABELS[type]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const availableToAdd = SECTION_TYPE_ORDER.filter((t) => !hasSection(t));

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top toolbar */}
      <div className="flex-shrink-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0" title="Back to Pages">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="text-sm font-semibold text-gray-900 border-none focus:outline-none focus:ring-1 focus:ring-primary-300 rounded px-1 -ml-1 min-w-0" />
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {saveError && <span className="text-xs text-red-600 max-w-[220px] truncate">{saveError}</span>}
          {saved && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Saved
            </span>
          )}
          <button
            onClick={() => setIsPublished((v) => !v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              isPublished ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {isPublished ? '● Live on my website' : '○ Draft — not visible yet'}
          </button>
          <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Save</Button>
        </div>
      </div>

      {/* Body: form + preview */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Panel */}
        <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">

            {isHome && (
              <div className="flex items-center justify-between">
                <Section title="Institute Type" />
                <select value={instituteType ?? ''} onChange={(e) => setInstituteType(e.target.value as InstituteType)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                  {(Object.keys(INSTITUTE_LABELS) as InstituteType[]).map((t) => (
                    <option key={t} value={t}>{INSTITUTE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            )}

            {availableToAdd.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Add a section</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableToAdd.map((t) => (
                    <button key={t} onClick={() => addSection(t)}
                      className="flex items-center gap-1.5 text-xs pl-2 pr-2.5 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 transition-colors">
                      <SectionIcon type={t} className="w-3.5 h-3.5" />
                      {SECTION_LABELS[t]}
                    </button>
                  ))}
                  <button onClick={() => addSection('custom')}
                    className="flex items-center gap-1.5 text-xs pl-2 pr-2.5 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 transition-colors">
                    <SectionIcon type="custom" className="w-3.5 h-3.5" />
                    Custom Code
                  </button>
                </div>
              </div>
            )}

            <SectionsNavigator
              sections={sections}
              activeIndex={activeSectionIndex}
              onSelect={setActiveSectionIndex}
              onMove={moveSectionAt}
              onRemove={removeSectionAt}
            />

            {activeSectionIndex !== null && sections[activeSectionIndex] && (() => {
              const section = sections[activeSectionIndex];
              const idx = activeSectionIndex;
              return (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <span className="w-5 h-5 rounded-md bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                      <SectionIcon type={section.type as SectionType} className="w-3 h-3" />
                    </span>
                    {SECTION_LABELS[section.type as SectionType]}
                    {section.type === 'custom' && ` #${sections.slice(0, idx + 1).filter((s) => s.type === 'custom').length}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <ReorderControls index={idx} length={sections.length} onMove={(dir) => moveSectionAt(idx, dir)} />
                    <button onClick={() => removeSectionAt(idx)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Remove section">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {section.type === 'hero' && (() => {
                    const heroData = section.data as WebsiteContent['hero'];
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Headline</label>
                        <input className={inputCls} value={heroData.headline} onChange={(e) => setSectionFieldAt<WebsiteContent['hero']>(idx, 'headline', e.target.value)} placeholder="Your headline" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subheadline</label>
                        <textarea className={textareaCls} rows={2} value={heroData.subheadline} onChange={(e) => setSectionFieldAt<WebsiteContent['hero']>(idx, 'subheadline', e.target.value)} placeholder="A short supporting sentence" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Text</label>
                          <input className={inputCls} value={heroData.ctaText} onChange={(e) => setSectionFieldAt<WebsiteContent['hero']>(idx, 'ctaText', e.target.value)} placeholder="Get Started" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Link</label>
                          <input className={inputCls} value={heroData.ctaLink} onChange={(e) => setSectionFieldAt<WebsiteContent['hero']>(idx, 'ctaLink', e.target.value)} placeholder="/register" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Background Image</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {heroData.backgroundImageUrl && <img src={heroData.backgroundImageUrl} alt="hero bg" className="h-8 w-12 rounded border border-gray-200 object-cover" />}
                          <button onClick={() => heroImgRef.current?.click()} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                            {heroData.backgroundImageUrl ? 'Change' : 'Upload Image'}
                          </button>
                          {heroData.backgroundImageUrl && <button onClick={() => setSectionFieldAt<WebsiteContent['hero']>(idx, 'backgroundImageUrl', '')} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                          <input ref={heroImgRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate({ field: 'hero', file: f }); e.target.value = ''; }} />
                        </div>
                      </div>
                    </>
                    );
                  })()}

                  {section.type === 'about' && (() => {
                    const aboutData = section.data as WebsiteContent['about'];
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={aboutData.heading} onChange={(e) => setSectionFieldAt<WebsiteContent['about']>(idx, 'heading', e.target.value)} placeholder="About Us" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
                        <textarea className={textareaCls} rows={4} value={aboutData.body} onChange={(e) => setSectionFieldAt<WebsiteContent['about']>(idx, 'body', e.target.value)} placeholder="Tell visitors about your institute" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Image</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {aboutData.imageUrl && <img src={aboutData.imageUrl} alt="about" className="h-8 w-12 rounded border border-gray-200 object-cover" />}
                          <button onClick={() => aboutImgRef.current?.click()} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                            {aboutData.imageUrl ? 'Change' : 'Upload Image'}
                          </button>
                          {aboutData.imageUrl && <button onClick={() => setSectionFieldAt<WebsiteContent['about']>(idx, 'imageUrl', '')} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                          <input ref={aboutImgRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate({ field: 'about', file: f }); e.target.value = ''; }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Text (optional)</label>
                          <input className={inputCls} value={aboutData.ctaText} onChange={(e) => setSectionFieldAt<WebsiteContent['about']>(idx, 'ctaText', e.target.value)} placeholder="Learn More" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Link</label>
                          <input className={inputCls} value={aboutData.ctaLink} onChange={(e) => setSectionFieldAt<WebsiteContent['about']>(idx, 'ctaLink', e.target.value)} placeholder="/register" />
                        </div>
                      </div>
                    </>
                    );
                  })()}

                  {section.type === 'coursesSection' && (() => {
                    const coursesSectionData = section.data as WebsiteContent['coursesSection'];
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={coursesSectionData.heading} onChange={(e) => setSectionFieldAt<WebsiteContent['coursesSection']>(idx, 'heading', e.target.value)} placeholder="Our Courses" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subheading</label>
                        <input className={inputCls} value={coursesSectionData.subheading} onChange={(e) => setSectionFieldAt<WebsiteContent['coursesSection']>(idx, 'subheading', e.target.value)} placeholder="Optional subheading" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Which Courses to Show</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['all', 'category', 'selected'] as const).map((mode) => (
                            <button key={mode} onClick={() => setSectionFieldAt<WebsiteContent['coursesSection']>(idx, 'displayMode', mode)}
                              className={`py-2 text-xs rounded-lg border font-medium transition-colors ${
                                coursesSectionData.displayMode === mode ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}>
                              {mode === 'all' ? 'All Courses' : mode === 'category' ? 'By Category' : 'Selected'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {coursesSectionData.displayMode === 'category' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                          <select className={inputCls} value={coursesSectionData.categoryId ?? ''}
                            onChange={(e) => setSectionFieldAt<WebsiteContent['coursesSection']>(idx, 'categoryId', e.target.value || null)}>
                            <option value="">Select a category…</option>
                            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                          </select>
                          {categories.length === 0 && <p className="text-xs text-gray-400 mt-1">No categories yet.</p>}
                        </div>
                      )}
                      {coursesSectionData.displayMode === 'selected' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Choose Courses <span className="text-gray-400 font-normal">(check to add, arrows to reorder)</span>
                          </label>
                          {allCourses.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No published courses yet</p>
                          ) : (
                            <div className="border border-gray-200 rounded-xl max-h-60 overflow-y-auto divide-y divide-gray-50">
                              {allCourses.map((c) => {
                                const ids = coursesSectionData.courseIds;
                                const idx2 = ids.indexOf(c._id);
                                const selected = idx2 !== -1;
                                return (
                                  <div key={c._id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                                    <input type="checkbox" checked={selected}
                                      onChange={() => setSectionFieldAt<WebsiteContent['coursesSection']>(idx, 'courseIds', selected ? ids.filter((x) => x !== c._id) : [...ids, c._id])}
                                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 truncate flex-1">{selected ? `${idx2 + 1}. ` : ''}{c.title}</span>
                                    {selected && (
                                      <ReorderControls index={idx2} length={ids.length}
                                        onMove={(dir) => setSectionFieldAt<WebsiteContent['coursesSection']>(idx, 'courseIds', moveArrayItem(ids, idx2, dir))} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <p className="text-xs text-gray-400 mt-1">{coursesSectionData.courseIds.length} selected</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Layout</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['grid', 'slider'] as const).map((l) => (
                            <button key={l} onClick={() => setSectionFieldAt<WebsiteContent['coursesSection']>(idx, 'layout', l)}
                              className={`py-2 text-xs rounded-lg border capitalize font-medium transition-colors ${
                                coursesSectionData.layout === l ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}>
                              {l}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Slider works well if you have many courses.</p>
                      </div>
                    </>
                    );
                  })()}

                  {section.type === 'bundlesSection' && (() => {
                    const bundlesSectionData = section.data as BundlesSectionData;
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={bundlesSectionData.heading ?? ''} onChange={(e) => setSectionFieldAt<BundlesSectionData>(idx, 'heading', e.target.value)} placeholder="Course Bundles" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subheading</label>
                        <input className={inputCls} value={bundlesSectionData.subheading ?? ''} onChange={(e) => setSectionFieldAt<BundlesSectionData>(idx, 'subheading', e.target.value)} placeholder="Optional subheading" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Which Bundles to Show</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['all', 'selected'] as const).map((mode) => (
                            <button key={mode} onClick={() => setSectionFieldAt<BundlesSectionData>(idx, 'displayMode', mode)}
                              className={`py-2 text-xs rounded-lg border font-medium transition-colors ${
                                bundlesSectionData.displayMode === mode ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}>
                              {mode === 'all' ? 'All Bundles' : 'Selected'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {bundlesSectionData.displayMode === 'selected' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Choose Bundles <span className="text-gray-400 font-normal">(check to add, arrows to reorder)</span>
                          </label>
                          {allBundles.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No published bundles yet</p>
                          ) : (
                            <div className="border border-gray-200 rounded-xl max-h-60 overflow-y-auto divide-y divide-gray-50">
                              {allBundles.map((b) => {
                                const ids = bundlesSectionData.bundleIds;
                                const idx2 = ids.indexOf(b._id);
                                const selected = idx2 !== -1;
                                return (
                                  <div key={b._id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                                    <input type="checkbox" checked={selected}
                                      onChange={() => setSectionFieldAt<BundlesSectionData>(idx, 'bundleIds', selected ? ids.filter((x) => x !== b._id) : [...ids, b._id])}
                                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 truncate flex-1">{selected ? `${idx2 + 1}. ` : ''}{b.title}</span>
                                    {selected && (
                                      <ReorderControls index={idx2} length={ids.length}
                                        onMove={(dir) => setSectionFieldAt<BundlesSectionData>(idx, 'bundleIds', moveArrayItem(ids, idx2, dir))} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <p className="text-xs text-gray-400 mt-1">{bundlesSectionData.bundleIds.length} selected</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Layout</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['grid', 'slider'] as const).map((l) => (
                            <button key={l} onClick={() => setSectionFieldAt<BundlesSectionData>(idx, 'layout', l)}
                              className={`py-2 text-xs rounded-lg border capitalize font-medium transition-colors ${
                                bundlesSectionData.layout === l ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                      {allBundles.length === 0 && (
                        <p className="text-xs text-amber-600">You don't have any published bundles yet — create one under Bundles first.</p>
                      )}
                    </>
                    );
                  })()}

                  {section.type === 'membershipPlansSection' && (() => {
                    const plansSectionData = section.data as MembershipPlansSectionData;
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={plansSectionData.heading ?? ''} onChange={(e) => setSectionFieldAt<MembershipPlansSectionData>(idx, 'heading', e.target.value)} placeholder="Membership Plans" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subheading</label>
                        <input className={inputCls} value={plansSectionData.subheading ?? ''} onChange={(e) => setSectionFieldAt<MembershipPlansSectionData>(idx, 'subheading', e.target.value)} placeholder="Optional subheading" />
                      </div>
                      <p className="text-xs text-gray-400">
                        Shows every active plan from Monetization → Membership Plans, with its price, features, and which courses it includes. To hide a plan from this section, deactivate it there.
                      </p>
                      {allPlans.length === 0 && (
                        <p className="text-xs text-amber-600">You don't have any active membership plans yet — create one under Membership Plans first.</p>
                      )}
                    </>
                    );
                  })()}

                  {section.type === 'testimonials' && (() => {
                    const testimonialsData = section.data as Testimonial[];
                    return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">{testimonialsData.length} / 6</span>
                      </div>
                      {testimonialsData.map((t, i) => (
                        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between -mt-0.5 -mr-0.5">
                            <span className="text-xs font-medium text-gray-400">Testimonial {i + 1}</span>
                            <div className="flex items-center gap-1">
                              <ReorderControls index={i} length={testimonialsData.length} onMove={(dir) => setSectionWholeAt(idx, moveArrayItem(testimonialsData, i, dir))} />
                              <button onClick={() => setSectionWholeAt(idx, testimonialsData.filter((_, j) => j !== i))} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Remove">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <input className={inputCls} value={t.name} onChange={(e) => setSectionWholeAt(idx, testimonialsData.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" />
                          <input className={inputCls} value={t.role} onChange={(e) => setSectionWholeAt(idx, testimonialsData.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role (e.g. Student)" />
                          <textarea className={textareaCls} rows={2} value={t.quote} onChange={(e) => setSectionWholeAt(idx, testimonialsData.map((x, j) => j === i ? { ...x, quote: e.target.value } : x))} placeholder="Quote" />
                        </div>
                      ))}
                      {testimonialsData.length === 0 && <p className="text-xs text-gray-400">No testimonials yet — add up to 6.</p>}
                      {testimonialsData.length < 6 && (
                        <button onClick={() => setSectionWholeAt(idx, [...testimonialsData, { name: '', role: '', quote: '', avatarUrl: null }])}
                          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary-600 border-2 border-dashed border-primary-200 rounded-lg py-2 hover:border-primary-400 hover:bg-primary-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Add Testimonial
                        </button>
                      )}
                    </>
                    );
                  })()}

                  {section.type === 'team' && (() => {
                    const teamData = section.data as TeamMember[];
                    return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">{teamData.length} / 20</span>
                      </div>
                      {teamData.map((m, i) => (
                        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between -mt-0.5 -mr-0.5">
                            <span className="text-xs font-medium text-gray-400">Member {i + 1}</span>
                            <div className="flex items-center gap-1">
                              <ReorderControls index={i} length={teamData.length} onMove={(dir) => setSectionWholeAt(idx, moveArrayItem(teamData, i, dir))} />
                              <button onClick={() => setSectionWholeAt(idx, teamData.filter((_, j) => j !== i))} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Remove">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {m.photoUrl ? (
                              <img src={m.photoUrl} alt={m.name} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0" />
                            )}
                            <label className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors cursor-pointer">
                              {m.photoUrl ? 'Change' : 'Upload Photo'}
                              <input type="file" accept="image/*" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate({ field: 'team', file: f, sectionIndex: idx, memberIndex: i }); e.target.value = ''; }} />
                            </label>
                            {m.photoUrl && (
                              <button onClick={() => setSectionWholeAt(idx, teamData.map((x, j) => j === i ? { ...x, photoUrl: null } : x))} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                            )}
                          </div>
                          <input className={inputCls} value={m.name} onChange={(e) => setSectionWholeAt(idx, teamData.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" />
                          <input className={inputCls} value={m.role} onChange={(e) => setSectionWholeAt(idx, teamData.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role (e.g. Lead Instructor)" />
                          <textarea className={textareaCls} rows={2} value={m.bio} onChange={(e) => setSectionWholeAt(idx, teamData.map((x, j) => j === i ? { ...x, bio: e.target.value } : x))} placeholder="Short bio (optional)" />
                          <input className={inputCls} value={m.linkedinUrl ?? ''} onChange={(e) => setSectionWholeAt(idx, teamData.map((x, j) => j === i ? { ...x, linkedinUrl: e.target.value || null } : x))} placeholder="LinkedIn URL (optional)" />
                        </div>
                      ))}
                      {teamData.length === 0 && <p className="text-xs text-gray-400">No team members yet — add up to 20.</p>}
                      {teamData.length < 20 && (
                        <button onClick={() => setSectionWholeAt(idx, [...teamData, { name: '', role: '', bio: '', photoUrl: null, linkedinUrl: null }])}
                          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary-600 border-2 border-dashed border-primary-200 rounded-lg py-2 hover:border-primary-400 hover:bg-primary-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Add Team Member
                        </button>
                      )}
                    </>
                    );
                  })()}

                  {section.type === 'cta' && (() => {
                    const ctaData = section.data as WebsiteContent['cta'];
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={ctaData.heading} onChange={(e) => setSectionFieldAt<WebsiteContent['cta']>(idx, 'heading', e.target.value)} placeholder="Ready to get started?" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subtext</label>
                        <input className={inputCls} value={ctaData.subtext} onChange={(e) => setSectionFieldAt<WebsiteContent['cta']>(idx, 'subtext', e.target.value)} placeholder="Optional supporting text" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Text</label>
                          <input className={inputCls} value={ctaData.buttonText} onChange={(e) => setSectionFieldAt<WebsiteContent['cta']>(idx, 'buttonText', e.target.value)} placeholder="Get Started" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Link</label>
                          <input className={inputCls} value={ctaData.buttonLink} onChange={(e) => setSectionFieldAt<WebsiteContent['cta']>(idx, 'buttonLink', e.target.value)} placeholder="/register" />
                        </div>
                      </div>
                    </>
                    );
                  })()}

                  {section.type === 'contact' && (() => {
                    const contactData = section.data as WebsiteContent['contact'];
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                        <input className={inputCls} value={contactData.email} onChange={(e) => setSectionFieldAt<WebsiteContent['contact']>(idx, 'email', e.target.value)} placeholder="info@example.com" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                        <input className={inputCls} value={contactData.phone} onChange={(e) => setSectionFieldAt<WebsiteContent['contact']>(idx, 'phone', e.target.value)} placeholder="+1 555 000 0000" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                        <input className={inputCls} value={contactData.address} onChange={(e) => setSectionFieldAt<WebsiteContent['contact']>(idx, 'address', e.target.value)} placeholder="123 Main St, City" />
                      </div>
                    </>
                    );
                  })()}

                  {section.type === 'contactForm' && (() => {
                    const formData = section.data as ContactFormData;
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={formData.heading} onChange={(e) => setSectionFieldAt<ContactFormData>(idx, 'heading', e.target.value)} placeholder="Get in touch" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subheading</label>
                        <input className={inputCls} value={formData.subheading} onChange={(e) => setSectionFieldAt<ContactFormData>(idx, 'subheading', e.target.value)} placeholder="Optional subheading" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Fields to Show</label>
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-2 text-xs text-gray-400">
                            <input type="checkbox" checked disabled className="w-4 h-4 rounded border-gray-300" />
                            Email <span className="text-gray-300">(always shown)</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs text-gray-400">
                            <input type="checkbox" checked disabled className="w-4 h-4 rounded border-gray-300" />
                            Message <span className="text-gray-300">(always shown)</span>
                          </label>
                          {(['name', 'phone', 'subject'] as const).map((f) => (
                            <label key={f} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                              <input type="checkbox" checked={formData.fields[f]}
                                onChange={(e) => setSectionFieldAt<ContactFormData>(idx, 'fields', { ...formData.fields, [f]: e.target.checked })}
                                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                              {f === 'name' ? 'Name' : f === 'phone' ? 'Phone' : 'Subject'}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Recipient Email <span className="text-gray-400 font-normal">(optional override)</span>
                        </label>
                        <input className={inputCls} value={formData.recipientEmail ?? ''}
                          onChange={(e) => setSectionFieldAt<ContactFormData>(idx, 'recipientEmail', e.target.value || null)}
                          placeholder="Defaults to your account's contact email" />
                      </div>
                    </>
                    );
                  })()}

                  {section.type === 'courseApplication' && (() => {
                    const appData = section.data as CourseApplicationData;
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={appData.heading} onChange={(e) => setSectionFieldAt<CourseApplicationData>(idx, 'heading', e.target.value)} placeholder="Apply Now" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subheading</label>
                        <input className={inputCls} value={appData.subheading} onChange={(e) => setSectionFieldAt<CourseApplicationData>(idx, 'subheading', e.target.value)} placeholder="Optional subheading" />
                      </div>
                      <p className="text-xs text-gray-400">Name, Email, and Course are always shown. Phone and Gender are optional for the visitor to fill.</p>
                    </>
                    );
                  })()}

                  {section.type === 'custom' && (() => {
                    const customData = section.data as CustomCodeData;
                    return (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">HTML</label>
                        <textarea className={`${textareaCls} font-mono text-xs`} rows={5} value={customData.html}
                          onChange={(e) => setSectionFieldAt<CustomCodeData>(idx, 'html', e.target.value)} placeholder="<div>...</div>" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">CSS</label>
                        <textarea className={`${textareaCls} font-mono text-xs`} rows={4} value={customData.css}
                          onChange={(e) => setSectionFieldAt<CustomCodeData>(idx, 'css', e.target.value)} placeholder=".my-class { ... }" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">JavaScript</label>
                        <textarea className={`${textareaCls} font-mono text-xs`} rows={4} value={customData.js}
                          onChange={(e) => setSectionFieldAt<CustomCodeData>(idx, 'js', e.target.value)} placeholder="console.log('hello');" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Height <span className="text-gray-400 font-normal">(px)</span>
                        </label>
                        <input type="number" min={50} max={4000} className={inputCls} value={customData.heightPx}
                          onChange={(e) => setSectionFieldAt<CustomCodeData>(idx, 'heightPx', Math.max(50, Number(e.target.value) || 400))} />
                      </div>
                      <p className="text-xs text-gray-400">
                        Runs in a sandboxed frame — it can't access your site's cookies, login sessions, or other tenants' data.
                      </p>
                    </>
                    );
                  })()}
                </div>
              </div>
              );
            })()}

            {sections.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-10 border border-dashed border-gray-200 rounded-xl">
                <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-6 4h6m2 5H7a2 2 0 01-2-2V4a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V20a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700">No sections yet</p>
                <p className="text-xs text-gray-400 mt-0.5">Add one above to start building this page.</p>
              </div>
            )}

            <div className="pb-6" />
          </div>
        </div>

        {/* Right Panel: Preview */}
        <div className="flex-1 bg-gray-100 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-800">Live Preview</p>
            <p className="text-xs text-gray-400">
              {allCourses.length > 0 ? 'Your real published courses' : 'Sample courses shown — add courses to see them here'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <PageSectionsRenderer
              sections={sections}
              courses={previewCourses}
              coursesLoading={false}
              displayName="Your School"
              logoUrl={null}
              linksDisabled
              bundles={allBundles}
              membershipPlans={allPlans}
              builderMode
              activeSectionIndex={activeSectionIndex}
              availableSectionTypes={availableToAdd}
              onSelectSection={setActiveSectionIndex}
              onMoveSection={moveSectionAt}
              onRemoveSection={removeSectionAt}
              onAddSectionAt={(insertIndex, type) => addSection(type, insertIndex)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Header Builder
// ═══════════════════════════════════════════════════════════════════════════
const DEFAULT_HEADER: HeaderConfig = {
  logoHeightPx: 36, backgroundColor: '#ffffff', menuTextColor: '#4b5563',
  signInText: 'Sign in', signUpText: 'Sign up free', buttonStyle: 'solid', menuOverrides: [],
};

function HeaderEditorScreen({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<HeaderConfig>(DEFAULT_HEADER);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const { data: hfData, isLoading: hfLoading } = useQuery({
    queryKey: ['header-footer'],
    queryFn: async () => {
      const { data } = await api.get('/tenant/header-footer');
      return data.data as { header: HeaderConfig; footer: FooterConfig };
    },
  });

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ['tenant-pages'],
    queryFn: async () => {
      const { data } = await api.get('/tenant/pages');
      return (data.data?.pages ?? []) as TenantPageSummary[];
    },
  });

  const { data: tenantInfo } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: async () => {
      const { data } = await api.get('/tenant');
      return data.data.tenant as { name: string; settings?: { logo?: string | null } };
    },
  });

  // Materialize one override row per current page — merges any saved
  // override with a default for pages that don't have one yet — so Save
  // always writes a complete, unambiguous list rather than a partial diff.
  useEffect(() => {
    if (!hfData || !pages || loaded) return;
    const savedBySlug = new Map(hfData.header.menuOverrides.map((o) => [o.pageSlug, o]));
    const merged: MenuOverride[] = pages.map((p, i) => {
      const slug = p.isHomePage ? 'home' : p.slug;
      return savedBySlug.get(slug) ?? { pageSlug: slug, label: null, hidden: false, order: i, parentSlug: null };
    });
    setForm({ ...DEFAULT_HEADER, ...hfData.header, menuOverrides: merged });
    setLoaded(true);
  }, [hfData, pages, loaded]);

  const set = <K extends keyof HeaderConfig>(k: K, v: HeaderConfig[K]) => setForm((prev) => ({ ...prev, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/tenant/header-footer', { header: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['header-footer'] });
      setSaved(true); setSaveError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: AxiosError<{ message: string }>) => setSaveError(e.response?.data?.message ?? 'Save failed'),
  });

  function handleResetAppearance() {
    if (confirm('Reset header appearance (colors, logo size, buttons) to defaults? Your menu setup stays as-is.')) {
      setForm((prev) => ({ ...DEFAULT_HEADER, menuOverrides: prev.menuOverrides }));
    }
  }

  function pageTitle(slug: string) {
    return pages?.find((pg) => (pg.isHomePage ? 'home' : pg.slug) === slug)?.title ?? slug;
  }

  function updateRow(slug: string, patch: Partial<MenuOverride>) {
    setForm((prev) => ({ ...prev, menuOverrides: prev.menuOverrides.map((o) => (o.pageSlug === slug ? { ...o, ...patch } : o)) }));
  }

  function moveRow(slug: string, dir: -1 | 1) {
    setForm((prev) => {
      const row = prev.menuOverrides.find((o) => o.pageSlug === slug);
      if (!row) return prev;
      const siblings = prev.menuOverrides.filter((o) => o.parentSlug === row.parentSlug).sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((o) => o.pageSlug === slug);
      const reordered = moveArrayItem(siblings, idx, dir).map((o, i) => ({ ...o, order: i }));
      const bySlug = new Map(reordered.map((o) => [o.pageSlug, o]));
      return { ...prev, menuOverrides: prev.menuOverrides.map((o) => bySlug.get(o.pageSlug) ?? o) };
    });
  }

  function nestUnder(slug: string, parentSlug: string | null) {
    setForm((prev) => {
      const newOrder = prev.menuOverrides.filter((o) => o.parentSlug === parentSlug).length;
      return { ...prev, menuOverrides: prev.menuOverrides.map((o) => (o.pageSlug === slug ? { ...o, parentSlug, order: newOrder } : o)) };
    });
  }

  const topLevelSlugs = form.menuOverrides.filter((o) => !o.parentSlug).sort((a, b) => a.order - b.order).map((o) => o.pageSlug);
  const navPages: NavPage[] = (pages ?? []).map((p) => ({ slug: p.slug, title: p.title, isHomePage: p.isHomePage }));

  if (hfLoading || pagesLoading || !loaded) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="flex-shrink-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Back to Pages">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <p className="text-sm font-semibold text-gray-900">Header Builder</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saveError && <span className="text-xs text-red-600 max-w-[220px] truncate">{saveError}</span>}
          {saved && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Saved
            </span>
          )}
          <button onClick={handleResetAppearance} className="text-xs text-gray-400 hover:text-red-500 px-2 transition-colors">Reset appearance</button>
          <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Save</Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <Section title="Appearance" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Logo Height <span className="text-gray-400 font-normal">{form.logoHeightPx}px</span>
              </label>
              <input type="range" min={20} max={80} step={2} value={form.logoHeightPx}
                onChange={(e) => set('logoHeightPx', Number(e.target.value))} className="w-full accent-primary-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Background Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.backgroundColor} onChange={(e) => set('backgroundColor', e.target.value)}
                  className="h-9 w-12 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0" />
                <input className={`${inputCls} font-mono flex-1`} value={form.backgroundColor}
                  onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) set('backgroundColor', e.target.value); }} maxLength={7} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Menu Text Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.menuTextColor} onChange={(e) => set('menuTextColor', e.target.value)}
                  className="h-9 w-12 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0" />
                <input className={`${inputCls} font-mono flex-1`} value={form.menuTextColor}
                  onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) set('menuTextColor', e.target.value); }} maxLength={7} />
              </div>
            </div>

            <Section title="Buttons" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sign In Text</label>
              <input className={inputCls} value={form.signInText} onChange={(e) => set('signInText', e.target.value)} maxLength={30} placeholder="Sign in" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sign Up Text</label>
              <input className={inputCls} value={form.signUpText} onChange={(e) => set('signUpText', e.target.value)} maxLength={30} placeholder="Sign up free" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Button Style</label>
              <div className="grid grid-cols-2 gap-2">
                {(['solid', 'outline'] as const).map((s) => (
                  <button key={s} onClick={() => set('buttonStyle', s)}
                    className={`py-2 text-xs rounded-lg border capitalize font-medium transition-colors ${
                      form.buttonStyle === s ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <Section title="Menu" />
            <p className="text-xs text-gray-400 -mt-2">Rename, reorder, hide, or nest pages into a dropdown submenu.</p>
            {topLevelSlugs.map((slug, i) => {
              const row = form.menuOverrides.find((o) => o.pageSlug === slug)!;
              const children = form.menuOverrides.filter((o) => o.parentSlug === slug).sort((a, b) => a.order - b.order);
              const canNest = children.length === 0; // avoid 2-level nesting: a parent can't itself become a child
              return (
                <div key={slug} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between -mt-0.5 -mr-0.5">
                    <span className="text-xs font-medium text-gray-400">{pageTitle(slug)}</span>
                    <ReorderControls index={i} length={topLevelSlugs.length} onMove={(dir) => moveRow(slug, dir)} />
                  </div>
                  <input className={inputCls} value={row.label ?? ''} onChange={(e) => updateRow(slug, { label: e.target.value || null })}
                    placeholder={`${pageTitle(slug)} (default label)`} />
                  {canNest ? (
                    <select className={inputCls} value={row.parentSlug ?? ''} onChange={(e) => nestUnder(slug, e.target.value || null)}>
                      <option value="">— Top level —</option>
                      {topLevelSlugs.filter((s) => s !== slug).map((s) => (
                        <option key={s} value={s}>Nest under: {pageTitle(s)}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[11px] text-gray-400">Has nested pages — remove them below to nest this page elsewhere.</p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={row.hidden} onChange={(e) => updateRow(slug, { hidden: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    <span className="text-xs text-gray-600">Hide from menu</span>
                  </label>

                  {children.length > 0 && (
                    <div className="pl-3 border-l-2 border-gray-100 space-y-3 pt-1">
                      {children.map((child, ci) => (
                        <div key={child.pageSlug} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-gray-400">↳ {pageTitle(child.pageSlug)}</span>
                            <ReorderControls index={ci} length={children.length} onMove={(dir) => moveRow(child.pageSlug, dir)} />
                          </div>
                          <input className={`${inputCls} text-xs`} value={child.label ?? ''} onChange={(e) => updateRow(child.pageSlug, { label: e.target.value || null })}
                            placeholder={pageTitle(child.pageSlug)} />
                          <div className="flex items-center justify-between gap-2">
                            <button onClick={() => nestUnder(child.pageSlug, null)} className="text-[11px] text-primary-600 hover:text-primary-700 font-medium">
                              ↑ Move to top level
                            </button>
                            <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                              <input type="checkbox" checked={child.hidden} onChange={(e) => updateRow(child.pageSlug, { hidden: e.target.checked })}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                              <span className="text-[11px] text-gray-600">Hide</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="pb-6" />
          </div>
        </div>

        <div className="flex-1 bg-gray-100 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-800">Live Preview</p>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm overflow-hidden">
              <LandingNavBar
                logoUrl={tenantInfo?.settings?.logo ?? null}
                displayName={tenantInfo?.name ?? 'Your School'}
                linksDisabled
                pages={navPages}
                headerConfig={form}
              />
              <div className="h-40 bg-gradient-to-b from-gray-50 to-white flex items-center justify-center text-xs text-gray-300">
                Your page content
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Footer Builder
// ═══════════════════════════════════════════════════════════════════════════
const DEFAULT_FOOTER: FooterConfig = {
  backgroundColor: '#ffffff', textColor: '#9ca3af', tagline: null, copyrightText: null, socialLinks: [],
};

const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: 'Facebook', twitter: 'Twitter / X', instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok',
};

function FooterEditorScreen({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FooterConfig>(DEFAULT_FOOTER);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const { data: hfData, isLoading: hfLoading } = useQuery({
    queryKey: ['header-footer'],
    queryFn: async () => {
      const { data } = await api.get('/tenant/header-footer');
      return data.data as { header: HeaderConfig; footer: FooterConfig };
    },
  });

  const { data: tenantInfo } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: async () => {
      const { data } = await api.get('/tenant');
      return data.data.tenant as { name: string };
    },
  });

  useEffect(() => {
    if (hfData && !loaded) {
      setForm({ ...DEFAULT_FOOTER, ...hfData.footer });
      setLoaded(true);
    }
  }, [hfData, loaded]);

  const set = <K extends keyof FooterConfig>(k: K, v: FooterConfig[K]) => setForm((prev) => ({ ...prev, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/tenant/header-footer', { footer: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['header-footer'] });
      setSaved(true); setSaveError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: AxiosError<{ message: string }>) => setSaveError(e.response?.data?.message ?? 'Save failed'),
  });

  function handleReset() {
    if (confirm('Reset the footer to defaults? This cannot be undone.')) {
      setForm(DEFAULT_FOOTER);
    }
  }

  const socialLinks = form.socialLinks;
  const usedPlatforms = new Set(socialLinks.map((s) => s.platform));

  function toggleSocial(platform: SocialPlatform) {
    if (usedPlatforms.has(platform)) {
      set('socialLinks', socialLinks.filter((s) => s.platform !== platform));
    } else if (socialLinks.length < 6) {
      set('socialLinks', [...socialLinks, { platform, url: '' }]);
    }
  }
  function updateSocialUrl(platform: SocialPlatform, url: string) {
    set('socialLinks', socialLinks.map((s) => (s.platform === platform ? { ...s, url } : s)));
  }

  if (hfLoading || !loaded) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="flex-shrink-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Back to Pages">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <p className="text-sm font-semibold text-gray-900">Footer Builder</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saveError && <span className="text-xs text-red-600 max-w-[220px] truncate">{saveError}</span>}
          {saved && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Saved
            </span>
          )}
          <button onClick={handleReset} className="text-xs text-gray-400 hover:text-red-500 px-2 transition-colors">Reset</button>
          <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Save</Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <Section title="Appearance" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Background Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.backgroundColor} onChange={(e) => set('backgroundColor', e.target.value)}
                  className="h-9 w-12 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0" />
                <input className={`${inputCls} font-mono flex-1`} value={form.backgroundColor}
                  onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) set('backgroundColor', e.target.value); }} maxLength={7} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Text Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.textColor} onChange={(e) => set('textColor', e.target.value)}
                  className="h-9 w-12 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0" />
                <input className={`${inputCls} font-mono flex-1`} value={form.textColor}
                  onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) set('textColor', e.target.value); }} maxLength={7} />
              </div>
            </div>

            <Section title="Text" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tagline (optional)</label>
              <input className={inputCls} value={form.tagline ?? ''} onChange={(e) => set('tagline', e.target.value || null)}
                maxLength={200} placeholder="A short line under your name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Copyright Text (optional)</label>
              <input className={inputCls} value={form.copyrightText ?? ''} onChange={(e) => set('copyrightText', e.target.value || null)}
                maxLength={200} placeholder="© {{year}} {{tenantName}}. All rights reserved." />
              <p className="text-[11px] text-gray-400 mt-1">Use <code>{'{{year}}'}</code> and <code>{'{{tenantName}}'}</code> — they're filled in automatically.</p>
            </div>

            <Section title="Social Links" />
            <p className="text-xs text-gray-400 -mt-2">Click an icon to connect it, then paste your profile link.</p>
            <div className="grid grid-cols-6 gap-2">
              {(Object.keys(SOCIAL_PLATFORM_LABELS) as SocialPlatform[]).map((p) => {
                const connected = usedPlatforms.has(p);
                return (
                  <button key={p} type="button" onClick={() => toggleSocial(p)}
                    title={connected ? `Remove ${SOCIAL_PLATFORM_LABELS[p]}` : `Add ${SOCIAL_PLATFORM_LABELS[p]}`}
                    className={`aspect-square rounded-xl flex items-center justify-center border-2 transition-colors ${
                      connected ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-200 text-gray-400 hover:border-primary-300 hover:text-primary-500'
                    }`}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d={SOCIAL_ICON_PATHS[p]} /></svg>
                  </button>
                );
              })}
            </div>

            {socialLinks.length > 0 ? (
              <div className="space-y-2">
                {socialLinks.map((link) => (
                  <div key={link.platform} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                    <div className="w-7 h-7 rounded-lg bg-primary-600 text-white flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d={SOCIAL_ICON_PATHS[link.platform]} /></svg>
                    </div>
                    <input className={`${inputCls} flex-1 bg-white`} value={link.url}
                      onChange={(e) => updateSocialUrl(link.platform, e.target.value)}
                      placeholder={`https://${link.platform}.com/yourpage`}
                      autoFocus={link.url === ''} />
                    <button onClick={() => toggleSocial(link.platform)} className="p-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0" title="Remove">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No social links connected yet — click an icon above to add one.</p>
            )}
            <div className="pb-6" />
          </div>
        </div>

        <div className="flex-1 bg-gray-100 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-800">Live Preview</p>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="h-40 bg-gradient-to-b from-gray-50 to-white flex items-center justify-center text-xs text-gray-300">
                Your page content
              </div>
              <LandingFooter displayName={tenantInfo?.name ?? 'Your School'} linksDisabled footerConfig={form} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Top-level: switches between the Pages list and the per-page editor
// ═══════════════════════════════════════════════════════════════════════════
export default function WebsiteBuilderPage() {
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingChrome, setEditingChrome] = useState<'header' | 'footer' | null>(null);

  if (editingPageId) {
    return <PageEditorScreen pageId={editingPageId} onBack={() => setEditingPageId(null)} />;
  }
  if (editingChrome === 'header') {
    return <HeaderEditorScreen onBack={() => setEditingChrome(null)} />;
  }
  if (editingChrome === 'footer') {
    return <FooterEditorScreen onBack={() => setEditingChrome(null)} />;
  }
  return <PagesListScreen onEditPage={setEditingPageId} onEditChrome={setEditingChrome} />;
}
