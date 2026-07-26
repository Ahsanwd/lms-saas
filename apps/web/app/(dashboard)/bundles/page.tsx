'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner, Alert } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import { AxiosError } from 'axios';
import { CheckoutModal } from '@/components/payment/CheckoutModal';

interface BundleCourseRef { _id: string; title: string }
interface Bundle {
  _id: string;
  title: string;
  description: string | null;
  courseIds: BundleCourseRef[];
  price: number;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
}
interface CourseOption { _id: string; title: string }

// ═══════════════════════════════════════════════════════════════════════════
// Create/Edit modal (admin)
// ═══════════════════════════════════════════════════════════════════════════
function BundleModal({
  bundle, courses, onClose,
}: { bundle?: Bundle | null; courses: CourseOption[]; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!bundle;

  const [title, setTitle]             = useState(bundle?.title ?? '');
  const [description, setDescription] = useState(bundle?.description ?? '');
  const [price, setPrice]             = useState(String(bundle?.price ?? ''));
  const [selectedCourses, setSelectedCourses] = useState<string[]>(bundle?.courseIds.map(c => c._id) ?? []);
  const [status, setStatus]           = useState<'draft' | 'published'>(bundle?.status === 'published' ? 'published' : 'draft');
  const [error, setError]             = useState('');

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      isEdit ? api.patch(`/bundles/${bundle!._id}`, payload) : api.post('/bundles', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundles-admin'] });
      onClose();
    },
    onError: (err: AxiosError<{ message: string }>) => setError(err.response?.data?.message ?? 'Failed to save bundle'),
  });

  const toggleCourse = (id: string) =>
    setSelectedCourses(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

  const handleSubmit = () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!price || Number(price) < 0) { setError('A valid price is required'); return; }
    if (selectedCourses.length < 2) { setError('Select at least 2 courses'); return; }
    setError('');
    mutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
      price: Number(price),
      courseIds: selectedCourses,
      status,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Bundle' : 'Create Bundle'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Full Stack Web Dev Bundle"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Everything a student needs to go from beginner to job-ready"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bundle Price ($) <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">$</span>
              <input type="number" min={0} value={price} onChange={e => setPrice(e.target.value)}
                className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Courses in this Bundle <span className="text-red-500">*</span>
              <span className="ml-1 text-xs font-normal text-gray-400">(select at least 2)</span>
            </label>
            {courses.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No published courses yet</p>
            ) : (
              <div className="border border-gray-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-gray-50">
                {courses.map(c => (
                  <label key={c._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedCourses.includes(c._id)} onChange={() => toggleCourse(c._id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    <span className="text-sm text-gray-700 truncate">{c.title}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">{selectedCourses.length} selected</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {(['draft', 'published'] as const).map(s => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={cn('py-2 px-3 text-sm rounded-lg border-2 font-medium capitalize transition-colors',
                    status === s ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} onClick={handleSubmit}>{isEdit ? 'Save Changes' : 'Create Bundle'}</Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin management table
// ═══════════════════════════════════════════════════════════════════════════
function BundleManagementTable() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<Bundle | null>(null);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionError, setActionError]   = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['bundles-admin', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/bundles/admin?${params}`);
      return data.data as { bundles: Bundle[]; pagination: { total: number } };
    },
  });

  const { data: coursesData } = useQuery({
    queryKey: ['courses-simple'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=200&status=published');
      return (data.data?.courses ?? []) as CourseOption[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bundles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bundles-admin'] }),
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Delete failed');
      setTimeout(() => setActionError(''), 3000);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'draft' | 'published' }) => api.patch(`/bundles/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bundles-admin'] }),
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Action failed');
      setTimeout(() => setActionError(''), 3000);
    },
  });

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit   = (b: Bundle) => { setEditing(b); setModalOpen(true); };

  const bundles = data?.bundles ?? [];
  const courses = coursesData ?? [];

  const STATUS_BADGE: Record<string, string> = {
    draft:     'bg-gray-100 text-gray-600',
    published: 'bg-green-50 text-green-700',
    archived:  'bg-red-50 text-red-600',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bundles</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.pagination?.total ?? 0} bundles total</p>
        </div>
        <Button onClick={openCreate}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Bundle
        </Button>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      <div className="flex gap-3">
        <input type="text" placeholder="Search bundles..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : bundles.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="font-medium text-gray-900">No bundles yet</p>
          <p className="text-sm text-gray-500 mt-1">Package multiple courses together and sell them at one price.</p>
          <Button className="mt-4" onClick={openCreate}>Create Bundle</Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Courses</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bundles.map(b => (
                <tr key={b._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900">{b.title}</p>
                    {b.description && <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{b.description}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-0.5">
                      {b.courseIds.slice(0, 2).map(c => (
                        <span key={c._id} className="block text-xs text-gray-600 truncate max-w-[160px]">{c.title}</span>
                      ))}
                      {b.courseIds.length > 2 && <span className="text-xs text-gray-400">+{b.courseIds.length - 2} more</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-gray-900">${b.price.toFixed(2)}</td>
                  <td className="px-4 py-4">
                    <span className={cn('inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_BADGE[b.status])}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>Edit</Button>
                      {b.status !== 'archived' && (
                        <Button size="sm" variant="ghost" loading={toggleStatusMutation.isPending}
                          onClick={() => toggleStatusMutation.mutate({ id: b._id, status: b.status === 'published' ? 'draft' : 'published' })}>
                          <span className={b.status === 'published' ? 'text-amber-600' : 'text-green-600'}>
                            {b.status === 'published' ? 'Unpublish' : 'Publish'}
                          </span>
                        </Button>
                      )}
                      <Button size="sm" variant="danger" loading={deleteMutation.isPending}
                        onClick={() => { if (confirm(`Delete bundle "${b.title}"?`)) deleteMutation.mutate(b._id); }}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <BundleModal bundle={editing} courses={courses} onClose={() => { setModalOpen(false); setEditing(null); }} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Student catalog
// ═══════════════════════════════════════════════════════════════════════════
function BundleCatalog() {
  const qc = useQueryClient();
  const [buyingBundle, setBuyingBundle] = useState<Bundle | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bundles-public'],
    queryFn: async () => {
      const { data } = await api.get('/bundles');
      return data.data as { bundles: Bundle[] };
    },
  });

  const bundles = data?.bundles ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Course Bundles</h1>
        <p className="text-sm text-gray-500 mt-0.5">Save by getting multiple courses together in one purchase</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : bundles.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center py-20 text-center">
          <p className="font-medium text-gray-900">No bundles available yet</p>
          <p className="text-sm text-gray-500 mt-1">Check back later for bundled course deals.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bundles.map(b => (
            <div key={b._id} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col">
              <h3 className="font-semibold text-gray-900">{b.title}</h3>
              {b.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{b.description}</p>}
              <div className="mt-3 space-y-1">
                {b.courseIds.slice(0, 4).map(c => (
                  <p key={c._id} className="text-xs text-gray-600 flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-primary-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {c.title}
                  </p>
                ))}
                {b.courseIds.length > 4 && <p className="text-xs text-gray-400">+{b.courseIds.length - 4} more courses</p>}
              </div>
              <div className="mt-auto pt-4 flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">${b.price.toFixed(2)}</span>
                <Button size="sm" onClick={() => setBuyingBundle(b)}>Buy Bundle</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {buyingBundle && (
        <CheckoutModal
          itemLabel={buyingBundle.title}
          price={buyingBundle.price}
          initiateUrl={`/payments/bundles/${buyingBundle._id}/initiate`}
          confirmUrlBase="/payments/bundles"
          validateCoupon={(code) => api.post('/coupons/validate-bundle', { code, bundleId: buyingBundle._id }).then(r => r.data.data)}
          successMessage="You now have access to every course in this bundle. Enjoy!"
          onSuccess={() => qc.invalidateQueries({ queryKey: ['my-enrollments'] })}
          onClose={() => setBuyingBundle(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Page entry point — role-aware dispatcher
// ═══════════════════════════════════════════════════════════════════════════
export default function BundlesPage() {
  const user = useAuthStore(s => s.user);
  if (!user) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  return user.role === 'student' ? <BundleCatalog /> : <BundleManagementTable />;
}
