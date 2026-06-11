'use client';

import { useState, useRef, type RefObject, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Author { _id: string; firstName: string; lastName: string; avatar?: string; }
interface AnnouncementCourse { _id: string; title: string; }
interface CourseOption { _id: string; title: string; }

interface Announcement {
  _id: string;
  title: string;
  body: string;
  authorId: Author;
  courseId?: AnnouncementCourse;
  isPublished: boolean;
  publishedAt?: string;
  scheduledPublishAt?: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function authorName(a: Author) { return `${a.firstName} ${a.lastName}`; }

// ─── Markdown renderer (no external deps) ────────────────────────────────────

function parseInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={match.index}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={match.index}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={match.index} className="bg-gray-100 px-1 rounded text-xs font-mono">{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  const pending: string[] = [];

  function flushList() {
    if (!pending.length) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="list-disc pl-5 mb-3 space-y-1 text-gray-700">
        {pending.splice(0).map((item, j) => <li key={j}>{parseInline(item)}</li>)}
      </ul>
    );
  }

  lines.forEach((line, i) => {
    if (line.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={i} className="text-sm font-bold text-gray-900 mt-3 mb-1">{parseInline(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={i} className="text-base font-bold text-gray-900 mt-4 mb-1">{parseInline(line.slice(3))}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      pending.push(line.slice(2));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      elements.push(<p key={i} className="text-gray-700 leading-relaxed mb-2">{parseInline(line)}</p>);
    }
  });
  flushList();

  return <div className="text-sm">{elements}</div>;
}

// Strip markdown syntax for plain-text card preview
function stripMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,3} /gm, '')
    .replace(/^[*-] /gm, '');
}

// ─── Markdown toolbar ─────────────────────────────────────────────────────────

function insertMd(ta: HTMLTextAreaElement | null, before: string, after: string, placeholder: string): string {
  if (!ta) return '';
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.substring(start, end) || placeholder;
  return ta.value.substring(0, start) + before + sel + after + ta.value.substring(end);
}

