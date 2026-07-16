'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { AxiosError } from 'axios';
import { cn } from '@/lib/utils';

interface CertTemplate {
  isCourseSpecific?: boolean;
  organizationName: string;
  logoUrl: string | null;
  heading: string;
  subheading: string;
  bodyText: string;
  footerNote: string;
  signatoryName: string;
  signatoryTitle: string;
  signatureImageUrl: string | null;
  secondSignatoryName: string;
  secondSignatoryTitle: string;
  secondSignatureImageUrl: string | null;
  accentColor: string;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  borderStyle: 'classic' | 'modern' | 'minimal' | 'elegant';
  fontFamily: 'serif' | 'sans' | 'elegant';
  nameFontSize: number;
  titleFontSize: number;
  showBadge: boolean;
  expiryDays: number | null;
}

const DEFAULTS: CertTemplate = {
  organizationName: '',
  logoUrl: null,
  heading: 'Certificate of Completion',
  subheading: 'This certifies that',
  bodyText: 'has successfully completed the course',
  footerNote: '',
  signatoryName: '',
  signatoryTitle: 'Course Instructor',
  signatureImageUrl: null,
  secondSignatoryName: '',
  secondSignatoryTitle: '',
  secondSignatureImageUrl: null,
  accentColor: '#0284c7',
  backgroundColor: '#ffffff',
  backgroundImageUrl: null,
  borderStyle: 'classic',
  fontFamily: 'serif',
  nameFontSize: 36,
  titleFontSize: 22,
  showBadge: true,
  expiryDays: null,
};

const FONT_MAP: Record<string, string> = {
  serif:   'Georgia, "Times New Roman", serif',
  sans:    'Inter, system-ui, sans-serif',
  elegant: '"Palatino Linotype", "Book Antiqua", serif',
};

// ─── Live Certificate Preview ─────────────────────────────────────────────────
function CertPreview({ t }: { t: CertTemplate }) {
  const accent = t.accentColor || '#0284c7';
  const bg     = t.backgroundColor || '#ffffff';
  const font   = FONT_MAP[t.fontFamily] || FONT_MAP.serif;
  const hasSecond = !!(t.secondSignatoryName || t.secondSignatoryTitle || t.secondSignatureImageUrl);

  const wrapperStyle: React.CSSProperties = {
    fontFamily: font,
    backgroundColor: bg,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  };

  if (t.backgroundImageUrl) {
    wrapperStyle.backgroundImage = `url(${t.backgroundImageUrl})`;
    wrapperStyle.backgroundSize = 'cover';
    wrapperStyle.backgroundPosition = 'center';
  }

  if (t.borderStyle === 'classic')  { wrapperStyle.border = `3px solid ${accent}`; }
  if (t.borderStyle === 'modern')   { wrapperStyle.border = `2px solid ${accent}`; wrapperStyle.borderRadius = '14px'; }
  if (t.borderStyle === 'minimal')  { wrapperStyle.borderTop = `6px solid ${accent}`; }
  if (t.borderStyle === 'elegant')  { wrapperStyle.border = `1px solid #d4af37`; wrapperStyle.outline = `4px solid ${accent}`; wrapperStyle.outlineOffset = '-10px'; }

  return (
    <div style={wrapperStyle}>
      {t.borderStyle !== 'minimal' && (
        <div style={{ height: 7, background: `linear-gradient(90deg, ${accent}, ${accent}88, ${accent})` }} />
      )}

      <div style={{ padding: '40px 60px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>

        {(t.logoUrl || t.organizationName) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            {t.logoUrl && (
              <img src={t.logoUrl} alt="Logo" style={{ height: 44, maxWidth: 160, objectFit: 'contain' }} />
            )}
            {t.organizationName && (
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', letterSpacing: '0.05em' }}>
                {t.organizationName}
              </span>
            )}
          </div>
        )}

        {t.showBadge && !t.logoUrl && (
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${accent}18`, border: `3px solid ${accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="30" height="30" fill="none" stroke={accent} strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
        )}

        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 }}>
          {t.heading}
        </p>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>{t.subheading}</p>

        <p style={{ fontSize: t.nameFontSize, fontWeight: 700, color: '#111827', marginBottom: 8, fontFamily: font }}>
          Student Name
        </p>

        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>{t.bodyText}</p>

        <p style={{ fontSize: t.titleFontSize, fontWeight: 600, color: accent, marginBottom: 24, maxWidth: 380, lineHeight: 1.3 }}>
          Course Title
        </p>

        <div style={{ width: 64, height: 1, background: '#e5e7eb', marginBottom: 24 }} />

        {/* Footer signatories */}
        <div style={{ display: 'flex', gap: hasSecond ? 40 : 56, justifyContent: 'center', width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>January 1, 2026</p>
            <div style={{ width: 110, height: 1, background: '#d1d5db', margin: '5px auto 3px' }} />
            <p style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Date Completed</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            {t.signatureImageUrl ? (
              <img src={t.signatureImageUrl} alt="sig" style={{ height: 28, objectFit: 'contain', display: 'block', margin: '0 auto 2px' }} />
            ) : (
              <p style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{t.signatoryName || 'Instructor Name'}</p>
            )}
            <div style={{ width: 110, height: 1, background: '#d1d5db', margin: '5px auto 3px' }} />
            <p style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t.signatoryTitle || 'Instructor'}</p>
          </div>
          {hasSecond && (
            <div style={{ textAlign: 'center' }}>
              {t.secondSignatureImageUrl ? (
                <img src={t.secondSignatureImageUrl} alt="sig2" style={{ height: 28, objectFit: 'contain', display: 'block', margin: '0 auto 2px' }} />
              ) : (
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{t.secondSignatoryName || 'Second Signatory'}</p>
              )}
              <div style={{ width: 110, height: 1, background: '#d1d5db', margin: '5px auto 3px' }} />
              <p style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t.secondSignatoryTitle || 'Title'}</p>
            </div>
          )}
        </div>

        {t.footerNote && (
          <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 16, fontStyle: 'italic' }}>{t.footerNote}</p>
        )}
      </div>

      {t.borderStyle !== 'minimal' && (
        <div style={{ height: 5, background: `linear-gradient(90deg, ${accent}, ${accent}88, ${accent})` }} />
      )}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
