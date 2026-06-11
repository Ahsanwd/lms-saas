'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Alert } from '@/components/ui';
import { AxiosError } from 'axios';
import { useState } from 'react';

// ── Quick-create category modal ───────────────────────────────────────────────
function NewCategoryModal({
  onClose,
  onCreated,
  existingCategories,
}: {
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
  existingCategories: Array<{ _id: string; name: string; parentId?: string }>;
}) {
  const qc = useQueryClient();
  const [name, setName]       = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError]     = useState('');

  const topLevel = existingCategories.filter(c => !c.parentId);

  const mutation = useMutation({
    mutationFn: () => api.post('/courses/categories', { name: name.trim(), parentId: parentId || undefined }),
    onSuccess: (res) => {
      const cat = res.data.data.category;
      qc.invalidateQueries({ queryKey: ['categories'] });
      onCreated(cat._id, cat.name);
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to create category'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">New Category</h3>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) mutation.mutate();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Category name"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        {topLevel.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Parent category <span className="text-gray-400">(optional — for sub-categories)</span>
            </label>
            <select
              value={parentId}
              onChange={e => setParentId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">None (top-level)</option>
              {topLevel.map(c => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={mutation.isPending} disabled={!name.trim()} onClick={() => mutation.mutate()}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

const schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  categoryId: z.string().optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  price: z.coerce.number().min(0),
  isFree: z.boolean(),
  capacity: z.coerce.number().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewCoursePage() {
  const router = useRouter();
  const [error, setError]           = useState('');
  const [showCatModal, setShowCatModal] = useState(false);
  const [tags, setTags]             = useState<string[]>([]);
  const [tagInput, setTagInput]     = useState('');

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await api.get('/courses/categories');
      return data.data.categories as Array<{ _id: string; name: string; parentId?: string }>;
    },
  });

  const [selectedParentId, setSelectedParentId] = useState('');
  const [selectedSubId, setSelectedSubId]       = useState('');

  const topLevelCats = (categoriesData ?? []).filter(c => !c.parentId);
  const subCats      = (categoriesData ?? []).filter(c => c.parentId === selectedParentId);
  const parentName   = topLevelCats.find(c => c._id === selectedParentId)?.name ?? '';

  function handleParentChange(id: string) {
    setSelectedParentId(id);
    setSelectedSubId('');
    setValue('categoryId', id || undefined);
  }

  function handleSubChange(id: string) {
    setSelectedSubId(id);
    setValue('categoryId', id || selectedParentId || undefined);
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/,/g, '');
    if (tag && !tags.includes(tag)) setTags(prev => [...prev, tag]);
    setTagInput('');
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { level: 'beginner', price: 0, isFree: true },
  });

  const isFree = watch('isFree');

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/courses', { ...data, tags }),
    onSuccess: (res) => {
      router.push(`/courses/${res.data.data.course._id}`);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Failed to create course');
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4 pb-6 border-b border-gray-200">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Create New Course</h1>
          <p className="text-sm text-gray-500 mt-0.5">Set up your course — you can add lessons, quizzes and more after creating it.</p>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Left: Form ─────────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="lg:col-span-2 space-y-5"
        >
          {/* Basic Info */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Basic Info</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Course Title <span className="text-red-500">*</span>
                </label>
                <input
                  placeholder="e.g. Introduction to JavaScript"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                  {...register('title')}
                />
                {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={5}
                  placeholder="What will students learn? What are the prerequisites? Who is this course for?"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none transition-shadow"
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Settings</h2>
            </div>
            <div className="px-6 py-5 space-y-5">
              {/* Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Level</label>
                <select
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  {...register('level')}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">Category</label>
                  <button type="button" onClick={() => setShowCatModal(true)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                    + New category
                  </button>
                </div>
                <select
                  value={selectedParentId}
                  onChange={e => handleParentChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">No category</option>
                  {topLevelCats.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>

              {/* Sub-category — only appears when parent has children */}
              {selectedParentId && subCats.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Sub-category
                    <span className="ml-1.5 text-xs font-normal text-gray-400">optional</span>
                  </label>
                  <select
                    value={selectedSubId}
                    onChange={e => handleSubChange(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">All of {parentName}</option>
                    {subCats.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Pricing */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pricing</p>
                </div>
                <div className="p-4 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      {...register('isFree')}
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-800">Free course</span>
                      <p className="text-xs text-gray-400">Students can enroll without any payment</p>
                    </div>
                  </label>
                  {!isFree && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Price (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">$</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="29.99"
                          className="w-full pl-7 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          {...register('price')}
                        />
                      </div>
                      {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price.message}</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Capacity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Capacity
                  <span className="ml-1.5 text-xs font-normal text-gray-400">optional</span>
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="Leave blank for unlimited"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  {...register('capacity')}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Tags
                  <span className="ml-1.5 text-xs font-normal text-gray-400">Press Enter or comma to add</span>
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 border border-primary-200 rounded-full text-xs font-medium">
                      {tag}
                      <button type="button" onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="hover:text-primary-900">×</button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                  placeholder="e.g. javascript, react, beginner"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>
              Create Course
              <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Button>
          </div>
        </form>

        {/* ── Right: Tips panel ──────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Tips */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-gray-100 bg-primary-50">
              <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">Tips for a great course</p>
            </div>
            <div className="p-4 space-y-3.5">
              {[
                {
                  icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
                  title: 'Write a clear title',
                  desc: 'Be specific — "JavaScript for Beginners" beats "Coding Course".',
                },
                {
                  icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
                  title: 'Write a helpful description',
                  desc: 'Tell students what they\'ll learn, who it\'s for, and any prerequisites.',
                },
                {
                  icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
                  title: 'Pick the right level',
                  desc: 'Helps students find the course that matches where they are.',
                },
              ].map((tip) => (
                <div key={tip.title} className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tip.icon} />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{tip.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{tip.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What's next */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">What happens next?</p>
            </div>
            <div className="p-4 space-y-3">
              {[
                { step: '1', label: 'Create the course', done: true },
                { step: '2', label: 'Add sections & lessons' },
                { step: '3', label: 'Upload videos & files' },
                { step: '4', label: 'Publish when ready' },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    item.done ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {item.step}
                  </div>
                  <span className={`text-xs ${item.done ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showCatModal && (
        <NewCategoryModal
          onClose={() => setShowCatModal(false)}
          onCreated={(id) => {
            setValue('categoryId', id);
            setShowCatModal(false);
          }}
          existingCategories={categoriesData ?? []}
        />
      )}
    </div>
  );
}