function MdToolbar({ taRef, onChange }: { taRef: RefObject<HTMLTextAreaElement>; onChange: (v: string) => void }) {
  const mkBtn = (label: string, title: string, before: string, after: string, placeholder: string) => (
    <button
      key={label}
      type="button"
      title={title}
      className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors"
      onMouseDown={(e) => {
        e.preventDefault();
        onChange(insertMd(taRef.current, before, after, placeholder));
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 border border-gray-300 border-b-0 rounded-t-lg px-2 py-1 bg-gray-50">
      {mkBtn('B',  'Bold',        '**', '**', 'bold text')}
      {mkBtn('I',  'Italic',      '*',  '*',  'italic text')}
      {mkBtn('H',  'Heading',     '### ', '', 'Heading')}
      {mkBtn('•',  'Bullet list', '\n- ', '', 'item')}
      {mkBtn('`⌥`', 'Inline code', '`', '`', 'code')}
      <span className="flex-1" />
      <span className="text-xs text-gray-400 pr-1 select-none">Markdown</span>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function AnnouncementModal({
  announcement,
  onClose,
}: {
  announcement?: Announcement;
  onClose: () => void;
}) {
  const qc      = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [title,       setTitle]       = useState(announcement?.title ?? '');
  const [body,        setBody]        = useState(announcement?.body  ?? '');
  const [scope,       setScope]       = useState<'tenant' | 'course'>(announcement?.courseId ? 'course' : 'tenant');
  const [courseId,    setCourseId]    = useState(announcement?.courseId?._id ?? '');
  const [useSchedule, setUseSchedule] = useState(!!announcement?.scheduledPublishAt);
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (!announcement?.scheduledPublishAt) return '';
    return new Date(announcement.scheduledPublishAt).toISOString().slice(0, 16);
  });
  const [tab,   setTab]   = useState<'write' | 'preview'>('write');
  const [error, setError] = useState('');

  const { data: coursesRaw } = useQuery({
    queryKey: ['courses-for-announcement'],
    queryFn: () =>
      api.get('/courses', { params: { limit: 100 } })
        .then(r => r.data?.data?.courses as CourseOption[]),
  });
  const courses = coursesRaw ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        title,
        body,
        courseId: scope === 'course' ? courseId || null : null,
      };

      if (useSchedule && scheduledAt) {
        payload.scheduledPublishAt = new Date(scheduledAt).toISOString();
      } else if (announcement?.scheduledPublishAt) {
        payload.scheduledPublishAt = null;
      }

      return announcement
        ? api.patch(`/announcements/${announcement._id}`, payload)
        : api.post('/announcements', payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['announcements'] }); onClose(); },
    onError:   () => setError('Failed to save. Please try again.'),
  });

  const minDatetime = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16);
  const saveLabel   = useSchedule && scheduledAt ? 'Save & Schedule' : 'Save';
  const canSave     = title.trim() && body.trim()
    && (scope !== 'course' || !!courseId)
    && (!useSchedule || !!scheduledAt);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {announcement ? 'Edit Announcement' : 'New Announcement'}
        </h2>

        {error && <Alert variant="error" className="mb-3">{error}</Alert>}

        <div className="space-y-4">
          {/* Title */}
          <input
            autoFocus
            type="text"
            placeholder="Announcement title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />

          {/* Audience scope */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Audience</p>
            <div className="flex gap-2">
              {(['tenant', 'course'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    scope === s
                      ? 'bg-primary-50 border-primary-400 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s === 'tenant' ? 'Tenant-wide' : 'Specific Course'}
                </button>
              ))}
            </div>
            {scope === 'course' && (
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="mt-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select a course…</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>{c.title}</option>
                ))}
              </select>
            )}
          </div>

          {/* Body — Write / Preview tabs */}
          <div>
            {/* Tab bar + toolbar on same row */}
            <div className="flex items-center border border-gray-300 border-b-0 rounded-t-lg bg-gray-50 px-2 py-1 gap-1">
              <button
                type="button"
                onClick={() => setTab('write')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                  tab === 'write' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setTab('preview')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                  tab === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Preview
              </button>
              {tab === 'write' && (
                <>
                  <span className="w-px h-4 bg-gray-300 mx-1" />
                  <MdToolbar taRef={bodyRef} onChange={setBody} />
                </>
              )}
            </div>

            {tab === 'write' ? (
              <textarea
                ref={bodyRef}
                rows={8}
                placeholder="Write your announcement… supports **bold**, *italic*, ### Heading, - bullet"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-b-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none font-mono"
              />
            ) : (
              <div className="min-h-[160px] border border-gray-300 rounded-b-lg px-4 py-3 bg-white">
                {body.trim() ? (
                  <MarkdownContent text={body} />
                ) : (
                  <p className="text-sm text-gray-400 italic">Nothing to preview yet.</p>
                )}
              </div>
            )}
          </div>

          {/* Schedule section */}
          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useSchedule}
                onChange={(e) => { setUseSchedule(e.target.checked); if (!e.target.checked) setScheduledAt(''); }}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700">Schedule publish date</span>
            </label>
            {useSchedule && (
              <div className="mt-2">
                <input
                  type="datetime-local"
                  min={minDatetime}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Announcement publishes automatically and notifies students at the scheduled time.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={mutation.isPending}
            disabled={!canSave}
            onClick={() => mutation.mutate()}
          >
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{announcement.title}</h2>
            <p className="text-sm text-gray-400 mt-1">
              {authorName(announcement.authorId)} · {formatDate(announcement.publishedAt ?? announcement.createdAt)}
              {announcement.courseId && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                  {announcement.courseId.title}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <MarkdownContent text={announcement.body} />
        </div>
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AnnouncementCard({
  announcement,
  canEdit,
  onEdit,
  onRead,
}: {
  announcement: Announcement;
  canEdit: boolean;
  onEdit: () => void;
  onRead: () => void;
}) {
  const qc          = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const isScheduled = !announcement.isPublished && !!announcement.scheduledPublishAt;

  const publishMutation = useMutation({
    mutationFn: () =>
      announcement.isPublished
        ? api.patch(`/announcements/${announcement._id}/unpublish`)
        : api.patch(`/announcements/${announcement._id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const cancelScheduleMutation = useMutation({
    mutationFn: () => api.patch(`/announcements/${announcement._id}`, { scheduledPublishAt: null }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/announcements/${announcement._id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        {/* Left */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {canEdit && (
              <>
                {announcement.isPublished && <Badge variant="success">Published</Badge>}
                {isScheduled && (
                  <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium border border-amber-200">
                    Scheduled · {formatDateTime(announcement.scheduledPublishAt!)}
                  </span>
                )}
                {!announcement.isPublished && !isScheduled && <Badge variant="warning">Draft</Badge>}
              </>
            )}
            {announcement.courseId && (
              <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                {announcement.courseId.title}
              </span>
            )}
          </div>

          <button onClick={onRead} className="text-left block w-full">
            <h3 className="text-base font-semibold text-gray-900 hover:text-primary-600 transition-colors">
              {announcement.title}
            </h3>
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              {stripMarkdown(announcement.body)}
            </p>
          </button>

          <p className="text-xs text-gray-400 mt-2">
            {authorName(announcement.authorId)} · {formatDate(announcement.publishedAt ?? announcement.createdAt)}
          </p>
        </div>

        {/* Right — action buttons */}
        {canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
            {isScheduled ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelScheduleMutation.mutate()}
                loading={cancelScheduleMutation.isPending}
              >
                Cancel Schedule
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => publishMutation.mutate()}
                loading={publishMutation.isPending}
              >
                {announcement.isPublished ? 'Unpublish' : 'Publish'}
              </Button>
            )}

            <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>

            {confirming ? (
              <>
                <Button size="sm" variant="danger" onClick={() => deleteMutation.mutate()} loading={deleteMutation.isPending}>
                  Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>Delete</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const user      = useAuthStore((s) => s.user);
  const isStudent = user?.role === 'student';
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState<Announcement | undefined>();
  const [reading,   setReading]   = useState<Announcement | undefined>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['announcements'],
    queryFn:  () => api.get('/announcements').then((r) => r.data?.data?.announcements as Announcement[]),
  });

  const announcements = data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6 text-primary-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <Alert variant="error">Failed to load announcements.</Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isStudent ? 'Stay up to date with the latest news.' : 'Post updates for your students.'}
          </p>
        </div>
        {!isStudent && (
          <Button onClick={() => { setEditing(undefined); setShowModal(true); }}>
            + New Announcement
          </Button>
        )}
      </div>

      {/* List */}
      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No announcements yet.</p>
          {!isStudent && (
            <p className="text-gray-400 text-sm mt-1">Create your first announcement to notify students.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <AnnouncementCard
              key={a._id}
              announcement={a}
              canEdit={!isStudent}
              onEdit={() => { setEditing(a); setShowModal(true); }}
              onRead={() => setReading(a)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <AnnouncementModal
          announcement={editing}
          onClose={() => { setShowModal(false); setEditing(undefined); }}
        />
      )}
      {reading && (
        <DetailModal announcement={reading} onClose={() => setReading(undefined)} />
      )}
    </div>
  );
}
