'use client';

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AxiosError } from 'axios';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type MediaCategory = 'thumbnail' | 'content-image' | 'video' | 'audio' | 'chat' | 'attachment' | 'cloudflare-stream';

interface MediaItem {
  _id: string;
  url: string;
  filename: string | null;
  mimeType: string | null;
  category: MediaCategory;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  provider: 'local' | 's3' | 'cloudflare';
  contextType: string | null;
  createdBy?: { firstName: string; lastName: string; avatar?: string } | null;
  createdAt: string;
}

type CategoryFilter = 'all' | MediaCategory;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const CATEGORY_LABEL: Record<MediaCategory, string> = {
  thumbnail:         'Image',
  'content-image':   'Image',
  video:             'Video',
  audio:             'Audio',
  chat:              'Chat File',
  attachment:        'Document',
  'cloudflare-stream': 'Stream Video',
};

const CATEGORY_ICON: Record<MediaCategory, string> = {
  thumbnail: '🖼️', 'content-image': '🖼️', video: '🎬', audio: '🎵',
  chat: '💬', attachment: '📄', 'cloudflare-stream': '☁️',
};

const CONTEXT_LABEL: Record<string, string> = {
  'course-thumbnail':          'Course thumbnail',
  'course-content-image':      'Course content',
  'lesson-video':              'Lesson video',
  'lesson-audio':              'Lesson audio',
  'lesson-file':               'Lesson file',
  'lesson-attachment':         'Lesson attachment',
  'tenant-logo':               'Org logo',
  'tenant-favicon':            'Org favicon',
  'website-page-image':        'Website page',
  'chat-message':              'Chat message',
  'assignment-template':       'Assignment',
  'assignment-submission':     'Submission',
  'certificate-logo':          'Certificate logo',
  'certificate-background':    'Certificate background',
  'certificate-signature':     'Certificate signature',
  'certificate-second-signature': 'Certificate signature',
  'user-avatar':               'Avatar',
};

const FILTER_TABS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'thumbnail', label: 'Images' },
  { key: 'video', label: 'Videos' },
  { key: 'cloudflare-stream', label: 'Stream Videos' },
  { key: 'audio', label: 'Audio' },
  { key: 'attachment', label: 'Documents' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

function categoryForFile(file: File): 'thumbnail' | 'video' | 'audio' | 'attachment' {
  if (file.type.startsWith('image/')) return 'thumbnail';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'attachment';
}

export default function MediaLibraryPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [actionError, setActionError] = useState('');
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['media', category, search, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit };
      if (category !== 'all') params.category = category;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get('/media', { params });
      return data.data as { media: MediaItem[]; pagination: { total: number; page: number; limit: number; pages: number } };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/media/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Delete failed');
      setTimeout(() => setActionError(''), 3000);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post(`/media/upload?category=${categoryForFile(file)}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] });
      toast.success('File uploaded');
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Upload failed');
      setTimeout(() => setActionError(''), 3000);
    },
  });

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = '';
  }

  function handleDelete(item: MediaItem) {
    const ok = window.confirm(
      `Delete "${item.filename || 'this file'}"? If it's still used in a course, lesson, or elsewhere, that reference will break (broken link). This cannot be undone.`
    );
    if (ok) deleteMutation.mutate(item._id);
  }

  function handleCopyUrl(item: MediaItem) {
    navigator.clipboard.writeText(item.url);
    toast.success(item.category === 'cloudflare-stream' ? 'Video ID copied' : 'URL copied to clipboard');
  }

  const media = data?.media ?? [];
  const pagination = data?.pagination;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Media Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every image, video, and document uploaded across your organization — search, copy a URL, or free up storage.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelected}
        />
        <Button onClick={() => fileInputRef.current?.click()} loading={uploadMutation.isPending}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload
        </Button>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setCategory(tab.key); setPage(1); }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                category === tab.key
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-primary-300 hover:text-primary-600'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by filename…"
          className="ml-auto w-full sm:w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      )}

      {!isLoading && media.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="font-medium text-gray-700">No files found</p>
          <p className="text-sm text-gray-400 mt-1">
            {category !== 'all' || search ? 'Try a different filter or search term.' : 'Uploads across the app will show up here.'}
          </p>
        </div>
      )}

      {!isLoading && media.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">File</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Used In</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Uploaded</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {media.map(item => (
                <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{CATEGORY_ICON[item.category]}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate max-w-[200px]">{item.filename || 'Untitled'}</p>
                        {item.width && item.height && (
                          <p className="text-xs text-gray-400">{item.width}×{item.height}px</p>
                        )}
                        {item.durationSeconds != null && (
                          <p className="text-xs text-gray-400">{formatDuration(item.durationSeconds)}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge>{CATEGORY_LABEL[item.category]}</Badge>
                  </td>
                  <td className="px-4 py-4 text-gray-600">{formatBytes(item.sizeBytes)}</td>
                  <td className="px-4 py-4 hidden md:table-cell text-xs text-gray-500">
                    {item.contextType ? (CONTEXT_LABEL[item.contextType] ?? item.contextType) : '—'}
                  </td>
                  <td className="px-4 py-4 hidden sm:table-cell text-xs text-gray-400">
                    <p>{new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    {item.createdBy && (
                      <p className="text-gray-400">by {item.createdBy.firstName} {item.createdBy.lastName}</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => handleCopyUrl(item)}>Copy URL</Button>
                      <Button size="sm" variant="ghost" loading={deleteMutation.isPending} onClick={() => handleDelete(item)}>
                        <span className="text-red-600">Delete</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>Page {pagination.page} of {pagination.pages} · {pagination.total} files</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="ghost" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
