'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { AxiosError } from 'axios';

interface CourseOption {
  _id: string;
  title: string;
  status: string;
  thumbnail?: string;
  price?: number;
  isFree?: boolean;
}

interface EnrollmentLink {
  _id: string;
  title: string | null;
  token: string;
  courseIds: { _id: string; title: string; thumbnail?: string }[];
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  isActive: boolean;
  priceOverride: number | null;
  createdBy?: { firstName: string; lastName: string };
  createdAt: string;
}

function linkStatus(link: EnrollmentLink): 'active' | 'expired' | 'maxed' | 'inactive' {
  if (!link.isActive) return 'inactive';
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return 'expired';
  if (link.maxUses > 0 && link.uses >= link.maxUses) return 'maxed';
  return 'active';
}

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success', expired: 'danger', maxed: 'warning', inactive: 'default',
};

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      title="Copy link"
      className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium transition-colors"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          Copy link
        </>
      )}
    </button>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

interface CreateModalProps {
  courses: CourseOption[];
  onClose: () => void;
  onCreated: () => void;
}

function CreateModal({ courses, onClose, onCreated }: CreateModalProps) {
  const [title, setTitle]         = useState('');
  const [selected, setSelected]   = useState<string[]>([]);
  const [maxUses, setMaxUses]      = useState('');
  const [expiresAt, setExpiresAt]  = useState('');
  const [priceOverride, setPriceOverride] = useState('');
  const [error, setError]          = useState('');

  // A custom price only makes sense for exactly one, normally-paid course —
  // see enrollmentLink.service.js's createLink for the matching backend rule.
  const selectedCourse = selected.length === 1 ? courses.find(c => c._id === selected[0]) : null;
  const canSetCustomPrice = !!selectedCourse && !selectedCourse.isFree && (selectedCourse.price ?? 0) > 0;

  const mutation = useMutation({
    mutationFn: () => api.post('/enrollment-links', {
      title: title.trim() || undefined,
      courseIds: selected,
      maxUses: maxUses ? parseInt(maxUses) : 0,
      expiresAt: expiresAt || undefined,
      priceOverride: canSetCustomPrice && priceOverride ? parseFloat(priceOverride) : undefined,
    }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Failed to create link');
    },
  });

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const published = courses.filter(c => c.status === 'published');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Create shareable enrollment link</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <Alert variant="error">{error}</Alert>}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Link title <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Summer 2025 bundle"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>

          {/* Course selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Select courses <span className="text-red-500">*</span>
            </label>
            {published.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No published courses available.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-50 max-h-52 overflow-y-auto">
                {published.map(c => (
                  <label
                    key={c._id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(c._id)}
                      onChange={() => toggle(c._id)}
                      className="w-4 h-4 text-primary-600 rounded"
                    />
                    <span className="text-sm text-gray-800 flex-1">{c.title}</span>
                  </label>
                ))}
              </div>
            )}
            {selected.length > 1 && (
              <p className="text-xs text-primary-600 mt-1.5">
                Bundle of {selected.length} courses — users will be enrolled in all of them.
              </p>
            )}
          </div>

          {/* Custom price — only for a single, normally-paid course */}
          {canSetCustomPrice && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Custom price <span className="text-gray-400 font-normal">(optional — overrides the course's own ${selectedCourse!.price?.toFixed(2)} price)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={priceOverride}
                  onChange={e => setPriceOverride(e.target.value)}
                  placeholder={selectedCourse!.price?.toFixed(2)}
                  className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Anyone using this link pays this price instead — full course access either way, just for a
                {' '}<strong>different price</strong>, not free.
              </p>
            </div>
          )}

          {/* Optional limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Max uses <span className="text-gray-400 font-normal">(0 = unlimited)</span>
              </label>
              <input
                type="number"
                min={0}
                value={maxUses}
                onChange={e => setMaxUses(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Expires on</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={selected.length === 0}
          >
            Create link
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ShareLinksPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const { data: linksData, isLoading, isError } = useQuery({
    queryKey: ['enrollment-links'],
    queryFn: async () => {
      const { data } = await api.get('/enrollment-links');
      return data.data as { links: EnrollmentLink[]; pagination: { total: number } };
    },
  });

  const { data: coursesData } = useQuery({
    queryKey: ['courses-for-link'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=100&status=published');
      return data.data?.courses as CourseOption[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/enrollment-links/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollment-links'] });
      setDeleteConfirm(null);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setDeleteError(err.response?.data?.message ?? 'Failed to delete');
    },
  });

  const links   = linksData?.links ?? [];
  const courses = coursesData ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Share Links</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create shareable links to enroll users in one or more courses — no payment required.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="flex-shrink-0">
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New link
        </Button>
      </div>

      {/* Info banner */}
      <div className="bg-primary-50 border border-primary-100 rounded-xl px-5 py-4 flex gap-3 text-sm text-primary-800">
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          Anyone who clicks your link enrolls in a free course instantly — great for social media, email
          campaigns, or onboarding. Single courses <strong>or</strong> bundles are both supported. For a
          paid course, the link takes them to checkout instead (optionally at a custom price you set).
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : isError ? (
        <Alert variant="error">Failed to load links. Please try again.</Alert>
      ) : links.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <p className="text-sm font-medium">No share links yet</p>
          <p className="text-xs mt-1">Create your first link to start sharing courses.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map(link => {
            const status = linkStatus(link);
            const url    = `${origin}/join/${link.token}`;
            return (
              <div key={link._id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">
                        {link.title || (link.courseIds.length > 1 ? `Bundle (${link.courseIds.length} courses)` : link.courseIds[0]?.title ?? 'Unnamed link')}
                      </p>
                      <Badge variant={STATUS_BADGE[status]} className="capitalize text-xs">{status}</Badge>
                      {link.courseIds.length > 1 && (
                        <Badge variant="default" className="text-xs">Bundle</Badge>
                      )}
                      {link.priceOverride != null && (
                        <Badge variant="default" className="text-xs">${link.priceOverride.toFixed(2)} custom price</Badge>
                      )}
                    </div>

                    {/* Course chips */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {link.courseIds.map(c => (
                        <span key={c._id} className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                          {c.title}
                        </span>
                      ))}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        {link.uses} use{link.uses !== 1 ? 's' : ''}
                        {link.maxUses > 0 && ` / ${link.maxUses}`}
                      </span>
                      {link.expiresAt && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Expires {new Date(link.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                      {user?.role === 'tenant_admin' && link.createdBy && (
                        <span>by {link.createdBy.firstName} {link.createdBy.lastName}</span>
                      )}
                      <span>Created {new Date(link.createdAt).toLocaleDateString()}</span>
                    </div>

                    {/* URL row */}
                    <div className="flex items-center gap-3 mt-3 bg-gray-50 rounded-lg px-3 py-2">
                      <code className="text-xs text-gray-600 flex-1 truncate">{url}</code>
                      <CopyButton url={url} />
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => { setDeleteError(''); setDeleteConfirm(link._id); }}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                    title="Delete link"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Delete this link?</h3>
            <p className="text-sm text-gray-500">Anyone with the link will no longer be able to use it to enroll.</p>
            {deleteError && <Alert variant="error">{deleteError}</Alert>}
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteConfirm)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          courses={courses}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['enrollment-links'] })}
        />
      )}
    </div>
  );
}
