'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner, ReorderControls } from '@/components/ui';
import { moveArrayItem } from '@/lib/utils';
import { AxiosError } from 'axios';
import {
  PageSectionsRenderer,
  type PageSection,
  type WebsiteContent,
  type PublicCourse,
  type Testimonial,
} from '@/components/website/LandingPageSections';

type SectionType = 'hero' | 'about' | 'coursesSection' | 'testimonials' | 'cta' | 'contact';
type InstituteType = 'school' | 'academy' | 'college' | 'university';

const SECTION_TYPE_ORDER: SectionType[] = ['hero', 'about', 'coursesSection', 'testimonials', 'cta', 'contact'];
const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero', about: 'About', coursesSection: 'Courses Section',
  testimonials: 'Testimonials', cta: 'Call To Action', contact: 'Contact',
};

const DEFAULT_SECTION_DATA: Record<SectionType, unknown> = {
  hero: { headline: '', subheadline: '', ctaText: '', ctaLink: '', backgroundImageUrl: null },
  about: { heading: '', body: '', imageUrl: null, ctaText: '', ctaLink: '' },
  coursesSection: { heading: '', subheading: '', displayMode: 'all', categoryId: null, courseIds: [], layout: 'grid' },
  testimonials: [] as Testimonial[],
  cta: { heading: '', subtext: '', buttonText: '', buttonLink: '' },
  contact: { email: '', phone: '', address: '' },
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

function getSectionData<T>(sections: PageSection[], type: SectionType): T | undefined {
  return sections.find((s) => s.type === type)?.data as T | undefined;
}

const Section = ({ title }: { title: string }) => (
  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-2">{title}</p>
);

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white';
const textareaCls = `${inputCls} resize-none`;

// ═══════════════════════════════════════════════════════════════════════════
// Pages List screen
// ═══════════════════════════════════════════════════════════════════════════
function PagesListScreen({ onEditPage }: { onEditPage: (id: string) => void }) {
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

  useEffect(() => {
    if (pageData && !loaded) {
      setSections(pageData.sections ?? []);
      setTitle(pageData.title);
      setIsPublished(pageData.isPublished);
      setInstituteType(pageData.instituteType);
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
    mutationFn: ({ file }: { field: 'hero' | 'about'; file: File }) => {
      const fd = new FormData();
      fd.append('image', file);
      return api.post('/tenant/pages/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res, vars) => {
      if (vars.field === 'hero') setSectionField<WebsiteContent['hero']>('hero', 'backgroundImageUrl', res.data.data.url);
      if (vars.field === 'about') setSectionField<WebsiteContent['about']>('about', 'imageUrl', res.data.data.url);
    },
    onError: (e: AxiosError<{ message: string }>) => setSaveError(e.response?.data?.message ?? 'Upload failed'),
  });

  function setSectionField<T extends Record<string, unknown>>(type: SectionType, field: keyof T, value: unknown) {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.type === type);
      if (idx === -1) return prev;
      const current = prev[idx].data as T;
      const next = [...prev];
      next[idx] = { ...next[idx], data: { ...current, [field]: value } };
      return next;
    });
  }

  function setSectionWhole(type: SectionType, data: unknown) {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.type === type);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], data };
      return next;
    });
  }

  function hasSection(type: SectionType) { return sections.some((s) => s.type === type); }

  function addSection(type: SectionType) {
    setSections((prev) => [...prev, { type, order: prev.length, data: DEFAULT_SECTION_DATA[type] }]);
  }

  function removeSection(type: SectionType) {
    setSections((prev) => prev.filter((s) => s.type !== type).map((s, i) => ({ ...s, order: i })));
  }

  function moveSection(type: SectionType, dir: -1 | 1) {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.type === type);
      if (idx === -1) return prev;
      return moveArrayItem(prev, idx, dir).map((s, i) => ({ ...s, order: i }));
    });
  }

  function pickInstituteType(type: InstituteType) {
    setInstituteType(type);
    setSections(TEMPLATES[type]);
  }

  const hero = getSectionData<WebsiteContent['hero']>(sections, 'hero');
  const about = getSectionData<WebsiteContent['about']>(sections, 'about');
  const coursesSection = getSectionData<WebsiteContent['coursesSection']>(sections, 'coursesSection');
  const testimonials = getSectionData<Testimonial[]>(sections, 'testimonials') ?? [];
  const cta = getSectionData<WebsiteContent['cta']>(sections, 'cta');
  const contact = getSectionData<WebsiteContent['contact']>(sections, 'contact');

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
                      className="text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors">
                      + {SECTION_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {[...sections].sort((a, b) => a.order - b.order).map((section, idx) => (
              <div key={section.type} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{SECTION_LABELS[section.type as SectionType]}</span>
                  <div className="flex items-center gap-1">
                    <ReorderControls index={idx} length={sections.length} onMove={(dir) => moveSection(section.type as SectionType, dir)} />
                    <button onClick={() => removeSection(section.type as SectionType)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Remove section">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {section.type === 'hero' && hero && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Headline</label>
                        <input className={inputCls} value={hero.headline} onChange={(e) => setSectionField<WebsiteContent['hero']>('hero', 'headline', e.target.value)} placeholder="Your headline" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subheadline</label>
                        <textarea className={textareaCls} rows={2} value={hero.subheadline} onChange={(e) => setSectionField<WebsiteContent['hero']>('hero', 'subheadline', e.target.value)} placeholder="A short supporting sentence" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Text</label>
                          <input className={inputCls} value={hero.ctaText} onChange={(e) => setSectionField<WebsiteContent['hero']>('hero', 'ctaText', e.target.value)} placeholder="Get Started" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Link</label>
                          <input className={inputCls} value={hero.ctaLink} onChange={(e) => setSectionField<WebsiteContent['hero']>('hero', 'ctaLink', e.target.value)} placeholder="/register" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Background Image</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {hero.backgroundImageUrl && <img src={hero.backgroundImageUrl} alt="hero bg" className="h-8 w-12 rounded border border-gray-200 object-cover" />}
                          <button onClick={() => heroImgRef.current?.click()} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                            {hero.backgroundImageUrl ? 'Change' : 'Upload Image'}
                          </button>
                          {hero.backgroundImageUrl && <button onClick={() => setSectionField<WebsiteContent['hero']>('hero', 'backgroundImageUrl', '')} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                          <input ref={heroImgRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate({ field: 'hero', file: f }); e.target.value = ''; }} />
                        </div>
                      </div>
                    </>
                  )}

                  {section.type === 'about' && about && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={about.heading} onChange={(e) => setSectionField<WebsiteContent['about']>('about', 'heading', e.target.value)} placeholder="About Us" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
                        <textarea className={textareaCls} rows={4} value={about.body} onChange={(e) => setSectionField<WebsiteContent['about']>('about', 'body', e.target.value)} placeholder="Tell visitors about your institute" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Image</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {about.imageUrl && <img src={about.imageUrl} alt="about" className="h-8 w-12 rounded border border-gray-200 object-cover" />}
                          <button onClick={() => aboutImgRef.current?.click()} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                            {about.imageUrl ? 'Change' : 'Upload Image'}
                          </button>
                          {about.imageUrl && <button onClick={() => setSectionField<WebsiteContent['about']>('about', 'imageUrl', '')} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                          <input ref={aboutImgRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate({ field: 'about', file: f }); e.target.value = ''; }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Text (optional)</label>
                          <input className={inputCls} value={about.ctaText} onChange={(e) => setSectionField<WebsiteContent['about']>('about', 'ctaText', e.target.value)} placeholder="Learn More" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Link</label>
                          <input className={inputCls} value={about.ctaLink} onChange={(e) => setSectionField<WebsiteContent['about']>('about', 'ctaLink', e.target.value)} placeholder="/register" />
                        </div>
                      </div>
                    </>
                  )}

                  {section.type === 'coursesSection' && coursesSection && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={coursesSection.heading} onChange={(e) => setSectionField<WebsiteContent['coursesSection']>('coursesSection', 'heading', e.target.value)} placeholder="Our Courses" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subheading</label>
                        <input className={inputCls} value={coursesSection.subheading} onChange={(e) => setSectionField<WebsiteContent['coursesSection']>('coursesSection', 'subheading', e.target.value)} placeholder="Optional subheading" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Which Courses to Show</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['all', 'category', 'selected'] as const).map((mode) => (
                            <button key={mode} onClick={() => setSectionField<WebsiteContent['coursesSection']>('coursesSection', 'displayMode', mode)}
                              className={`py-2 text-xs rounded-lg border font-medium transition-colors ${
                                coursesSection.displayMode === mode ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}>
                              {mode === 'all' ? 'All Courses' : mode === 'category' ? 'By Category' : 'Selected'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {coursesSection.displayMode === 'category' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                          <select className={inputCls} value={coursesSection.categoryId ?? ''}
                            onChange={(e) => setSectionField<WebsiteContent['coursesSection']>('coursesSection', 'categoryId', e.target.value || null)}>
                            <option value="">Select a category…</option>
                            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                          </select>
                          {categories.length === 0 && <p className="text-xs text-gray-400 mt-1">No categories yet.</p>}
                        </div>
                      )}
                      {coursesSection.displayMode === 'selected' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Choose Courses <span className="text-gray-400 font-normal">(check to add, arrows to reorder)</span>
                          </label>
                          {allCourses.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No published courses yet</p>
                          ) : (
                            <div className="border border-gray-200 rounded-xl max-h-60 overflow-y-auto divide-y divide-gray-50">
                              {allCourses.map((c) => {
                                const ids = coursesSection.courseIds;
                                const idx2 = ids.indexOf(c._id);
                                const selected = idx2 !== -1;
                                return (
                                  <div key={c._id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                                    <input type="checkbox" checked={selected}
                                      onChange={() => setSectionField<WebsiteContent['coursesSection']>('coursesSection', 'courseIds', selected ? ids.filter((x) => x !== c._id) : [...ids, c._id])}
                                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 truncate flex-1">{selected ? `${idx2 + 1}. ` : ''}{c.title}</span>
                                    {selected && (
                                      <ReorderControls index={idx2} length={ids.length}
                                        onMove={(dir) => setSectionField<WebsiteContent['coursesSection']>('coursesSection', 'courseIds', moveArrayItem(ids, idx2, dir))} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <p className="text-xs text-gray-400 mt-1">{coursesSection.courseIds.length} selected</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Layout</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['grid', 'slider'] as const).map((l) => (
                            <button key={l} onClick={() => setSectionField<WebsiteContent['coursesSection']>('coursesSection', 'layout', l)}
                              className={`py-2 text-xs rounded-lg border capitalize font-medium transition-colors ${
                                coursesSection.layout === l ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}>
                              {l}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Slider works well if you have many courses.</p>
                      </div>
                    </>
                  )}

                  {section.type === 'testimonials' && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">{testimonials.length} / 6</span>
                        {testimonials.length < 6 && (
                          <button onClick={() => setSectionWhole('testimonials', [...testimonials, { name: '', role: '', quote: '', avatarUrl: null }])}
                            className="text-xs text-primary-600 font-medium hover:text-primary-700">+ Add</button>
                        )}
                      </div>
                      {testimonials.map((t, i) => (
                        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between -mt-0.5 -mr-0.5">
                            <span className="text-xs font-medium text-gray-400">Testimonial {i + 1}</span>
                            <div className="flex items-center gap-1">
                              <ReorderControls index={i} length={testimonials.length} onMove={(dir) => setSectionWhole('testimonials', moveArrayItem(testimonials, i, dir))} />
                              <button onClick={() => setSectionWhole('testimonials', testimonials.filter((_, j) => j !== i))} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Remove">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <input className={inputCls} value={t.name} onChange={(e) => setSectionWhole('testimonials', testimonials.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" />
                          <input className={inputCls} value={t.role} onChange={(e) => setSectionWhole('testimonials', testimonials.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role (e.g. Student)" />
                          <textarea className={textareaCls} rows={2} value={t.quote} onChange={(e) => setSectionWhole('testimonials', testimonials.map((x, j) => j === i ? { ...x, quote: e.target.value } : x))} placeholder="Quote" />
                        </div>
                      ))}
                      {testimonials.length === 0 && <p className="text-xs text-gray-400">No testimonials yet — add up to 6.</p>}
                    </>
                  )}

                  {section.type === 'cta' && cta && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Heading</label>
                        <input className={inputCls} value={cta.heading} onChange={(e) => setSectionField<WebsiteContent['cta']>('cta', 'heading', e.target.value)} placeholder="Ready to get started?" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subtext</label>
                        <input className={inputCls} value={cta.subtext} onChange={(e) => setSectionField<WebsiteContent['cta']>('cta', 'subtext', e.target.value)} placeholder="Optional supporting text" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Text</label>
                          <input className={inputCls} value={cta.buttonText} onChange={(e) => setSectionField<WebsiteContent['cta']>('cta', 'buttonText', e.target.value)} placeholder="Get Started" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Button Link</label>
                          <input className={inputCls} value={cta.buttonLink} onChange={(e) => setSectionField<WebsiteContent['cta']>('cta', 'buttonLink', e.target.value)} placeholder="/register" />
                        </div>
                      </div>
                    </>
                  )}

                  {section.type === 'contact' && contact && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                        <input className={inputCls} value={contact.email} onChange={(e) => setSectionField<WebsiteContent['contact']>('contact', 'email', e.target.value)} placeholder="info@example.com" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                        <input className={inputCls} value={contact.phone} onChange={(e) => setSectionField<WebsiteContent['contact']>('contact', 'phone', e.target.value)} placeholder="+1 555 000 0000" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                        <input className={inputCls} value={contact.address} onChange={(e) => setSectionField<WebsiteContent['contact']>('contact', 'address', e.target.value)} placeholder="123 Main St, City" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {sections.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No sections yet — add one above to start building this page.</p>
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
            />
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

  if (editingPageId) {
    return <PageEditorScreen pageId={editingPageId} onBack={() => setEditingPageId(null)} />;
  }
  return <PagesListScreen onEditPage={setEditingPageId} />;
}