const Section = ({ title }: { title: string }) => (
  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-2">{title}</p>
);

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white';

// ─── Builder Page ─────────────────────────────────────────────────────────────
export default function CertificateBuilderPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const qs = courseId ? `?courseId=${courseId}` : '';

  const [form, setForm]           = useState<CertTemplate>(DEFAULTS);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState('');
  const logoRef                   = useRef<HTMLInputElement>(null);
  const bgRef                     = useRef<HTMLInputElement>(null);
  const signatureRef              = useRef<HTMLInputElement>(null);
  const secondSignatureRef        = useRef<HTMLInputElement>(null);

  const { data: courseData } = useQuery({
    queryKey: ['course-title', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}`);
      return data.data.course as { title: string };
    },
    enabled: !!courseId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['cert-template', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/certificate-templates${qs}`);
      return data.data.template as Partial<CertTemplate>;
    },
    staleTime: 30_000,
  });

  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (data && !loaded) {
      setForm({ ...DEFAULTS, ...data });
      setLoaded(true);
    }
  }, [data, loaded]);

  const set = <K extends keyof CertTemplate>(k: K, v: CertTemplate[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => api.post(`/certificate-templates${qs}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cert-template'] });
      setSaved(true); setSaveError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: AxiosError<{ message: string }>) =>
      setSaveError(e.response?.data?.message ?? 'Save failed'),
  });

  const resetMutation = useMutation({
    mutationFn: () => api.delete(`/certificate-templates/reset${qs}`),
    onSuccess: () => { setForm(DEFAULTS); setLoaded(false); qc.invalidateQueries({ queryKey: ['cert-template'] }); },
  });

  function handleReset() {
    const msg = courseId
      ? 'Remove this course\'s custom certificate template and go back to using the organization default?'
      : 'Reset the organization default certificate template? This cannot be undone.';
    if (confirm(msg)) {
      resetMutation.mutate();
    }
  }

  const uploadMutation = useMutation({
    mutationFn: ({ field, file }: { field: 'logo' | 'background' | 'signature' | 'second-signature'; file: File }) => {
      const fd = new FormData();
      const fieldKey = field === 'second-signature' ? 'secondSignature' : field;
      fd.append(fieldKey, file);
      return api.post(`/certificate-templates/${field}${qs}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res, vars) => {
      if (vars.field === 'logo')             set('logoUrl', res.data.data.logoUrl);
      if (vars.field === 'background')       set('backgroundImageUrl', res.data.data.backgroundImageUrl);
      if (vars.field === 'signature')        set('signatureImageUrl', res.data.data.signatureImageUrl);
      if (vars.field === 'second-signature') set('secondSignatureImageUrl', res.data.data.secondSignatureImageUrl);
    },
    onError: (e: AxiosError<{ message: string }>) => setSaveError(e.response?.data?.message ?? 'Upload failed'),
  });

  if (isLoading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* ── Top toolbar ── */}
      <div className="flex-shrink-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push(courseId ? `/courses/${courseId}` : '/settings')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
            title={courseId ? 'Back to Course' : 'Back to Settings'}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
          <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
                {courseId ? (courseData?.title ?? 'Course') : 'Certificate Builder'}
              </p>
              {courseId && (
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0',
                  form.isCourseSpecific ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'
                )}>
                  {form.isCourseSpecific ? 'Custom' : 'Using organization default'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 leading-tight truncate">
              {courseId
                ? 'Editing the certificate for this course — saving creates a course-specific override'
                : 'Design the organization-wide default certificate for all courses'}
            </p>
          </div>
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
          {(!courseId || form.isCourseSpecific) && (
            <button onClick={handleReset} disabled={resetMutation.isPending}
              className="text-xs text-gray-400 hover:text-red-500 px-2 transition-colors">
              {courseId ? 'Use organization default' : 'Reset'}
            </button>
          )}
          <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Save Template
          </Button>
        </div>
      </div>

      {/* ── Body: form + preview ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

      {/* ── Left Panel ── */}
      <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          <Section title="Organization" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Organization Name</label>
            <input className={inputCls} value={form.organizationName}
              onChange={e => set('organizationName', e.target.value)}
              placeholder="Your School / Company" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Logo</label>
            <div className="flex items-center gap-2 flex-wrap">
              {form.logoUrl && (
                <img src={form.logoUrl} alt="logo" className="h-8 rounded border border-gray-200 object-contain" />
              )}
              <button onClick={() => logoRef.current?.click()}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                {form.logoUrl ? 'Change' : 'Upload Logo'}
              </button>
              {form.logoUrl && (
                <button onClick={() => set('logoUrl', null)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
              )}
              <input ref={logoRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate({ field: 'logo', file: f }); e.target.value = ''; }} />
            </div>
          </div>

          <Section title="Text Content" />
          {([
            ['heading',    'Heading'],
            ['subheading', 'Subheading'],
            ['bodyText',   'Body Text'],
            ['footerNote', 'Footer Note (optional)'],
          ] as [keyof CertTemplate, string][]).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input className={inputCls} value={String(form[key] ?? '')}
                onChange={e => set(key, e.target.value as CertTemplate[typeof key])}
                placeholder={label} />
            </div>
          ))}

          <Section title="Primary Signatory" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input className={inputCls} value={form.signatoryName}
              onChange={e => set('signatoryName', e.target.value)} placeholder="Dr. Jane Smith" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input className={inputCls} value={form.signatoryTitle}
              onChange={e => set('signatoryTitle', e.target.value)} placeholder="Course Instructor" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Signature Image</label>
            <div className="flex items-center gap-2 flex-wrap">
              {form.signatureImageUrl && (
                <img src={form.signatureImageUrl} alt="sig" className="h-8 border border-gray-200 rounded px-1 object-contain" />
              )}
              <button onClick={() => signatureRef.current?.click()}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                {form.signatureImageUrl ? 'Change' : 'Upload Signature'}
              </button>
              {form.signatureImageUrl && (
                <button onClick={() => set('signatureImageUrl', null)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
              )}
              <input ref={signatureRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate({ field: 'signature', file: f }); e.target.value = ''; }} />
            </div>
          </div>

          <Section title="Second Signatory (optional)" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input className={inputCls} value={form.secondSignatoryName}
              onChange={e => set('secondSignatoryName', e.target.value)} placeholder="Prof. John Doe" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input className={inputCls} value={form.secondSignatoryTitle}
              onChange={e => set('secondSignatoryTitle', e.target.value)} placeholder="Program Director" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Signature Image</label>
            <div className="flex items-center gap-2 flex-wrap">
              {form.secondSignatureImageUrl && (
                <img src={form.secondSignatureImageUrl} alt="sig2" className="h-8 border border-gray-200 rounded px-1 object-contain" />
              )}
              <button onClick={() => secondSignatureRef.current?.click()}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                {form.secondSignatureImageUrl ? 'Change' : 'Upload Signature'}
              </button>
              {form.secondSignatureImageUrl && (
                <button onClick={() => set('secondSignatureImageUrl', null)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
              )}
              <input ref={secondSignatureRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate({ field: 'second-signature', file: f }); e.target.value = ''; }} />
            </div>
          </div>
          <p className="text-xs text-gray-400">Leave name and title empty to hide the second signatory column.</p>

          <Section title="Style" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Accent Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.accentColor}
                onChange={e => set('accentColor', e.target.value)}
                className="h-9 w-12 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0" />
              <input className={`${inputCls} font-mono flex-1`} value={form.accentColor}
                onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) set('accentColor', e.target.value); }}
                maxLength={7} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Background Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.backgroundColor}
                onChange={e => set('backgroundColor', e.target.value)}
                className="h-9 w-12 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0" />
              <input className={`${inputCls} font-mono flex-1`} value={form.backgroundColor}
                onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) set('backgroundColor', e.target.value); }}
                maxLength={7} />
            </div>
            <p className="text-xs text-gray-400 mt-1">Use a very light tint for best print results.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Background Image</label>
            <div className="flex items-center gap-2 flex-wrap">
              {form.backgroundImageUrl && (
                <img src={form.backgroundImageUrl} alt="bg" className="h-8 w-12 rounded border border-gray-200 object-cover" />
              )}
              <button onClick={() => bgRef.current?.click()}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                {uploadMutation.isPending ? 'Uploading…' : form.backgroundImageUrl ? 'Change' : 'Upload Image'}
              </button>
              {form.backgroundImageUrl && (
                <button onClick={() => set('backgroundImageUrl', null)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
              )}
              <input ref={bgRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate({ field: 'background', file: f }); e.target.value = ''; }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">Overrides background color. Use a light/subtle texture.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Border Style</label>
            <div className="grid grid-cols-2 gap-2">
              {(['classic', 'modern', 'minimal', 'elegant'] as const).map(s => (
                <button key={s} onClick={() => set('borderStyle', s)}
                  className={`py-2 text-xs rounded-lg border capitalize font-medium transition-colors ${
                    form.borderStyle === s
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Font</label>
            <div className="grid grid-cols-3 gap-2">
              {(['serif', 'sans', 'elegant'] as const).map(f => (
                <button key={f} onClick={() => set('fontFamily', f)}
                  className={`py-2 text-xs rounded-lg border capitalize font-medium transition-colors ${
                    form.fontFamily === f
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Font size sliders */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Student Name Size <span className="text-gray-400 font-normal">{form.nameFontSize}px</span>
            </label>
            <input type="range" min={18} max={72} step={2} value={form.nameFontSize}
              onChange={e => set('nameFontSize', Number(e.target.value))}
              className="w-full accent-primary-600" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Course Title Size <span className="text-gray-400 font-normal">{form.titleFontSize}px</span>
            </label>
            <input type="range" min={12} max={48} step={2} value={form.titleFontSize}
              onChange={e => set('titleFontSize', Number(e.target.value))}
              className="w-full accent-primary-600" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={form.showBadge}
              onChange={e => set('showBadge', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <span className="text-sm text-gray-700">Show badge icon</span>
          </label>
          {form.showBadge && form.logoUrl && (
            <p className="text-xs text-gray-400 -mt-2">Hidden automatically while a logo is set — remove the logo to show it instead.</p>
          )}

          <Section title="Validity / Expiry" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Certificate Expiry <span className="text-gray-400 font-normal">(days after issuance)</span>
            </label>
            <input
              type="number"
              min={1}
              max={3650}
              placeholder="Leave blank for no expiry"
              value={form.expiryDays ?? ''}
              onChange={e => set('expiryDays', e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">
              {form.expiryDays
                ? `Certificates expire ${form.expiryDays} days after issuance (~${Math.round(form.expiryDays / 365 * 10) / 10} yr).`
                : 'No expiry — certificates are valid indefinitely.'}
            </p>
          </div>
          <div className="pb-6" />
        </div>
      </div>

      {/* ── Right Panel: Preview ── */}
      <div className="flex-1 bg-gray-100 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-800">Live Preview</p>
          <p className="text-xs text-gray-400">Updates as you type — click Save to apply for students</p>
        </div>
        <div className="flex-1 overflow-auto flex items-start justify-center p-10">
          <div className="w-full max-w-2xl shadow-2xl rounded-sm">
            <CertPreview t={form} />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
