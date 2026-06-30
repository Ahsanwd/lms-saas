'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import api from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth.store';
import { cn, avatarColor, getInitials, formatBytes } from '@/lib/utils';

interface ChatFile {
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

interface ChatMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string | null;
  file?: ChatFile | null;
  editedAt: string | null;
  createdAt: string;
}

interface Conversation {
  _id: string;
  studentName: string;
  instructorName: string;
  courseName: string;
  status: 'active' | 'closed';
  studentId: string;
  instructorId: string;
}

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();

  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [text, setText]                 = useState('');
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editText, setEditText]         = useState('');
  const [typingName, setTypingName]     = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchOpen, setSearchOpen]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [notification, setNotification] = useState<{ senderName: string; preview: string } | null>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch conversation metadata
  const { data: convData } = useQuery({
    queryKey: ['chat-conv', conversationId],
    queryFn: async () => {
      const res = await api.get(`/chat/${conversationId}`);
      return res.data.data.conversation as Conversation;
    },
  });
  const conv = convData;

  // Fetch initial messages (REST)
  const { isLoading } = useQuery({
    queryKey: ['chat-messages', conversationId],
    queryFn: async () => {
      const res = await api.get(`/chat/${conversationId}/messages`, { params: { limit: 100 } });
      const msgs = res.data.data.messages as ChatMessage[];
      setMessages(msgs);
      // Mark as read — invalidate sidebar unread count
      qc.invalidateQueries({ queryKey: ['chat-unread'] });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      return msgs;
    },
  });

  // Socket.io — join room and listen for real-time events
  useEffect(() => {
    const socket = connectSocket();

    socket.emit('join_conversation', conversationId);

    socket.on('new_message', ({ message }: { conversationId: string; message: ChatMessage }) => {
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev;
        return [...prev, message];
      });
      qc.invalidateQueries({ queryKey: ['chat-unread'] });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    });

    socket.on('message_deleted', ({ messageId }: { conversationId: string; messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
    });

    socket.on('typing', ({ senderName, isTyping }: { conversationId: string; userId: string; senderName: string; isTyping: boolean }) => {
      setTypingName(isTyping ? senderName : null);
    });

    socket.on('chat_notification', ({ conversationId: cid, senderName, preview }: { conversationId: string; senderName: string; preview: string }) => {
      // Only show banner when notification is for a different conversation
      if (cid !== conversationId) {
        setNotification({ senderName, preview });
        setTimeout(() => setNotification(null), 5000);
      }
      qc.invalidateQueries({ queryKey: ['chat-unread'] });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    });

    return () => {
      socket.emit('leave_conversation', conversationId);
      socket.off('new_message');
      socket.off('message_deleted');
      socket.off('typing');
      socket.off('chat_notification');
      disconnectSocket();
    };
  }, [conversationId, qc]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Search — debounced 400 ms
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: searchData } = useQuery({
    queryKey: ['chat-search', conversationId, debouncedSearch],
    queryFn: async () => {
      const res = await api.get(`/chat/${conversationId}/messages/search`, { params: { q: debouncedSearch } });
      return res.data.data.messages as ChatMessage[];
    },
    enabled: debouncedSearch.length >= 2,
  });

  // Send typing indicator
  const emitTyping = useCallback((isTyping: boolean) => {
    const socket = connectSocket();
    socket.emit('typing', { conversationId, isTyping });
  }, [conversationId]);

  const handleTextChange = (val: string) => {
    setText(val);
    emitTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 2000);
  };

  // Send message
  const sendMutation = useMutation({
    mutationFn: async ({ msg, file }: { msg: string; file: File | null }) => {
      if (file) {
        const fd = new FormData();
        if (msg) fd.append('text', msg);
        fd.append('file', file);
        const res = await api.post(`/chat/${conversationId}/messages`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data.message as ChatMessage;
      }
      const res = await api.post(`/chat/${conversationId}/messages`, { text: msg });
      return res.data.data.message as ChatMessage;
    },
    onSuccess: (msg) => {
      setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
      setSelectedFile(null);
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if ((!trimmed && !selectedFile) || sendMutation.isPending) return;
    setText('');
    emitTyping(false);
    sendMutation.mutate({ msg: trimmed, file: selectedFile });
  };

  // Edit message
  const editMutation = useMutation({
    mutationFn: async ({ id, newText }: { id: string; newText: string }) => {
      const res = await api.patch(`/chat/${conversationId}/messages/${id}`, { text: newText });
      return res.data.data.message as ChatMessage;
    },
    onSuccess: (updated) => {
      setMessages((prev) => prev.map((m) => (m._id === updated._id ? updated : m)));
      setEditingId(null);
    },
  });

  // Delete message
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/chat/${conversationId}/messages/${id}`);
      return id;
    },
    onSuccess: (id) => {
      setMessages((prev) => prev.filter((m) => m._id !== id));
    },
  });

  const isClosed = conv?.status === 'closed';

  function getTitle() {
    if (!conv) return '...';
    if (user?._id === conv.studentId)    return conv.instructorName;
    if (user?._id === conv.instructorId) return conv.studentName;
    return `${conv.studentName} ↔ ${conv.instructorName}`;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Notification banner (message in another conversation) */}
      {notification && (
        <div className="bg-primary-600 text-white px-4 py-2 flex items-center justify-between text-sm">
          <span><span className="font-semibold">{notification.senderName}</span>: {notification.preview}</span>
          <button onClick={() => setNotification(null)} className="ml-4 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-6 py-3.5">
          <button onClick={() => router.push('/chat')} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {conv && (
            <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-xs', avatarColor(getTitle()))}>
              {getInitials(getTitle())}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate leading-tight">{getTitle()}</p>
            <p className="text-xs text-primary-600 truncate">{conv?.courseName}</p>
          </div>
          {isClosed && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-medium flex-shrink-0">Closed</span>
          )}
          {/* Search toggle */}
          <button
            onClick={() => { setSearchOpen((v) => !v); setSearchQuery(''); }}
            className={cn('p-2 rounded-lg transition-colors flex-shrink-0', searchOpen ? 'bg-primary-100 text-primary-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50')}
            title="Search messages"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="px-6 pb-3">
            <div className="relative">
              <svg className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                className="w-full border border-gray-200 bg-gray-50 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-colors"
              />
            </div>
            {debouncedSearch.length >= 2 && (
              <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg divide-y divide-gray-100">
                {!searchData?.length && (
                  <p className="px-3 py-3 text-sm text-gray-400">No results for &ldquo;{debouncedSearch}&rdquo;</p>
                )}
                {searchData?.map((m) => (
                  <div key={m._id} className="px-3 py-2.5 hover:bg-gray-50 cursor-default">
                    <p className="text-xs text-gray-500 mb-0.5">{m.senderName} · {new Date(m.createdAt).toLocaleDateString()}</p>
                    <p className="text-sm text-gray-800 line-clamp-2">{m.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-gray-50">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                <div className="h-10 w-48 bg-gray-200 rounded-2xl animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">No messages yet</p>
            <p className="text-xs text-gray-400 mt-0.5">Say hello to start the conversation</p>
          </div>
        )}

        {messages.map((msg) => {
          const isOwn = msg.senderId === user?._id;
          const isEditing = editingId === msg._id;
          return (
            <div key={msg._id} className={cn('flex gap-2', isOwn ? 'justify-end' : 'justify-start')}>
              {!isOwn && (
                <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 self-end font-semibold text-xs', avatarColor(msg.senderName))}>
                  {getInitials(msg.senderName)}
                </div>
              )}
              <div className={cn('max-w-[70%] group', isOwn ? 'items-end' : 'items-start')}>
                {!isOwn && (
                  <p className="text-[10px] text-gray-500 mb-1 px-1">{msg.senderName}</p>
                )}
                {isEditing ? (
                  <div className="flex gap-2 items-center">
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') editMutation.mutate({ id: msg._id, newText: editText });
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="text-sm border border-primary-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button onClick={() => editMutation.mutate({ id: msg._id, newText: editText })} className="text-xs text-primary-600 font-medium">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">Cancel</button>
                  </div>
                ) : (
                  <div className={cn('rounded-2xl text-sm overflow-hidden shadow-sm', isOwn ? 'bg-primary-600 text-white rounded-br-sm' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm')}>
                    {/* File attachment */}
                    {msg.file?.url && (
                      msg.file.mimeType?.startsWith('image/') ? (
                        <a href={msg.file.url} target="_blank" rel="noopener noreferrer">
                          <img src={msg.file.url} alt={msg.file.name ?? 'attachment'}
                            className="max-w-[240px] max-h-[200px] object-cover block" />
                        </a>
                      ) : (
                        <a href={msg.file.url} target="_blank" rel="noopener noreferrer"
                          className={cn('flex items-center gap-2.5 px-4 py-3 hover:opacity-80 transition-opacity', isOwn ? 'text-white' : 'text-primary-700')}>
                          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', isOwn ? 'bg-white/15' : 'bg-primary-50')}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-medium truncate max-w-[160px]">{msg.file.name}</span>
                            {!!msg.file.sizeBytes && (
                              <span className={cn('block text-[10px]', isOwn ? 'text-primary-100' : 'text-gray-400')}>{formatBytes(msg.file.sizeBytes)}</span>
                            )}
                          </span>
                        </a>
                      )
                    )}
                    {msg.text && (
                      <p className="px-4 py-2.5 whitespace-pre-wrap break-words">{msg.text}</p>
                    )}
                    <div className={cn('flex items-center gap-1 px-4 pb-2', isOwn ? 'justify-end' : 'justify-start')}>
                      <span className={cn('text-[10px]', isOwn ? 'text-primary-200' : 'text-gray-400')}>
                        {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                        {msg.editedAt && ' · edited'}
                      </span>
                    </div>
                  </div>
                )}
                {/* Actions on own messages */}
                {isOwn && !isEditing && !isClosed && (
                  <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                    <button
                      onClick={() => { setEditingId(msg._id); setEditText(msg.text ?? ''); }}
                      className="text-[10px] text-gray-400 hover:text-gray-600"
                    >Edit</button>
                    <button
                      onClick={() => deleteMutation.mutate(msg._id)}
                      className="text-[10px] text-red-400 hover:text-red-600"
                    >Delete</button>
                  </div>
                )}
                {/* Admin delete on any message */}
                {!isOwn && user?.role === 'tenant_admin' && !isEditing && (
                  <div className="flex mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => deleteMutation.mutate(msg._id)}
                      className="text-[10px] text-red-400 hover:text-red-600"
                    >Delete</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {typingName && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
            <span>{typingName} is typing…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!isClosed ? (
        <div className="px-6 py-4 border-t border-gray-200 bg-white space-y-2">
          {/* Selected file preview */}
          {selectedFile && (
            <div className="flex items-center gap-2.5 bg-primary-50/60 border border-primary-100 rounded-xl px-3 py-2 text-sm">
              <span className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </span>
              <span className="truncate flex-1 text-gray-700">{selectedFile.name}</span>
              <button onClick={() => setSelectedFile(null)} className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0 font-medium transition-colors">Remove</button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            {/* Hidden file input */}
            <input ref={fileRef} type="file" className="hidden"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
            {/* Paperclip button */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-11 w-11 flex-shrink-0 border border-gray-200 text-gray-400 rounded-xl flex items-center justify-center hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50/50 transition-colors"
              title="Attach file"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <textarea
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 resize-none border border-gray-200 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-colors"
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={(!text.trim() && !selectedFile) || sendMutation.isPending}
              className="h-11 w-11 flex-shrink-0 bg-primary-600 text-white rounded-xl flex items-center justify-center hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-center text-sm text-gray-500">
          This conversation has been closed.
        </div>
      )}
    </div>
  );
}
