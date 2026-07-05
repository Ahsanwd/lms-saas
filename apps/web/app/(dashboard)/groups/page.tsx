'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Spinner } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { AxiosError } from 'axios';

// ── Types ──────────────────────────────────────────────────────────────────────
interface GroupMember    { _id: string; firstName: string; lastName: string; email: string; avatar?: string }
interface EnrolledCourse { _id: string; title: string; status: string }
interface Group          { _id: string; name: string; description: string; members: GroupMember[]; enrolledCourses: EnrolledCourse[]; createdAt: string }
interface CourseOption   { _id: string; title: string }

interface ChatMessage {
  _id: string;
  senderId: { _id: string; firstName: string; lastName: string; avatar?: string };
  text: string;
  createdAt: string;
}

interface GroupAnnouncement {
  _id: string;
  authorId: { _id: string; firstName: string; lastName: string };
  title: string;
  body: string;
  createdAt: string;
}

// ── GroupModal (create / edit) ─────────────────────────────────────────────────
function GroupModal({ group, onClose, onSaved }: { group?: Group | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName]   = useState(group?.name ?? '');
  const [desc, setDesc]   = useState(group?.description ?? '');
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: (payload: object) => group
      ? api.patch(`/groups/${group._id}`, payload)
      : api.post('/groups', payload),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err: AxiosError<{ message: string }>) => setError(err.response?.data?.message ?? 'Failed to save'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">{group ? 'Edit Group' : 'New Group'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Engineering Team"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={saveMutation.isPending} disabled={!name.trim()}
            onClick={() => saveMutation.mutate({ name, description: desc })}>
            {group ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── EnrollModal ────────────────────────────────────────────────────────────────
function EnrollModal({ group, courses, onClose }: { group: Group; courses: CourseOption[]; onClose: () => void }) {
  const [courseId, setCourseId] = useState('');
  const [result, setResult]     = useState<{ enrolled: string[]; skipped: string[] } | null>(null);
  const [error, setError]       = useState('');

  const enrollMutation = useMutation({
    mutationFn: () => api.post(`/groups/${group._id}/enroll`, { courseId }),
    onSuccess: (res) => setResult(res.data.data),
    onError: (err: AxiosError<{ message: string }>) => setError(err.response?.data?.message ?? 'Enrollment failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">Enroll Group: {group.name}</h2>
        {result ? (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{result.enrolled.length}</p>
                <p className="text-xs text-green-600">Enrolled</p>
              </div>
              <div className="flex-1 bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{result.skipped.length}</p>
                <p className="text-xs text-amber-600">Already enrolled</p>
              </div>
            </div>
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              Select a course to enroll all {group.members.length} members of this group.
            </p>
            <select value={courseId} onChange={e => setCourseId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white">
              <option value="">— Select a course —</option>
              {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
            </select>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button loading={enrollMutation.isPending} disabled={!courseId}
                onClick={() => enrollMutation.mutate()}>
                Enroll {group.members.length} Members
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── AddMemberModal ─────────────────────────────────────────────────────────────
function AddMemberModal({ group, onClose, onSaved }: { group: Group; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail]     = useState('');
  const [found, setFound]     = useState<GroupMember | null>(null);
  const [msgType, setMsgType] = useState<'error' | 'info'>('info');
  const [msg, setMsg]         = useState('');

  const lookupMutation = useMutation({
    mutationFn: (e: string) => api.get(`/groups/find-user?email=${encodeURIComponent(e)}`),
    onSuccess: (res) => { setFound(res.data.data.user); setMsg(''); },
    onError: (err: AxiosError<{ message: string }>) => {
      setFound(null);
      setMsgType('error');
      setMsg(err.response?.status === 404
        ? 'No account found with that email. The user must first be invited from the Users page.'
        : err.response?.data?.message ?? 'Lookup failed. Please try again.');
    },
  });

  const addMutation = useMutation({
    mutationFn: () => api.post(`/groups/${group._id}/members`, { userIds: [found!._id] }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err: AxiosError<{ message: string }>) => {
      setMsgType('error');
      setMsg(err.response?.data?.message ?? 'Failed to add member');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add Member to {group.name}</h2>
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Only users who already have an account in this organisation can be added.
          Go to <strong>Users</strong> to invite someone new first.
        </p>
        <div className="flex gap-2">
          <input type="email" value={email}
            onChange={e => { setEmail(e.target.value); setFound(null); setMsg(''); }}
            onKeyDown={e => e.key === 'Enter' && email.trim() && lookupMutation.mutate(email.trim())}
            placeholder="user@example.com"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <Button size="sm" variant="outline" loading={lookupMutation.isPending}
            disabled={!email.trim()} onClick={() => lookupMutation.mutate(email.trim())}>
            Look up
          </Button>
        </div>
        {msg && (
          <p className={`text-sm flex items-start gap-1.5 ${msgType === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
            {msgType === 'error' && (
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
              </svg>
            )}
            {msg}
          </p>
        )}
        {found && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
            <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-sm font-semibold text-primary-700 flex-shrink-0">
              {found.firstName[0]}{found.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{found.firstName} {found.lastName}</p>
              <p className="text-xs text-gray-500 truncate">{found.email}</p>
            </div>
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={addMutation.isPending} disabled={!found} onClick={() => addMutation.mutate()}>
            Add to Group
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── GroupChatModal ─────────────────────────────────────────────────────────────
function GroupChatModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const currentUser          = useAuthStore(s => s.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText]      = useState('');
  const bottomRef            = useRef<HTMLDivElement>(null);
  const inputRef             = useRef<HTMLInputElement>(null);

  // Load existing messages
  const { isLoading } = useQuery({
    queryKey: ['group-messages', group._id],
    queryFn: async () => {
      const { data } = await api.get(`/groups/${group._id}/messages`);
      setMessages(data.data.messages as ChatMessage[]);
      return data.data.messages as ChatMessage[];
    },
  });

  // Socket: join group room + listen for incoming messages
  useEffect(() => {
    const socket = connectSocket();
    socket.emit('join_group', group._id);

    function onMessage(msg: ChatMessage) {
      setMessages(prev => {
        if (prev.some(m => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    }
    socket.on('group:message', onMessage);

    return () => {
      socket.emit('leave_group', group._id);
      socket.off('group:message', onMessage);
      disconnectSocket();
    };
  }, [group._id]);

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/groups/${group._id}/messages`, { text }),
    onSuccess: () => { setText(''); inputRef.current?.focus(); },
  });

  function handleSend() {
    if (!text.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ height: '80vh', maxHeight: 640 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">{group.name}</h2>
            <p className="text-xs text-gray-400">{group.members.length} members · Group Chat</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
              <svg className="w-10 h-10 mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-sm">No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId._id === currentUser?._id;
              return (
                <div key={msg._id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold ${isMe ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {msg.senderId.firstName[0]}{msg.senderId.lastName[0]}
                  </div>
                  <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                    {!isMe && (
                      <span className="text-xs text-gray-400 px-1">
                        {msg.senderId.firstName} {msg.senderId.lastName}
                      </span>
                    )}
                    <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${isMe ? 'bg-primary-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm'}`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-gray-300 px-1">{formatTime(msg.createdAt)}</span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message…"
            maxLength={2000}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 bg-gray-50"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 disabled:opacity-40 transition-colors flex-shrink-0"
            aria-label="Send message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GroupAnnouncementsModal ────────────────────────────────────────────────────
function GroupAnnouncementsModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const qc                       = useQueryClient();
  const [showForm, setShowForm]  = useState(false);
  const [title, setTitle]        = useState('');
  const [body, setBody]          = useState('');
  const [formError, setFormError] = useState('');

  const { data: announcements = [], isLoading } = useQuery<GroupAnnouncement[]>({
    queryKey: ['group-announcements', group._id],
    queryFn: async () => {
      const { data } = await api.get(`/groups/${group._id}/announcements`);
      return data.data.announcements as GroupAnnouncement[];
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/groups/${group._id}/announcements`, { title, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-announcements', group._id] });
      setTitle(''); setBody(''); setShowForm(false); setFormError('');
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setFormError(err.response?.data?.message ?? 'Failed to post'),
  });

  const deleteMutation = useMutation({
    mutationFn: (annId: string) => api.delete(`/groups/${group._id}/announcements/${annId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-announcements', group._id] }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ height: '80vh', maxHeight: 640 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">{group.name}</h2>
            <p className="text-xs text-gray-400">Group Announcements</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => { setShowForm(true); setFormError(''); }}>
              + Post
            </Button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-1">&times;</button>
          </div>
        </div>

        {/* New announcement form */}
        {showForm && (
          <div className="px-5 py-4 border-b border-gray-100 space-y-3 flex-shrink-0 bg-gray-50">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Announcement title *"
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <textarea
              rows={3}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your announcement…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
            />
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setTitle(''); setBody(''); }}>
                Cancel
              </Button>
              <Button size="sm" loading={createMutation.isPending} disabled={!title.trim() || !body.trim()}
                onClick={() => createMutation.mutate()}>
                Post
              </Button>
            </div>
          </div>
        )}

        {/* Announcements list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16">
              <svg className="w-10 h-10 mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              <p className="text-sm">No announcements yet.</p>
              <button onClick={() => setShowForm(true)} className="text-sm text-primary-600 hover:text-primary-700 mt-1 font-medium">
                Post the first one →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {announcements.map(ann => (
                <div key={ann._id} className="px-5 py-4 group/ann">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{ann.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ann.authorId.firstName} {ann.authorId.lastName} · {formatDate(ann.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate(ann._id)}
                      className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover/ann:opacity-100 transition-all flex-shrink-0 mt-0.5"
                      aria-label="Delete announcement"
                    >
                      Delete
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{ann.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function GroupsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate]         = useState(false);
  const [editing, setEditing]               = useState<Group | null>(null);
  const [enrolling, setEnrolling]           = useState<Group | null>(null);
  const [addMember, setAddMember]           = useState<Group | null>(null);
  const [chatGroup, setChatGroup]           = useState<Group | null>(null);
  const [announcementsGroup, setAnnouncementsGroup] = useState<Group | null>(null);
  const [error, setError]                   = useState('');

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data } = await api.get('/groups');
      return data.data.groups as Group[];
    },
  });

  const { data: courses = [] } = useQuery({
    queryKey: ['courses-simple'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=200&status=published');
      return data.data.courses as CourseOption[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
    onError: (err: AxiosError<{ message: string }>) => setError(err.response?.data?.message ?? 'Delete failed'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      api.delete(`/groups/${groupId}/members`, { data: { userIds: [userId] } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['groups'] });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
          <p className="text-sm text-gray-500 mt-1">Organise users into teams and enroll them in courses together</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New Group</Button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Modals */}
      {showCreate         && <GroupModal onClose={() => setShowCreate(false)} onSaved={refresh} />}
      {editing            && <GroupModal group={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {enrolling          && <EnrollModal group={enrolling} courses={courses} onClose={() => setEnrolling(null)} />}
      {addMember          && <AddMemberModal group={addMember} onClose={() => setAddMember(null)} onSaved={refresh} />}
      {chatGroup          && <GroupChatModal group={chatGroup} onClose={() => setChatGroup(null)} />}
      {announcementsGroup && <GroupAnnouncementsModal group={announcementsGroup} onClose={() => setAnnouncementsGroup(null)} />}

      {isLoading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-2xl border border-gray-200">
          <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="font-medium text-gray-900">No groups yet</p>
          <p className="text-sm text-gray-500 mt-1">Create a group to bulk-enroll teams into courses</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>Create First Group</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g._id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* Group header */}
              <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900">{g.name}</h2>
                  {g.description && <p className="text-sm text-gray-500 mt-0.5">{g.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">{g.members.length} member{g.members.length !== 1 ? 's' : ''}</p>

                  {/* Enrolled courses tags */}
                  {g.enrolledCourses?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-xs text-gray-400">Enrolled in:</span>
                      {g.enrolledCourses.map(c => (
                        <span key={c._id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                          </svg>
                          {c.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  <Button size="sm" onClick={() => setEnrolling(g)}>Enroll in Course</Button>
                  <Button size="sm" variant="outline" onClick={() => setAddMember(g)}>+ Member</Button>
                  <button
                    onClick={() => setChatGroup(g)}
                    title="Group Chat"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Chat
                  </button>
                  <button
                    onClick={() => setAnnouncementsGroup(g)}
                    title="Group Announcements"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                    Announce
                  </button>
                  <button onClick={() => setEditing(g)} className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1">Edit</button>
                  <button onClick={() => deleteMutation.mutate(g._id)} className="text-xs text-gray-400 hover:text-red-600 px-2 py-1">Delete</button>
                </div>
              </div>

              {/* Members list */}
              {g.members.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {g.members.map((m) => (
                    <div key={m._id} className="flex items-center justify-between px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-xs font-medium text-primary-700">
                          {m.firstName[0]}{m.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{m.firstName} {m.lastName}</p>
                          <p className="text-xs text-gray-500">{m.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeMemberMutation.mutate({ groupId: g._id, userId: m._id })}
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-4 text-sm text-gray-400 italic">No members yet — click &quot;+ Member&quot; to add.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
