'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth.store';
import { cn, avatarColor, getInitials } from '@/lib/utils';

interface CourseOption { _id: string; title: string }

interface Conversation {
  _id: string;
  courseId: string;
  studentId: string;
  instructorId: string;
  studentName: string;
  instructorName: string;
  courseName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  studentUnread: number;
  instructorUnread: number;
  status: 'active' | 'closed';
  createdAt: string;
}

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="min-w-[20px] h-5 bg-primary-600 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function ChatPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const router = useRouter();
  const isAdmin = user?.role === 'tenant_admin';
  const isStudent = user?.role === 'student';
  const [courseFilter, setCourseFilter] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatError, setNewChatError] = useState('');

  // Refresh list when a new chat message arrives for this user
  useEffect(() => {
    const socket = connectSocket();
    socket.on('chat_notification', () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      qc.invalidateQueries({ queryKey: ['chat-unread'] });
    });
    return () => {
      socket.off('chat_notification');
      disconnectSocket();
    };
  }, [qc]);

  // Admins moderate conversations across every course — let them narrow the
  // list down to a single course instead of scrolling through everything.
  const { data: courseData } = useQuery({
    queryKey: ['chat-course-options'],
    queryFn: async () => {
      const res = await api.get('/courses', { params: { limit: 100 } });
      return res.data.data.courses as CourseOption[];
    },
    enabled: isAdmin,
  });
  const courseOptions = courseData ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['chat-conversations', courseFilter],
    queryFn: async () => {
      const res = await api.get('/chat', {
        params: { limit: 100, ...(courseFilter && { courseId: courseFilter }) },
      });
      return res.data.data as { conversations: Conversation[]; pagination?: { total: number } };
    },
  });

  const conversations = data?.conversations ?? [];

  // Students can only see "Chat with Instructor" inside a specific course
  // page today — let them start a new conversation right from this list too,
  // picking from courses they're enrolled in that don't already have one.
  const { data: enrollmentsData } = useQuery({
    queryKey: ['chat-my-enrollments'],
    queryFn: async () => {
      const res = await api.get('/courses/my-enrollments');
      return res.data.data.enrollments as Array<{ courseId: { _id: string; title: string } | null }>;
    },
    enabled: isStudent,
  });
  const enrolledCourseIds = new Set(conversations.map((c) => c.courseId));
  const availableCourses = (enrollmentsData ?? [])
    .map((e) => e.courseId)
    .filter((c): c is { _id: string; title: string } => !!c && !enrolledCourseIds.has(c._id));

  const startChatMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const res = await api.post('/chat', { courseId });
      return res.data.data as { conversation: { _id: string }; created: boolean };
    },
    onSuccess: ({ conversation }) => {
      setNewChatOpen(false);
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      router.push(`/chat/${conversation._id}`);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setNewChatError(err.response?.data?.message ?? 'Could not start conversation');
      setTimeout(() => setNewChatError(''), 4000);
    },
  });

  // Based on which side of the conversation this user is actually on, not
  // their account role — a tenant_admin assigned as a course's instructor is
  // still the instructor-side participant for that conversation.
  function getUnread(conv: Conversation) {
    if (user?._id === conv.studentId)    return conv.studentUnread;
    if (user?._id === conv.instructorId) return conv.instructorUnread;
    return 0;
  }

  function getOtherName(conv: Conversation) {
    if (user?._id === conv.studentId)    return conv.instructorName;
    if (user?._id === conv.instructorId) return conv.studentName;
    return `${conv.studentName} ↔ ${conv.instructorName}`;
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </span>
              Chat
            </h1>
            <p className="text-sm text-gray-500 mt-1 ml-[46px]">Course-scoped conversations between students and instructors</p>
          </div>

          {isStudent && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setNewChatOpen((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold bg-primary-600 text-white px-3.5 py-2 rounded-xl hover:bg-primary-700 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New conversation
              </button>

              {newChatOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNewChatOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-gray-100 shadow-lg z-20 py-1.5 max-h-72 overflow-y-auto">
                    {newChatError && (
                      <p className="px-4 py-2 text-xs text-red-500 border-b border-gray-50">{newChatError}</p>
                    )}
                    {availableCourses.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400">
                        {(enrollmentsData?.length ?? 0) === 0
                          ? 'You\'re not enrolled in any courses yet.'
                          : 'You already have a conversation for every enrolled course.'}
                      </p>
                    ) : (
                      availableCourses.map((c) => (
                        <button
                          key={c._id}
                          onClick={() => startChatMutation.mutate(c._id)}
                          disabled={startChatMutation.isPending}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors disabled:opacity-50 truncate"
                        >
                          {c.title}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {isAdmin && courseOptions.length > 0 && (
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 flex-shrink-0"
            >
              <option value="">All courses</option>
              {courseOptions.map((c) => (
                <option key={c._id} value={c._id}>{c.title}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="px-6 pb-10">
        {isLoading && (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && conversations.length === 0 && (
          <div className="text-center py-20 px-6 bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary-50 flex items-center justify-center">
              <svg className="w-7 h-7 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="font-semibold text-gray-700">
              {courseFilter ? 'No conversations for this course' : 'No conversations yet'}
            </p>
            <p className="text-sm text-gray-400 mt-1.5 max-w-xs mx-auto">
              {courseFilter
                ? 'Try a different course, or clear the filter to see everything.'
                : isStudent
                ? 'Click "New conversation" above to message an instructor about one of your courses.'
                : 'Conversations will appear here when students reach out.'}
            </p>
            {courseFilter && (
              <button
                onClick={() => setCourseFilter('')}
                className="mt-4 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {!isLoading && conversations.length > 0 && (
          <div className="space-y-2.5">
            {conversations.map((conv) => {
              const unread = getUnread(conv);
              const otherName = getOtherName(conv);
              return (
                <Link
                  key={conv._id}
                  href={`/chat/${conv._id}`}
                  className={cn(
                    'flex items-center gap-4 bg-white rounded-2xl border p-4 hover:shadow-md hover:-translate-y-0.5 transition-all',
                    unread > 0 ? 'border-primary-200 shadow-sm shadow-primary-50' : 'border-gray-100'
                  )}
                >
                  {/* Avatar */}
                  <div className={cn('w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-sm', avatarColor(otherName))}>
                    {getInitials(otherName)}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-sm font-semibold truncate', unread > 0 ? 'text-gray-900' : 'text-gray-700')}>
                        {otherName}
                      </span>
                      {conv.lastMessageAt && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-primary-600 font-medium truncate mt-0.5">{conv.courseName}</p>
                    <p className={cn('text-sm truncate mt-0.5', unread > 0 ? 'text-gray-800 font-medium' : 'text-gray-500')}>
                      {conv.lastMessage ?? 'No messages yet'}
                    </p>
                  </div>

                  {/* Unread + status */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <UnreadBadge count={unread} />
                    {conv.status === 'closed' && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">Closed</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
