'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { AxiosError } from 'axios';
import { cn } from '@/lib/utils';
import type { Course, Section, Lesson, LessonType, CourseLevel, Category } from '@/types';
import { loadStripe } from '@stripe/stripe-js';
import { toast } from 'sonner';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripePromise } from '@/lib/stripe';
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  draft: 'default', published: 'success', archived: 'danger',
};

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};

function fmtDuration(s: number) {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Cloudflare Stream Uploader ───────────────────────────────────────────────

interface CfStreamUploaderProps {
  courseId: string;
  lessonId: string;
  existingUid: string | null;
  onConfirmed: (videoUid: string) => void;
}

function CfStreamUploader({ courseId, lessonId, existingUid, onConfirmed }: CfStreamUploaderProps) {
  const [file,       setFile]       = useState<File | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [status,     setStatus]     = useState<'idle' | 'uploading' | 'processing' | 'ready' | 'error'>('idle');
  const [videoUid,   setVideoUid]   = useState(existingUid ?? '');
  const [errorMsg,   setErrorMsg]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleUpload(selectedFile: File) {
    if (!lessonId) { setErrorMsg('Save the lesson first before uploading to Cloudflare Stream'); return; }
    setFile(selectedFile);
    setStatus('uploading');
    setProgress(0);
    setErrorMsg('');

    try {
      // 1. Get direct upload URL from our API
      const urlRes = await api.post(`/courses/${courseId}/lessons/${lessonId}/cloudflare-stream/upload-url`);
      const { uploadUrl, videoUid: uid } = urlRes.data.data;

      // 2. Upload directly to Cloudflare Stream via TUS PATCH (no server memory used)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PATCH', uploadUrl);
        xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
        xhr.setRequestHeader('Upload-Offset', '0');
        xhr.setRequestHeader('Tus-Resumable', '1.0.0');
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)); };
        xhr.onload  = () => (xhr.status === 204 || xhr.status === 200) ? resolve() : reject(new Error(`Upload error ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(selectedFile);
      });

      // 3. Save video UID to lesson
      await api.post(`/courses/${courseId}/lessons/${lessonId}/cloudflare-stream/confirm`, { videoUid: uid });
      setVideoUid(uid);
      onConfirmed(uid);

      // 4. Poll for processing status
      setStatus('processing');
      pollRef.current = setInterval(async () => {
        try {
          const st = await api.get(`/courses/${courseId}/lessons/${lessonId}/cloudflare-stream/status?videoUid=${uid}`);
          if (st.data.data.readyToStream) {
            setStatus('ready');
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch { /* keep polling */ }
      }, 5000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.response?.data?.message || err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />

      {status === 'idle' && (
        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-full rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/30 hover:border-orange-400 hover:bg-orange-50 py-8 text-center transition-all">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center mb-1">
              <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">Click to upload to Cloudflare Stream</p>
            <p className="text-xs text-gray-400">Video uploads directly to Cloudflare — no size limit, HLS adaptive quality</p>
          </div>
        </button>
      )}

      {(status === 'uploading' || status === 'processing') && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Spinner size="sm" />
            <p className="text-sm font-semibold text-orange-800">
              {status === 'uploading' ? `Uploading to Cloudflare… ${progress}%` : 'Cloudflare is processing your video…'}
            </p>
          </div>
          {status === 'uploading' && (
            <div className="w-full bg-orange-100 rounded-full h-2">
              <div className="bg-orange-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
          {status === 'processing' && (
            <p className="text-xs text-orange-600">This usually takes 1–5 minutes. You can save the lesson now — it will be ready when students open it.</p>
          )}
        </div>
      )}

      {status === 'ready' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">Video ready on Cloudflare Stream</p>
            <p className="text-xs text-green-600 font-mono">{videoUid}</p>
          </div>
          <button type="button" onClick={() => { setStatus('idle'); setFile(null); setVideoUid(''); }}
            className="text-xs text-green-600 hover:text-green-800 underline">Replace</button>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-red-700">Upload failed</p>
          <p className="text-xs text-red-600">{errorMsg}</p>
          <button type="button" onClick={() => { setStatus('idle'); setFile(null); setErrorMsg(''); }}
            className="text-xs text-red-600 hover:text-red-800 underline">Try again</button>
        </div>
      )}

      {existingUid && status === 'idle' && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
          Video uploaded (UID: {existingUid}) — click above to replace
        </p>
      )}
    </div>
  );
}

// ─── Lesson Modal ─────────────────────────────────────────────────────────────

interface LessonModalProps {
  courseId: string;
  sectionId: string;
  lesson?: Lesson | null;
  onClose: () => void;
  onSaved: () => void;
}

type VideoSource = 'youtube' | 'vimeo' | 'cloudflare' | 'upload' | 'bunny' | 'external' | 'embed';
type AudioSource = 'upload' | 'external' | 'soundcloud' | 'spotify' | 'embed';
type FileSource  = 'upload' | 'external' | 'gdrive' | 'dropbox' | 'onedrive' | 'embed';

function inferVideoSource(lesson: LessonModalProps['lesson']): VideoSource {
  if (!lesson?.video) return 'youtube';
  const p = lesson.video.provider;
  if (p === 'vimeo')      return 'vimeo';
  if (p === 'cloudflare') return 'cloudflare';
  return 'youtube';
}

function inferAudioSource(lesson: LessonModalProps['lesson']): AudioSource {
  if (!lesson?.audio) return 'upload';
  const p = lesson.audio.provider;
  if (p === 'external') return 'external';
  if (p === 'soundcloud') return 'soundcloud';
  if (p === 'spotify') return 'spotify';
  if (p === 'embed') return 'embed';
  return 'upload';
}

function inferFileSource(lesson: LessonModalProps['lesson']): FileSource {
  if (!lesson?.file) return 'upload';
  const p = lesson.file.provider;
  if (p === 'external') return 'external';
  if (p === 'gdrive')   return 'gdrive';
  if (p === 'dropbox')  return 'dropbox';
  if (p === 'onedrive') return 'onedrive';
  if (p === 'embed')    return 'embed';
  return 'upload';
}

function LessonModal({ courseId, sectionId, lesson, onClose, onSaved }: LessonModalProps) {
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [type, setType] = useState<LessonType>(lesson?.type ?? 'text');
  const [content, setContent] = useState(lesson?.content ?? '');
  const [isPreview, setIsPreview] = useState(lesson?.isPreview ?? false);
  const [isPublished, setIsPublished] = useState(lesson?.isPublished ?? false);
  const [discussionEnabled, setDiscussionEnabled] = useState(lesson?.discussionEnabled ?? false);
  const [dripDays, setDripDays] = useState<number>(lesson?.dripDays ?? 0);
  const [dripMode, setDripMode] = useState<'days' | 'date'>((lesson as any)?.dripDate ? 'date' : 'days');
  const [dripDate, setDripDate] = useState<string>(
    (lesson as any)?.dripDate ? new Date((lesson as any).dripDate).toISOString().slice(0, 10) : ''
  );

  // Quiz lesson config
  const [quizTitle, setQuizTitle] = useState('');
  const [quizPassingScore, setQuizPassingScore] = useState(70);
  const [quizMaxAttempts, setQuizMaxAttempts] = useState(3);
  const [quizTimerEnabled, setQuizTimerEnabled] = useState(false);
  const [quizTimerMinutes, setQuizTimerMinutes] = useState(10);
  const [quizShowCorrectAnswers, setQuizShowCorrectAnswers] = useState(true);
  const [quizShuffleQuestions, setQuizShuffleQuestions] = useState(false);

  // Live class
  const [liveUrl, setLiveUrl] = useState(lesson?.liveClass?.meetingUrl ?? '');
  const [livePlatform, setLivePlatform] = useState<'zoom' | 'meet' | 'teams' | 'youtube_live' | 'custom'>(lesson?.liveClass?.platform ?? 'zoom');
  const [liveScheduledAt, setLiveScheduledAt] = useState(
    lesson?.liveClass?.scheduledAt ? new Date(lesson.liveClass.scheduledAt).toISOString().slice(0, 16) : ''
  );
  const [liveDuration, setLiveDuration] = useState<number>(lesson?.liveClass?.durationMinutes ?? 60);
  const [liveInstructions, setLiveInstructions] = useState(lesson?.liveClass?.instructions ?? '');
  const [liveRecordingUrl, setLiveRecordingUrl] = useState((lesson?.liveClass as any)?.recordingUrl ?? '');
  const [zoomMeetingId, setZoomMeetingId] = useState<string | null>(lesson?.liveClass?.zoomMeetingId ?? null);

  // File source
  const [fileSource, setFileSource] = useState<FileSource>(inferFileSource(lesson));
  const [fileUrl, setFileUrl] = useState(lesson?.file?.url ?? '');
  const [fileEmbedCode, setFileEmbedCode] = useState(lesson?.file?.embedCode ?? '');

  // Audio source
  const [audioSource, setAudioSource] = useState<AudioSource>(inferAudioSource(lesson));
  const [audioUrl, setAudioUrl] = useState(lesson?.audio?.url ?? '');
  const [audioEmbedCode, setAudioEmbedCode] = useState(lesson?.audio?.embedCode ?? '');
  const [audioDuration, setAudioDuration] = useState(String(lesson?.audio?.durationSeconds ?? ''));

  // Video source
  const [videoSource, setVideoSource] = useState<VideoSource>(inferVideoSource(lesson));
  const [videoUrl, setVideoUrl] = useState(lesson?.video?.url ?? '');
  const [videoEmbedCode, setVideoEmbedCode] = useState(lesson?.video?.embedCode ?? '');
  const [videoDuration, setVideoDuration] = useState(String(lesson?.video?.durationSeconds ?? ''));
  // Video settings
  const [watermarkEnabled, setWatermarkEnabled] = useState(lesson?.video?.settings?.watermarkEnabled ?? false);
  const [watermarkText, setWatermarkText] = useState(lesson?.video?.settings?.watermarkText ?? '');
  const [disableDownload, setDisableDownload] = useState(lesson?.video?.settings?.disableDownload ?? false);
  const [allowSpeedControl, setAllowSpeedControl] = useState(lesson?.video?.settings?.allowSpeedControl ?? true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!lesson;

  const { data: cfStreamSettings } = useQuery<{ connected: boolean; accountId: string | null }>({
    queryKey: ['cf-stream-settings'],
    queryFn: () => api.get('/tenant/cloudflare-stream').then(r => r.data.data),
    staleTime: 5 * 60_000,
    enabled: type === 'video',
  });
  const cfEnabled = cfStreamSettings?.connected ?? false;

  const { data: zoomStatus } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ['zoom-status'],
    queryFn: () => api.get('/zoom/status').then(r => r.data.data),
    enabled: type === 'live' && livePlatform === 'zoom',
    staleTime: 60_000,
  });

  const createZoomMeetingMutation = useMutation({
    mutationFn: () => api.post(`/zoom/lessons/${lesson!._id}/meeting`),
    onSuccess: (res) => {
      const { joinUrl, meetingId } = res.data.data;
      setLiveUrl(joinUrl);
      setZoomMeetingId(meetingId);
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to create Zoom meeting'),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: object) =>
      isEdit
        ? api.patch(`/courses/${courseId}/sections/${sectionId}/lessons/${lesson!._id}`, payload)
        : api.post(`/courses/${courseId}/sections/${sectionId}/lessons`, payload),
    onSuccess: async (res) => {
      const savedLesson = res.data.data.lesson;
      onSaved();

      // Upload file for upload-source video, audio, or file types
      if (selectedFile && (type === 'audio' || type === 'file' || (type === 'video' && videoSource === 'upload'))) {
        setUploading(true);
        const endpoint = type === 'video' ? 'video' : type === 'audio' ? 'audio' : 'file';
        try {
          const form = new FormData();
          form.append(endpoint, selectedFile);
          await api.post(`/courses/${courseId}/lessons/${savedLesson._id}/${endpoint}`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          onSaved();
        } catch (err) {
          const axErr = err as AxiosError<{ message: string }>;
          setError(axErr.response?.data?.message ?? 'Upload failed — lesson saved but file not uploaded');
          setUploading(false);
          return;
        }
        setUploading(false);
      }

      // Create / update embedded quiz for quiz-type lessons
      if (type === 'quiz') {
        try {
          await api.post(`/courses/${courseId}/lessons/${savedLesson._id}/quiz`, {
            title:              quizTitle || `${title.trim()} — Quiz`,
            passingScore:       quizPassingScore,
            maxAttempts:        quizMaxAttempts,
            timerEnabled:       quizTimerEnabled,
            timerMinutes:       quizTimerMinutes,
            showCorrectAnswers: quizShowCorrectAnswers,
            shuffleQuestions:   quizShuffleQuestions,
          });
          onSaved();
        } catch { /* non-fatal — quiz settings can be edited later */ }
      }

      toast.success(isEdit ? 'Lesson updated successfully' : 'Lesson created successfully');
      onClose();
    },
    onError: (err: AxiosError<{ message: string }>) => {
      const msg = err.response?.data?.message ?? 'Failed to save lesson';
      setError(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setError('');
    const payload: Record<string, unknown> = {
      title: title.trim(), type,
      content: content || undefined,
      isPreview, isPublished, discussionEnabled,
      dripDays: dripMode === 'days' ? (dripDays || 0) : 0,
      dripDate: dripMode === 'date' && dripDate ? new Date(dripDate).toISOString() : null,
    };
    if (type === 'live') {
      payload.liveClass = {
        meetingUrl: liveUrl || null, platform: livePlatform,
        scheduledAt: liveScheduledAt || null, durationMinutes: liveDuration,
        instructions: liveInstructions || null,
        recordingUrl: liveRecordingUrl || null,
      };
    }
    if (type === 'video') {
      payload.video = {
        provider: videoSource,
        url: videoUrl || null,
        durationSeconds: videoDuration ? Number(videoDuration) : undefined,
        settings: { watermarkEnabled, watermarkText: watermarkText || null, disableDownload, allowSpeedControl },
      };
    }
    if (type === 'audio') {
      const audioProviderMap: Record<AudioSource, string> = {
        upload: 'local', external: 'external',
        soundcloud: 'soundcloud', spotify: 'spotify', embed: 'embed',
      };
      payload.audio = {
        provider: audioProviderMap[audioSource],
        url: audioSource !== 'upload' && audioSource !== 'embed' ? (audioUrl || null) : undefined,
        embedCode: audioSource === 'embed' ? (audioEmbedCode || null) : undefined,
        durationSeconds: audioDuration ? Number(audioDuration) : undefined,
      };
    }
    if (type === 'file') {
      const fileProviderMap: Record<FileSource, string> = {
        upload: 'local', external: 'external',
        gdrive: 'gdrive', dropbox: 'dropbox', onedrive: 'onedrive', embed: 'embed',
      };
      payload.file = {
        provider: fileProviderMap[fileSource],
        url: fileSource !== 'upload' && fileSource !== 'embed' ? (fileUrl || null) : undefined,
        embedCode: fileSource === 'embed' ? (fileEmbedCode || null) : undefined,
      };
    }
    saveMutation.mutate(payload);
  };

  const isBusy = saveMutation.isPending || uploading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-gray-900 text-lg">{isEdit ? 'Edit Lesson' : 'Add Lesson'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">

          {/* ── Body ── */}
          <div className="p-6 space-y-6">

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Lesson Title</label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Introduction to React Hooks"
                className="w-full px-4 py-3 text-sm font-medium border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 placeholder-gray-300 transition-shadow"
              />
            </div>

            {/* Lesson Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Lesson Type</label>
              <div className="grid grid-cols-6 gap-2">
                {([
                  { t: 'text',  bg: 'bg-indigo-50', border: 'border-indigo-200', activeBg: 'bg-indigo-500', icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  ), label: 'Text' },
                  { t: 'video', bg: 'bg-blue-50',   border: 'border-blue-200',   activeBg: 'bg-blue-500',   icon: (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  ), label: 'Video' },
                  { t: 'audio', bg: 'bg-purple-50', border: 'border-purple-200', activeBg: 'bg-purple-500', icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg>
                  ), label: 'Audio' },
                  { t: 'file',  bg: 'bg-orange-50', border: 'border-orange-200', activeBg: 'bg-orange-500', icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                  ), label: 'File/PDF' },
                  { t: 'quiz',  bg: 'bg-rose-50',   border: 'border-rose-200',   activeBg: 'bg-rose-500',   icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                  ), label: 'Quiz' },
                  { t: 'live',  bg: 'bg-green-50',  border: 'border-green-200',  activeBg: 'bg-green-500',  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                  ), label: 'Live' },
                ] as { t: LessonType; bg: string; border: string; activeBg: string; icon: React.ReactNode; label: string }[]).map(({ t, bg, border, activeBg, icon, label }) => {
                  const isActive = type === t;
                  return (
                    <button key={t} type="button" onClick={() => { setType(t); setSelectedFile(null); }}
                      className={cn('flex flex-col items-center gap-2 py-3.5 rounded-2xl border-2 font-medium transition-all',
                        isActive ? `${activeBg} border-transparent text-white shadow-md scale-[1.02]` : `${bg} ${border} text-gray-500 hover:scale-[1.01] hover:shadow-sm`)}>
                      <span className={isActive ? 'text-white' : 'text-gray-400'}>{icon}</span>
                      <span className="text-[11px] font-semibold">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Text content ── */}
            {type === 'text' && (
              <div className="rounded-2xl border border-indigo-100 overflow-hidden shadow-sm">
                {/* Toolbar */}
                <div className="flex items-center gap-1 px-3 py-2 bg-indigo-50 border-b border-indigo-100">
                  {[
                    { label: 'B',  title: 'Bold',        style: 'font-bold text-sm' },
                    { label: 'I',  title: 'Italic',       style: 'italic text-sm' },
                    { label: 'U',  title: 'Underline',    style: 'underline text-sm' },
                  ].map(({ label, title, style }) => (
                    <button key={label} type="button" title={title}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const ta = document.getElementById('lesson-text-editor') as HTMLTextAreaElement;
                        if (!ta) return;
                        const { selectionStart: s, selectionEnd: e2, value: v } = ta;
                        const wrap: Record<string, string> = { B: '**', I: '_', U: '__' };
                        const m = wrap[label];
                        const newVal = v.slice(0, s) + m + v.slice(s, e2) + m + v.slice(e2);
                        setContent(newVal);
                        setTimeout(() => { ta.setSelectionRange(s + m.length, e2 + m.length); ta.focus(); }, 0);
                      }}
                      className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-indigo-600 hover:bg-indigo-100 transition-colors', style)}>
                      {label}
                    </button>
                  ))}
                  <div className="w-px h-4 bg-indigo-200 mx-1" />
                  {[
                    { label: 'H1', title: 'Heading 1', prefix: '# ' },
                    { label: 'H2', title: 'Heading 2', prefix: '## ' },
                    { label: '• ', title: 'Bullet list', prefix: '- ' },
                    { label: '1.', title: 'Numbered list', prefix: '1. ' },
                  ].map(({ label, title, prefix }) => (
                    <button key={label} type="button" title={title}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const ta = document.getElementById('lesson-text-editor') as HTMLTextAreaElement;
                        if (!ta) return;
                        const { selectionStart: s, value: v } = ta;
                        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
                        const newVal = v.slice(0, lineStart) + prefix + v.slice(lineStart);
                        setContent(newVal);
                        setTimeout(() => { ta.setSelectionRange(s + prefix.length, s + prefix.length); ta.focus(); }, 0);
                      }}
                      className="px-2 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors">
                      {label}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <span className="text-[10px] text-indigo-400 font-medium">Markdown supported</span>
                </div>

                {/* Editor */}
                <textarea
                  id="lesson-text-editor"
                  rows={10}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={"Start writing your lesson...\n\nUse **bold**, _italic_, # Heading, - bullet lists, etc."}
                  className="w-full px-5 py-4 text-sm text-gray-800 bg-white focus:outline-none resize-none leading-7 placeholder-gray-300"
                  style={{ fontFamily: 'Georgia, serif', fontSize: '14px' }}
                />

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-100">
                  <span className="text-[10px] text-gray-400">{content.length} characters · {content.split(/\s+/).filter(Boolean).length} words</span>
                  {content.length > 0 && (
                    <button type="button" onClick={() => setContent('')}
                      className="text-[10px] text-gray-400 hover:text-red-400 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Video source ── */}
            {type === 'video' && (
              <div className="space-y-4">
                {/* Source selector */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Video Source</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { s: 'youtube'   as VideoSource, label: 'YouTube' },
                      { s: 'vimeo'     as VideoSource, label: 'Vimeo'   },
                      ...(cfEnabled ? [{ s: 'cloudflare' as VideoSource, label: '☁ Cloudflare Stream' }] : []),
                    ]).map(({ s, label }) => (
                      <button key={s} type="button" onClick={() => setVideoSource(s)}
                        className={cn('px-4 py-1.5 rounded-full text-xs font-semibold border transition-all',
                          videoSource === s
                            ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-primary-300 hover:text-primary-600')}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cloudflare Stream upload zone */}
                {videoSource === 'cloudflare' && (
                  <CfStreamUploader
                    courseId={courseId}
                    lessonId={lesson?._id ?? ''}
                    existingUid={lesson?.video?.provider === 'cloudflare' ? lesson.video.url ?? null : null}
                    onConfirmed={(uid) => { setVideoUrl(uid); }}
                  />
                )}

                {/* URL input (YouTube / Vimeo) */}
                {videoSource !== 'cloudflare' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                      {videoSource === 'youtube' ? 'YouTube URL or Video ID' : 'Vimeo URL or Video ID'}
                    </label>
                    <div className="relative">
                      <input type="text" value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                        placeholder={
                          videoSource === 'youtube'
                            ? 'https://www.youtube.com/watch?v=...'
                            : 'https://vimeo.com/123456789'
                        }
                        className="w-full pl-4 pr-10 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                      </span>
                    </div>
                  </div>

                  {/* Unlisted guidance */}
                  {videoSource === 'youtube' && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-3">
                      <span className="text-amber-500 text-base flex-shrink-0 mt-0.5">⚠️</span>
                      <div className="text-xs text-amber-800 space-y-1">
                        <p className="font-semibold">Set your YouTube video to Unlisted</p>
                        <p className="text-amber-700">Go to YouTube Studio → your video → Visibility → <strong>Unlisted</strong>. This prevents the video from appearing in search or on your channel while still allowing it to be embedded here.</p>
                        <p className="text-amber-700">Do not use <strong>Private</strong> — private videos won't play for students.</p>
                      </div>
                    </div>
                  )}

                  {videoSource === 'vimeo' && (
                    <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex gap-3">
                      <span className="text-blue-500 text-base flex-shrink-0 mt-0.5">ℹ️</span>
                      <div className="text-xs text-blue-800 space-y-1">
                        <p className="font-semibold">Recommended Vimeo privacy settings</p>
                        <p className="text-blue-700">Set the video to <strong>Hide from Vimeo</strong> (unlisted). For best security, use <strong>Vimeo Pro</strong> and enable domain-level privacy to restrict playback to this site only.</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Duration <span className="font-normal text-gray-400">(seconds, optional)</span></label>
                    <input type="number" min={0} value={videoDuration} onChange={e => setVideoDuration(e.target.value)}
                      placeholder="e.g. 3600"
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
                  </div>
                </div>
                )} {/* end YouTube/Vimeo URL block */}

                {/* Protection — watermark only (download/speed controls don't apply to YouTube/Vimeo) */}
                <div className="rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Protection</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <div className="flex items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-white transition-colors"
                      onClick={() => setWatermarkEnabled(!watermarkEnabled)}>
                      <span className="text-lg flex-shrink-0">💧</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">Watermark overlay</p>
                        <p className="text-xs text-gray-400">Show your branding text over the video player</p>
                      </div>
                      <button type="button" role="switch" aria-checked={watermarkEnabled}
                        onClick={e => { e.stopPropagation(); setWatermarkEnabled(!watermarkEnabled); }}
                        className={cn('relative flex-shrink-0 rounded-full transition-colors duration-200',
                          watermarkEnabled ? 'bg-orange-500' : 'bg-gray-200')}
                        style={{ width: '40px', height: '22px' }}>
                        <span className="absolute rounded-full bg-white shadow-sm transition-transform duration-200"
                          style={{ width: '18px', height: '18px', top: '2px', left: '2px',
                            transform: watermarkEnabled ? 'translateX(18px)' : 'translateX(0)' }} />
                      </button>
                    </div>
                    {watermarkEnabled && (
                      <div className="px-4 py-3 bg-blue-50/50">
                        <input type="text" value={watermarkText} onChange={e => setWatermarkText(e.target.value)}
                          placeholder="e.g. © YourCompany or student@email.com"
                          className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                      </div>
                    )}
                    <div className="px-4 py-3">
                      <p className="text-xs text-gray-400">Speed control and download blocking are managed by the YouTube / Vimeo player directly.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Audio multi-source ── */}
            {type === 'audio' && (
              <div className="space-y-4">
                {/* Source selector */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Audio Source</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { s: 'upload' as AudioSource,     label: 'Upload',       icon: '⬆' },
                      { s: 'external' as AudioSource,   label: 'External URL', icon: '🔗' },
                      { s: 'soundcloud' as AudioSource, label: 'SoundCloud',   icon: '☁' },
                      { s: 'spotify' as AudioSource,    label: 'Spotify',      icon: '🎧' },
                      { s: 'embed' as AudioSource,      label: 'Embed Code',   icon: '‹›' },
                    ]).map(({ s, label, icon }) => (
                      <button key={s} type="button" onClick={() => { setAudioSource(s); setSelectedFile(null); }}
                        className={cn('flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all',
                          audioSource === s
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-purple-300 hover:text-purple-600')}>
                        <span>{icon}</span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Upload zone */}
                {audioSource === 'upload' && (
                  <div>
                    <input ref={fileInputRef} type="file" accept="audio/*" className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className={cn('w-full rounded-2xl border-2 border-dashed py-8 text-center transition-all',
                        selectedFile ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-gray-50 hover:border-purple-300 hover:bg-purple-50/30')}>
                      <div className="flex flex-col items-center gap-2">
                        {selectedFile ? (
                          <>
                            <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center mb-1">
                              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg>
                            </div>
                            <p className="text-sm font-semibold text-purple-700">{selectedFile.name}</p>
                            <p className="text-xs text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB · click to change</p>
                          </>
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-1">
                              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg>
                            </div>
                            <p className="text-sm font-semibold text-gray-600">Drop audio or click to browse</p>
                            <p className="text-xs text-gray-400">MP3, WAV, M4A, OGG, FLAC · up to 500 MB</p>
                          </>
                        )}
                      </div>
                    </button>
                    {isEdit && lesson?.audio?.url && !selectedFile && (
                      <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                        Audio uploaded — select to replace
                      </p>
                    )}
                  </div>
                )}

                {/* Embed Code */}
                {audioSource === 'embed' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Embed Code <span className="font-normal text-gray-400">(HTML)</span></label>
                    <textarea rows={4} value={audioEmbedCode} onChange={e => setAudioEmbedCode(e.target.value)}
                      placeholder={'<iframe src="..." ...></iframe>'}
                      className="w-full px-4 py-3 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono bg-gray-900 text-green-400 placeholder-gray-600" />
                    <p className="text-xs text-gray-400 mt-1.5">Paste embed code from any audio platform</p>
                  </div>
                )}

                {/* URL-based sources */}
                {(audioSource === 'external' || audioSource === 'soundcloud' || audioSource === 'spotify') && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                      {audioSource === 'soundcloud' ? 'SoundCloud Track URL'
                        : audioSource === 'spotify' ? 'Spotify Track / Episode URL'
                        : 'Direct Audio URL'}
                    </label>
                    <div className="relative">
                      <input type="text" value={audioUrl} onChange={e => setAudioUrl(e.target.value)}
                        placeholder={
                          audioSource === 'soundcloud' ? 'https://soundcloud.com/artist/track-name'
                          : audioSource === 'spotify' ? 'https://open.spotify.com/episode/...'
                          : 'https://example.com/audio.mp3'
                        }
                        className="w-full pl-4 pr-10 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300">
                        {audioSource === 'soundcloud' ? '☁' : audioSource === 'spotify' ? '🎧' : '🔗'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {audioSource === 'soundcloud' ? 'Paste the full SoundCloud track or playlist URL'
                        : audioSource === 'spotify' ? 'Paste Spotify track, episode, or podcast URL'
                        : 'Any public MP3, WAV, OGG, or M4A URL'}
                    </p>
                  </div>
                )}

                {/* Duration */}
                {audioSource !== 'upload' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Duration <span className="font-normal text-gray-400">(seconds, optional)</span></label>
                    <input type="number" min={0} value={audioDuration} onChange={e => setAudioDuration(e.target.value)}
                      placeholder="e.g. 1800 for 30 minutes"
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50" />
                  </div>
                )}
              </div>
            )}

            {/* ── File / PDF upload ── */}
            {type === 'file' && (
              <div className="space-y-4">
                {/* Upload zone — PDF and Word only */}
                <div>
                  <input ref={fileInputRef} type="file" className="hidden"
                    accept=".pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className={cn('w-full rounded-2xl border-2 border-dashed py-8 text-center transition-all',
                      selectedFile ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-gray-50 hover:border-orange-300 hover:bg-orange-50/30')}>
                    <div className="flex flex-col items-center gap-2">
                      {selectedFile ? (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center mb-1">
                            <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                          </div>
                          <p className="text-sm font-semibold text-orange-700">{selectedFile.name}</p>
                          <p className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(0)} KB · click to change</p>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-1">
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                          </div>
                          <p className="text-sm font-semibold text-gray-600">Click to upload PDF or Word document</p>
                          <p className="text-xs text-gray-400">Supported: PDF (.pdf) · Word (.doc, .docx) — Max 50 MB</p>
                        </>
                      )}
                    </div>
                  </button>
                  {isEdit && lesson?.file?.url && !selectedFile && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                      {lesson.file.name ?? 'File uploaded'} — click above to replace
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Live class fields ── */}
            {type === 'live' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Platform</label>
                  <select value={livePlatform} onChange={(e) => setLivePlatform(e.target.value as typeof livePlatform)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                    <option value="zoom">Zoom</option>
                    <option value="meet">Google Meet</option>
                    <option value="teams">MS Teams</option>
                    <option value="youtube_live">YouTube Live</option>
                    <option value="custom">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Duration (minutes)</label>
                  <input type="number" min={15} max={480} value={liveDuration}
                    onChange={(e) => setLiveDuration(Number(e.target.value))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
                </div>
              </div>

              {/* ── Google Meet helper ── */}
              {livePlatform === 'meet' && (
                <div className="rounded-xl border border-green-200 bg-green-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.507 14.307l-.009.075c-.007.04-.015.082-.024.126l-.004.018a4.493 4.493 0 01-4.398 3.524H6.5C4.015 18.05 2 16.035 2 13.55v-3.1C2 7.965 4.015 5.95 6.5 5.95h6.572a4.49 4.49 0 014.389 3.494l.005.02c.01.044.018.087.025.13l.01.073L22 12l-4.493 2.307z"/>
                    </svg>
                    <p className="text-xs font-semibold text-green-800">Google Meet</p>
                  </div>
                  <p className="text-xs text-green-700 leading-relaxed">
                    Create a new Google Meet session, then paste the link below.
                  </p>
                  <a
                    href="https://meet.google.com/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    Open Google Meet to create a link
                  </a>
                </div>
              )}

              {/* ── Zoom auto-create ── */}
              {livePlatform === 'zoom' && (
                <div className={cn('rounded-xl border p-3 space-y-2',
                  zoomMeetingId ? 'border-green-200 bg-green-50/60' : 'border-blue-100 bg-blue-50/50')}>
                  {!isEdit ? (
                    <p className="text-xs text-blue-600">Save this lesson first, then open Edit to auto-generate a Zoom meeting link.</p>
                  ) : !zoomStatus ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Checking Zoom…
                    </div>
                  ) : !zoomStatus.connected ? (
                    <div className="flex items-center gap-2 text-xs text-amber-700">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      </svg>
                      <span>No Zoom account connected.{' '}
                        <a href="/settings" className="underline font-medium hover:text-amber-900">Connect in Settings → Zoom</a>
                      </span>
                    </div>
                  ) : zoomMeetingId ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-green-700 font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                        </svg>
                        Zoom meeting created
                      </div>
                      <button type="button"
                        onClick={() => createZoomMeetingMutation.mutate()}
                        disabled={createZoomMeetingMutation.isPending}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50">
                        {createZoomMeetingMutation.isPending ? 'Regenerating…' : 'Regenerate'}
                      </button>
                    </div>
                  ) : (
                    <button type="button"
                      onClick={() => createZoomMeetingMutation.mutate()}
                      disabled={createZoomMeetingMutation.isPending}
                      className="w-full py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60">
                      {createZoomMeetingMutation.isPending ? 'Creating Meeting…' : 'Create Zoom Meeting'}
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Meeting URL</label>
                <div className="relative">
                  <input type="url" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)}
                    placeholder="https://zoom.us/j/... or meet.google.com/..."
                    className="w-full pl-4 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Scheduled Date & Time</label>
                <input type="datetime-local" value={liveScheduledAt} onChange={(e) => setLiveScheduledAt(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Instructions for students</label>
                <textarea rows={2} value={liveInstructions} onChange={(e) => setLiveInstructions(e.target.value)}
                  placeholder="e.g. Join the Zoom link 5 minutes before class starts..."
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none bg-gray-50" />
              </div>

              <div className="pt-1 border-t border-gray-100">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Recording URL <span className="font-normal text-gray-400">(add after session ends)</span>
                </label>
                {livePlatform === 'zoom' && zoomMeetingId && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Zoom recording will be fetched automatically ~30 min after the session ends.
                  </div>
                )}
                <input type="url" value={liveRecordingUrl} onChange={(e) => setLiveRecordingUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or any recording link"
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
                <p className="text-xs text-gray-400 mt-1">Students will see an embedded player or watch link below the session info.</p>
              </div>
            </div>
          )}

            {/* ── Lesson options ── */}
            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Lesson Options</span>
              </div>
              <div className="divide-y divide-gray-100">
                {[
                  { checked: isPublished,      onChange: setIsPublished,      label: 'Published',         desc: 'Visible to enrolled students' },
                  { checked: isPreview,        onChange: setIsPreview,        label: 'Free Preview',      desc: 'Accessible without enrollment' },
                  { checked: discussionEnabled,onChange: setDiscussionEnabled,label: 'Enable Discussion',  desc: 'Allow Q&A for this lesson' },
                ].map(({ checked, onChange, label, desc }) => (
                  <div key={label} className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => onChange(!checked)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      onClick={e => { e.stopPropagation(); onChange(!checked); }}
                      className={cn('relative flex-shrink-0 rounded-full transition-colors duration-200 flex-none',
                        checked ? 'bg-orange-500' : 'bg-gray-200')}
                      style={{ width: '40px', height: '22px' }}>
                      <span
                        className="absolute rounded-full bg-white shadow-sm transition-transform duration-200"
                        style={{ width: '18px', height: '18px', top: '2px', left: '2px',
                          transform: checked ? 'translateX(18px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Quiz lesson config ── */}
            {type === 'quiz' && (
              <div className="rounded-2xl border border-rose-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-100 flex items-center gap-2">
                  <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                  <span className="text-xs font-bold text-rose-600 uppercase tracking-widest">Quiz Settings</span>
                  <span className="text-xs text-rose-400 ml-1">— questions are added from the Quiz module after saving</span>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Quiz Title <span className="font-normal text-gray-400">(defaults to lesson title)</span></label>
                    <input value={quizTitle} onChange={e => setQuizTitle(e.target.value)}
                      placeholder={`${title.trim() || 'Lesson'} — Quiz`}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 bg-gray-50" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Passing Score (%)</label>
                      <input type="number" min={1} max={100} value={quizPassingScore}
                        onChange={e => setQuizPassingScore(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Max Attempts <span className="font-normal text-gray-400">(0 = unlimited)</span></label>
                      <input type="number" min={0} value={quizMaxAttempts}
                        onChange={e => setQuizMaxAttempts(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 bg-gray-50" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={quizTimerEnabled} onChange={e => setQuizTimerEnabled(e.target.checked)}
                        className="rounded border-gray-300 text-rose-500 focus:ring-rose-400" />
                      Enable timer
                    </label>
                    {quizTimerEnabled && (
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={1} max={180} value={quizTimerMinutes}
                          onChange={e => setQuizTimerMinutes(Number(e.target.value))}
                          className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 text-center" />
                        <span className="text-xs text-gray-500">min</span>
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={quizShowCorrectAnswers} onChange={e => setQuizShowCorrectAnswers(e.target.checked)}
                        className="rounded border-gray-300 text-rose-500 focus:ring-rose-400" />
                      Show correct answers after submission
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={quizShuffleQuestions} onChange={e => setQuizShuffleQuestions(e.target.checked)}
                        className="rounded border-gray-300 text-rose-500 focus:ring-rose-400" />
                      Shuffle questions
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── Drip content ── */}
            <div className="rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-900">Drip Content</p>
                  <p className="text-xs text-amber-600">Schedule when this lesson becomes available</p>
                </div>
                {/* mode toggle */}
                <div className="flex items-center gap-1 bg-white rounded-xl border border-amber-200 p-1 flex-shrink-0">
                  {(['days', 'date'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setDripMode(m)}
                      className={cn('px-3 py-1 rounded-lg text-xs font-semibold transition-all',
                        dripMode === m ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-700 hover:bg-amber-50')}>
                      {m === 'days' ? 'After X days' : 'Specific date'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-4 pb-4">
                {dripMode === 'days' ? (
                  <div className="flex items-center gap-2 bg-white rounded-xl border border-amber-200 px-4 py-2.5 w-fit">
                    <input type="number" min={0} max={365} value={dripDays}
                      onChange={(e) => setDripDays(Math.max(0, Number(e.target.value)))}
                      className="w-14 text-sm font-bold text-center text-amber-800 focus:outline-none bg-transparent" />
                    <span className="text-xs font-semibold text-amber-600">days after enrollment</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <input type="date" value={dripDate} onChange={e => setDripDate(e.target.value)}
                      className="px-3 py-2 text-sm border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-amber-800" />
                    {dripDate && (
                      <button type="button" onClick={() => setDripDate('')}
                        className="text-xs text-amber-500 hover:text-amber-700 font-medium">
                        Clear
                      </button>
                    )}
                    <span className="text-xs text-amber-600">lesson unlocks on this date for all students</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Sticky footer ── */}
          <div className="flex-shrink-0 border-t border-gray-100 bg-white">
            {error && (
              <div className="px-6 pt-3">
                <Alert variant="error">{error}</Alert>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-6 py-4">
              <button type="button" onClick={onClose}
                className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors">
                Cancel
              </button>
              <Button type="submit" loading={isBusy} className="px-8 py-2.5 rounded-xl font-semibold">
                {uploading ? 'Uploading…' : isEdit ? 'Save Changes' : selectedFile ? 'Save & Upload' : 'Add Lesson'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Lesson Row ───────────────────────────────────────────────────────────────

interface LessonRowProps {
  courseId: string;
  sectionId: string;
  lesson: Lesson;
  onEdit: (lesson: Lesson) => void;
  onDeleted: () => void;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

// ─── Live Session Modal (instructor controls) ─────────────────────────────────

interface AttendanceRecord {
  _id: string;
  user: { _id: string; firstName: string; lastName: string; email: string };
  source: string; status: string;
  joinedAt: string | null; checkedInAt: string | null; durationMinutes: number | null;
}
interface AttendanceReport {
  lesson: { title: string; liveClass: { status: string; liveStartedAt: string | null; liveEndedAt: string | null; recordingUrl: string | null; platform?: string; zoomMeetingId?: string | null } };
  totalEnrolled: number; attendedCount: number; absentCount: number; attendanceRate: number;
  records: AttendanceRecord[];
}

function LiveSessionModal({ lessonId, lessonTitle, onClose }: { lessonId: string; lessonTitle: string; onClose: () => void }) {
  const [recUrl, setRecUrl] = useState('');
  const qKey = ['live-attendance', lessonId];

  const { data, isLoading, refetch } = useQuery<AttendanceReport>({
    queryKey: qKey,
    queryFn: async () => { const { data } = await api.get(`/live/lessons/${lessonId}/attendance`); return data.data; },
  });

  useEffect(() => { if (data?.lesson?.liveClass?.recordingUrl) setRecUrl(data.lesson.liveClass.recordingUrl); }, [data]);

  const startMut   = useMutation({ mutationFn: () => api.patch(`/live/lessons/${lessonId}/start`),   onSuccess: () => refetch() });
  const endMut     = useMutation({ mutationFn: () => api.patch(`/live/lessons/${lessonId}/end`),     onSuccess: () => refetch() });
  const recMut     = useMutation({ mutationFn: () => api.put(`/live/lessons/${lessonId}/recording`, { recordingUrl: recUrl }), onSuccess: () => refetch() });

  const status = data?.lesson?.liveClass?.status ?? 'scheduled';
  const lc     = data?.lesson?.liveClass;

  const STATUS_STYLE: Record<string, string> = {
    scheduled: 'bg-gray-100 text-gray-600',
    live:      'bg-red-100 text-red-700',
    ended:     'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Live Session</p>
            <h3 className="text-base font-bold text-gray-900">{lessonTitle}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> : (
            <>
              {/* Status + controls */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className={cn('text-xs font-bold px-3 py-1.5 rounded-full capitalize', STATUS_STYLE[status])}>
                  {status === 'live' ? '🔴 Live Now' : status}
                </span>
                {lc?.liveStartedAt && (
                  <span className="text-xs text-gray-400">
                    Started {new Date(lc.liveStartedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {lc?.liveEndedAt && (
                  <span className="text-xs text-gray-400">
                    Ended {new Date(lc.liveEndedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  {status !== 'live' && status !== 'ended' && (
                    <Button size="sm" loading={startMut.isPending}
                      onClick={() => { if (confirm('Start this session? Students will be notified.')) startMut.mutate(); }}>
                      🔴 Start Session
                    </Button>
                  )}
                  {status === 'live' && (
                    <Button size="sm" variant="outline" loading={endMut.isPending}
                      onClick={() => { if (confirm('End this session?')) endMut.mutate(); }}>
                      ⏹ End Session
                    </Button>
                  )}
                </div>
              </div>

              {/* Attendance summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Enrolled',   value: data?.totalEnrolled ?? 0,   color: 'text-gray-800' },
                  { label: 'Attended',   value: data?.attendedCount ?? 0,   color: 'text-green-600' },
                  { label: 'Absent',     value: data?.absentCount  ?? 0,   color: 'text-red-500'  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                    <p className={cn('text-2xl font-bold', color)}>{value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {(data?.attendanceRate ?? 0) > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${data!.attendanceRate}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-600">{data!.attendanceRate}% attended</span>
                </div>
              )}

              {/* Recording URL */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recording URL</p>
                {lc?.platform === 'zoom' && lc?.zoomMeetingId && status === 'ended' && !lc?.recordingUrl && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Zoom recording is being processed — it will appear here automatically in ~30 min.
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="url" value={recUrl} onChange={e => setRecUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... or any recording link"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-gray-50" />
                  <Button size="sm" disabled={!recUrl.trim()} loading={recMut.isPending} onClick={() => recMut.mutate()}>
                    Save
                  </Button>
                </div>
                {lc?.recordingUrl && (
                  <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Recording saved — students can now watch it
                  </p>
                )}
              </div>

              {/* Attendance table */}
              {(data?.records ?? []).length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Attendance Records</p>
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Student</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Status</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Source</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data!.records.map(r => (
                          <tr key={r._id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-gray-900">{r.user?.firstName} {r.user?.lastName}</p>
                              <p className="text-xs text-gray-400">{r.user?.email}</p>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full capitalize',
                                r.status === 'attended' ? 'bg-green-100 text-green-700'
                                  : r.status === 'partial' ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-500')}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500 capitalize">{r.source?.replace('_', ' ')}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">
                              {r.joinedAt ? new Date(r.joinedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) :
                               r.checkedInAt ? new Date(r.checkedInAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {status !== 'scheduled' && (data?.records ?? []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No attendance records yet.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonRow({ courseId, sectionId, lesson, onEdit, onDeleted, isFirst, isLast, onMoveUp, onMoveDown }: LessonRowProps) {
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showSessionModal, setShowSessionModal] = useState(false);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.delete(`/courses/${courseId}/sections/${sectionId}/lessons/${lesson._id}`),
    onSuccess: onDeleted,
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      api.patch(`/courses/${courseId}/sections/${sectionId}/lessons/${lesson._id}`, {
        isPublished: !lesson.isPublished,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sections', courseId] }),
  });

  const handleUpload = async (file: File, kind: 'video' | 'file') => {
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append(kind === 'video' ? 'video' : 'file', file);
      await api.post(`/courses/${courseId}/lessons/${lesson._id}/${kind}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      qc.invalidateQueries({ queryKey: ['sections', courseId] });
    } catch (err: unknown) {
      const axErr = err as AxiosError<{ message: string }>;
      setUploadError(axErr.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 group border-b border-gray-50 last:border-0">
      {/* Up / Down reorder buttons */}
      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst}
          title="Move up"
          className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-25 disabled:cursor-not-allowed text-gray-400 hover:text-gray-700 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast}
          title="Move down"
          className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-25 disabled:cursor-not-allowed text-gray-400 hover:text-gray-700 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {/* Type icon */}
      <div className="flex-shrink-0 w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center">
        {lesson.type === 'video' && (
          <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
        {lesson.type === 'text' && (
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        {lesson.type === 'file' && (
          <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        )}
        {lesson.type === 'quiz' && (
          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        )}
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-900 truncate">{lesson.title}</span>
          {lesson.isPreview && (
            <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex-shrink-0">
              Preview
            </span>
          )}
          {!lesson.isPublished && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">
              Draft
            </span>
          )}
          {lesson.type === 'live' && (lesson.liveClass as any)?.status === 'live' && (
            <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded flex-shrink-0 font-semibold">
              🔴 Live
            </span>
          )}
          {lesson.type === 'live' && (lesson.liveClass as any)?.status === 'ended' && (
            <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded flex-shrink-0">
              ✓ Ended
            </span>
          )}
        </div>
        {lesson.video && (
          <span className="text-xs text-gray-400">{fmtDuration(lesson.video.durationSeconds)}</span>
        )}
        {uploadError && <span className="block text-xs text-red-500 mt-0.5">{uploadError}</span>}
      </div>

      {/* Upload buttons — always visible when no content, hover-only otherwise */}
      <div className="flex items-center gap-1.5">
        {lesson.type === 'video' && (
          <>
            <input ref={videoRef} type="file" accept="video/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'video')} />
            <Button
              size="sm"
              variant={lesson.video ? 'ghost' : 'outline'}
              loading={uploading}
              className={cn(!lesson.video ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity')}
              onClick={() => videoRef.current?.click()}
            >
              {lesson.video ? 'Replace' : '⬆ Upload Video'}
            </Button>
          </>
        )}
        {lesson.type === 'file' && (
          <>
            <input ref={fileRef} type="file" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'file')} />
            <Button
              size="sm"
              variant={lesson.file ? 'ghost' : 'outline'}
              loading={uploading}
              className={cn(!lesson.file ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity')}
              onClick={() => fileRef.current?.click()}
            >
              {lesson.file ? 'Replace' : '⬆ Upload File'}
            </Button>
          </>
        )}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
          <Button size="sm" variant="ghost" loading={publishMutation.isPending}
            onClick={() => publishMutation.mutate()}>
            {lesson.isPublished ? 'Unpublish' : 'Publish'}
          </Button>
          {lesson.type === 'live' && (
            <Button size="sm" variant="ghost" onClick={() => setShowSessionModal(true)}>
              🔴 Session
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onEdit(lesson)}>Edit</Button>
          <Button size="sm" variant="danger" loading={deleteMutation.isPending}
            onClick={() => { if (confirm('Delete this lesson?')) deleteMutation.mutate(); }}>
            Delete
          </Button>
        </div>
      </div>

      {showSessionModal && (
        <LiveSessionModal
          lessonId={lesson._id}
          lessonTitle={lesson.title}
          onClose={() => setShowSessionModal(false)}
        />
      )}
    </div>
  );
}

// ─── Section Row ─────────────────────────────────────────────────────────────

interface SectionRowProps {
  courseId: string;
  section: Section;
  onRefresh: () => void;
}

function SectionRow({ courseId, section, onRefresh }: SectionRowProps) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(section.title);
  const [lessonModal, setLessonModal] = useState<Lesson | null | 'new'>(null);

  const updateMutation = useMutation({
    mutationFn: (payload: object) =>
      api.patch(`/courses/${courseId}/sections/${section._id}`, payload),
    onSuccess: () => {
      setEditingTitle(false);
      qc.invalidateQueries({ queryKey: ['sections', courseId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/courses/${courseId}/sections/${section._id}`),
    onSuccess: onRefresh,
  });

  const handleTitleBlur = () => {
    if (titleInput.trim() && titleInput !== section.title) {
      updateMutation.mutate({ title: titleInput.trim() });
    } else {
      setTitleInput(section.title);
      setEditingTitle(false);
    }
  };

  const [lessons, setLessons] = useState<Lesson[]>(section.lessons ?? []);
  useEffect(() => { setLessons(section.lessons ?? []); }, [section.lessons]);

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; order: number }[]) =>
      api.patch(`/courses/${courseId}/sections/${section._id}/lessons/reorder`, { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sections', courseId] }),
  });

  const moveLesson = (fromIdx: number, toIdx: number) => {
    const updated = [...lessons];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setLessons(updated);
    reorderMutation.mutate(updated.map((l, i) => ({ id: l._id, order: i + 1 })));
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        {/* Inline-editable title — double-click to edit */}
        <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          {editingTitle ? (
            <input
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleBlur();
                if (e.key === 'Escape') { setTitleInput(section.title); setEditingTitle(false); }
              }}
              className="text-sm font-medium text-gray-900 bg-white border border-primary-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-sm font-medium text-gray-900 hover:text-primary-600 cursor-text"
              onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
              title="Double-click to rename"
            >
              {section.title}
            </span>
          )}
        </div>

        <span className="text-xs text-gray-400 flex-shrink-0">
          {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
          {section.totalDurationSeconds ? ` · ${fmtDuration(section.totalDurationSeconds)}` : ''}
        </span>

        {!section.isPublished && (
          <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
            Draft
          </span>
        )}

        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost"
            onClick={() => { setExpanded(true); setLessonModal('new'); }}>
            + Lesson
          </Button>
          <Button size="sm" variant="ghost" loading={updateMutation.isPending}
            onClick={() => updateMutation.mutate({ isPublished: !section.isPublished })}>
            {section.isPublished ? 'Unpublish' : 'Publish'}
          </Button>
          <Button size="sm" variant="danger" loading={deleteMutation.isPending}
            onClick={() => {
              if (confirm('Delete this section and all its lessons?')) deleteMutation.mutate();
            }}>
            Delete
          </Button>
        </div>
      </div>

      {/* Lessons list */}
      {expanded && (
        <div>
          {lessons.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No lessons yet.{' '}
              <button
                className="text-primary-600 hover:underline"
                onClick={() => setLessonModal('new')}
              >
                Add one
              </button>
            </div>
          ) : (
            lessons.map((lesson, idx) => (
              <LessonRow
                key={lesson._id}
                courseId={courseId}
                sectionId={section._id}
                lesson={lesson}
                onEdit={(l) => setLessonModal(l)}
                onDeleted={() => qc.invalidateQueries({ queryKey: ['sections', courseId] })}
                isFirst={idx === 0}
                isLast={idx === lessons.length - 1}
                onMoveUp={() => moveLesson(idx, idx - 1)}
                onMoveDown={() => moveLesson(idx, idx + 1)}
              />
            ))
          )}
        </div>
      )}

      {lessonModal && (
        <LessonModal
          courseId={courseId}
          sectionId={section._id}
          lesson={lessonModal === 'new' ? null : lessonModal}
          onClose={() => setLessonModal(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['sections', courseId] })}
        />
      )}
    </div>
  );
}

// ─── Curriculum Tab ───────────────────────────────────────────────────────────

function CurriculumTab({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [addingSection, setAddingSection] = useState(false);

  const { data: sectionsData, isLoading } = useQuery({
    queryKey: ['sections', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/sections`);
      return data.data.sections as Section[];
    },
  });

  const createSectionMutation = useMutation({
    mutationFn: (title: string) => api.post(`/courses/${courseId}/sections`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sections', courseId] });
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      setNewSectionTitle('');
      setAddingSection(false);
    },
  });

  const sections = (sectionsData ?? []).slice().sort((a, b) => a.order - b.order);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-3">
      {sections.length === 0 && !addingSection ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="font-medium text-gray-900">No sections yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Add a section to start building the curriculum.
            </p>
            <Button className="mt-4" onClick={() => setAddingSection(true)}>Add Section</Button>
          </div>
        </Card>
      ) : (
        <>
          {sections.map((section) => (
            <SectionRow
              key={section._id}
              courseId={courseId}
              section={section}
              onRefresh={() => qc.invalidateQueries({ queryKey: ['sections', courseId] })}
            />
          ))}
        </>
      )}

      {/* Add section form */}
      {addingSection ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSectionTitle.trim())
                createSectionMutation.mutate(newSectionTitle.trim());
              if (e.key === 'Escape') { setAddingSection(false); setNewSectionTitle(''); }
            }}
            placeholder="Section title..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <Button
            size="sm"
            loading={createSectionMutation.isPending}
            disabled={!newSectionTitle.trim()}
            onClick={() => createSectionMutation.mutate(newSectionTitle.trim())}
          >
            Add
          </Button>
          <Button size="sm" variant="outline"
            onClick={() => { setAddingSection(false); setNewSectionTitle(''); }}>
            Cancel
          </Button>
        </div>
      ) : (
        sections.length > 0 && (
          <Button variant="outline" onClick={() => setAddingSection(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Section
          </Button>
        )
      )}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ courseId, course }: { courseId: string; course: Course }) {
  const qc = useQueryClient();
  const thumbnailRef = useRef<HTMLInputElement>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [thumbError, setThumbError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [level, setLevel] = useState<CourseLevel>(course.level);
  const [isFree, setIsFree] = useState(course.isFree);
  const [certificateEnabled, setCertificateEnabled] = useState(course.certificateEnabled ?? true);
  const [price, setPrice] = useState(String(course.price ?? 0));
  const [capacity, setCapacity]       = useState(String(course.capacity ?? ''));
  const [ctaLabel, setCtaLabel]       = useState(course.ctaLabel ?? '');
  const [displayLayout, setDisplayLayout] = useState<'classic' | 'hero' | 'minimal'>(course.displayLayout ?? 'classic');

  // Feature 1 — Expiry
  const [accessDurationDays, setAccessDurationDays] = useState(String(course.accessDurationDays ?? ''));

  // Feature 11 — Trial
  const [trialEnabled, setTrialEnabled]         = useState(course.trialEnabled ?? false);
  const [trialDurationDays, setTrialDurationDays] = useState(String(course.trialDurationDays ?? 7));

  // Feature 3 — Prerequisites
  const { data: allCourses } = useQuery({
    queryKey: ['courses-list'],
    queryFn: async () => {
      const { data } = await api.get('/courses?limit=200');
      return (data.data.courses as Course[]).filter(c => c._id !== courseId);
    },
    staleTime: 60000,
  });
  const currentPrereqIds = (course.prerequisites ?? []).map((p) =>
    typeof p === 'string' ? p : (p as { _id: string })._id
  );
  const [prereqIds, setPrereqIds] = useState<string[]>(currentPrereqIds);

  // Category (two-step: parent → sub-category)
  const currentCatId = course.categoryId
    ? (typeof course.categoryId === 'string' ? course.categoryId : (course.categoryId as Category)._id)
    : '';
  const [parentCatId, setParentCatId] = useState('');
  const [subCatId,    setSubCatId]    = useState('');
  const [catInit,     setCatInit]     = useState(false);

  const [tags, setTags]         = useState<string[]>(course.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await api.get('/courses/categories');
      return data.data.categories as Array<{ _id: string; name: string; parentId?: string }>;
    },
    staleTime: 60000,
  });

  // Initialise parent/sub split once categories load
  useEffect(() => {
    if (!categoriesData || catInit) return;
    if (!currentCatId) { setCatInit(true); return; }
    const cat = categoriesData.find(c => c._id === currentCatId);
    if (cat?.parentId) { setParentCatId(cat.parentId); setSubCatId(currentCatId); }
    else               { setParentCatId(currentCatId); }
    setCatInit(true);
  }, [categoriesData, catInit, currentCatId]);

  const topLevelCats = (categoriesData ?? []).filter(c => !c.parentId);
  const subCats      = (categoriesData ?? []).filter(c => c.parentId === parentCatId);
  const parentName   = topLevelCats.find(c => c._id === parentCatId)?.name ?? '';

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/,/g, '');
    if (tag && !tags.includes(tag)) setTags(prev => [...prev, tag]);
    setTagInput('');
  }

  // Feature 4 — Enrollment window
  const fmtDate = (d?: string | null) => d ? new Date(d).toISOString().split('T')[0] : '';
  const [enrollmentStartsAt, setEnrollmentStartsAt] = useState(fmtDate(course.enrollmentStartsAt));
  const [enrollmentEndsAt,   setEnrollmentEndsAt]   = useState(fmtDate(course.enrollmentEndsAt));

  const updateMutation = useMutation({
    mutationFn: (payload: object) => api.patch(`/courses/${courseId}`, payload),
    onSuccess: (_res, variables) => {
      // Instantly reflect saved values in the cache — no waiting for a refetch
      qc.setQueryData(['course', courseId], (old: Course | undefined) =>
        old ? { ...old, ...(variables as Partial<Course>) } : old
      );
      // Also update the courses list (catalog CTA labels) and background-sync
      qc.invalidateQueries({ queryKey: ['courses'] });
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setSaveError(err.response?.data?.message ?? 'Failed to save'),
  });

  const handleSave = () => {
    setSaveError('');
    updateMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      level,
      isFree,
      price: isFree ? 0 : parseFloat(price) || 0,
      capacity: capacity ? parseInt(capacity) : 0,
      ctaLabel: ctaLabel.trim(),
      certificateEnabled,
      displayLayout,
      accessDurationDays: accessDurationDays ? parseInt(accessDurationDays) : 0,
      trialEnabled,
      trialDurationDays: trialEnabled ? (parseInt(trialDurationDays) || 7) : 0,
      prerequisites: prereqIds,
      enrollmentStartsAt: enrollmentStartsAt || null,
      enrollmentEndsAt:   enrollmentEndsAt   || null,
      categoryId: subCatId || parentCatId || null,
      tags,
    });
  };

  const handleThumbnailChange = async (file: File) => {
    setUploadingThumb(true);
    setThumbError('');
    const reader = new FileReader();
    reader.onload = (e) => setThumbnailPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    try {
      const form = new FormData();
      form.append('thumbnail', file);
      const res = await api.post(`/courses/${courseId}/thumbnail`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const thumbUrl = res.data?.data?.course?.thumbnail as string | undefined;
      if (thumbUrl) {
        qc.setQueryData(['course', courseId], (old: Course | undefined) =>
          old ? { ...old, thumbnail: thumbUrl } : old
        );
      }
      qc.invalidateQueries({ queryKey: ['course', courseId] });
    } catch (err: unknown) {
      const axErr = err as AxiosError<{ message: string }>;
      setThumbError(axErr.response?.data?.message ?? 'Thumbnail upload failed');
      setThumbnailPreview(null);
    } finally {
      setUploadingThumb(false);
    }
  };

  const currentThumb = thumbnailPreview ?? course.thumbnail;
  const inputCls = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white transition-shadow';
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

  return (
    <div className="flex gap-7 max-w-5xl">

      {/* ── Left column (main) ── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Thumbnail hero */}
        <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm group cursor-pointer bg-gray-900"
          onClick={() => thumbnailRef.current?.click()}>
          <input ref={thumbnailRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleThumbnailChange(e.target.files[0])} />
          {currentThumb ? (
            <>
              <img src={currentThumb} alt="Thumbnail" className="w-full h-52 object-cover opacity-90 group-hover:opacity-70 transition-opacity" />
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-white/90 backdrop-blur-sm rounded-xl px-5 py-3 flex items-center gap-2 shadow-lg">
                  <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-800">Change thumbnail</span>
                </div>
              </div>
            </>
          ) : (
            <div className="h-52 flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Click to upload thumbnail</p>
                <p className="text-white/50 text-xs mt-0.5">JPG, PNG or GIF · Recommended 1280×720</p>
              </div>
            </div>
          )}
          {uploadingThumb && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Spinner />
            </div>
          )}
          {/* Status badge overlay */}
          <div className="absolute top-3 left-3">
            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shadow',
              course.status === 'published' ? 'bg-green-500 text-white'
                : course.status === 'archived' ? 'bg-red-500 text-white'
                : 'bg-gray-800/70 text-white backdrop-blur-sm')}>
              {course.status}
            </span>
          </div>
        </div>
        {thumbError && <p className="text-xs text-red-500 -mt-3">{thumbError}</p>}

        {/* Title & Description */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-800">Course Info</h3>
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Course title..." className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What will students learn in this course?"
              className={cn(inputCls, 'resize-none')} />
          </div>
          <div>
            <label className={labelCls}>
              Tags
              <span className="ml-1.5 text-[10px] font-normal text-gray-400 normal-case">Enter or comma to add</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 border border-primary-200 rounded-full text-xs font-medium">
                  {tag}
                  <button type="button" onClick={() => setTags(prev => prev.filter(t => t !== tag))}
                    className="ml-0.5 hover:text-red-500 leading-none transition-colors">×</button>
                </span>
              ))}
            </div>
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) { e.preventDefault(); addTag(tagInput); } }}
              onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
              placeholder="e.g. javascript, react, beginner"
              className={inputCls} />
          </div>
        </div>

        {/* Enrollment Settings */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-800">Enrollment</h3>
          </div>

          <div>
            <label className={labelCls}>Access Duration <span className="normal-case text-gray-400 font-normal">(days — blank = lifetime)</span></label>
            <input type="number" min={1} value={accessDurationDays}
              onChange={(e) => setAccessDurationDays(e.target.value)}
              placeholder="e.g. 90 days" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Enrollment Opens</label>
              <input type="date" value={enrollmentStartsAt}
                onChange={(e) => setEnrollmentStartsAt(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Enrollment Closes</label>
              <input type="date" value={enrollmentEndsAt}
                onChange={(e) => setEnrollmentEndsAt(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Prerequisite Courses</label>
            {(allCourses ?? []).filter(c => c.status === 'published').length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No other published courses available.</p>
            ) : (
              <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                {(allCourses ?? []).filter(c => c.status === 'published').map((c) => (
                  <label key={c._id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={prereqIds.includes(c._id)}
                      onChange={(e) => setPrereqIds(prev => e.target.checked ? [...prev, c._id] : prev.filter(id => id !== c._id))}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    <span className="text-sm text-gray-700">{c.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
            <input type="checkbox" checked={trialEnabled} onChange={e => setTrialEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">Enable trial / audit mode</p>
              <p className="text-xs text-gray-400 mt-0.5">Students preview the full course free before paying</p>
            </div>
            {trialEnabled && (
              <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <input type="number" min={1} max={90} value={trialDurationDays}
                  onChange={e => setTrialDurationDays(e.target.value)}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <span className="text-xs text-gray-500">days</span>
              </div>
            )}
          </label>
        </div>

        {/* Catalog Display */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-800">Catalog Display</h3>
          </div>

          <div>
            <label className={labelCls}>CTA Button Label <span className="normal-case text-gray-400 font-normal">(max 40 chars)</span></label>
            <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value.slice(0, 40))}
              placeholder="Enroll Now" className={inputCls} />
            <p className="text-xs text-gray-400 mt-1.5">Leave blank for default. e.g. "Explore Now", "Apply Now"</p>
          </div>

          <div>
            <label className={labelCls}>Detail Page Layout</label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: 'classic' as const, label: 'Classic', icon: '▤', desc: 'Thumbnail + info side by side' },
                { value: 'hero' as const, label: 'Hero', icon: '⬛', desc: 'Full-width banner overlay' },
                { value: 'minimal' as const, label: 'Minimal', icon: '≡', desc: 'Text-focused, clean' },
              ]).map(({ value, label, icon, desc }) => (
                <button key={value} type="button" onClick={() => setDisplayLayout(value)}
                  className={cn('flex flex-col gap-1 p-3.5 rounded-xl border-2 text-left transition-all',
                    displayLayout === value ? 'border-primary-500 bg-primary-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50')}>
                  <span className="text-xl mb-0.5">{icon}</span>
                  <span className={cn('text-sm font-semibold', displayLayout === value ? 'text-primary-700' : 'text-gray-900')}>{label}</span>
                  <span className="text-[11px] text-gray-400 leading-tight">{desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Save bar */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-3.5">
          <div>
            {saveError && (
              <span className="flex items-center gap-1.5 text-sm text-red-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {saveError}
              </span>
            )}
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                All changes saved
              </span>
            )}
          </div>
          <Button loading={updateMutation.isPending} onClick={handleSave}>Save Changes</Button>
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div className="w-64 flex-shrink-0 space-y-4">

        {/* Quick stats */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">At a Glance</p>
          <div className="space-y-3">
            {[
              { label: 'Students', value: course.enrollmentCount ?? 0, icon: '👥', color: 'text-blue-600' },
              { label: 'Lessons', value: course.totalLessons ?? 0, icon: '📚', color: 'text-purple-600' },
              { label: 'Sections', value: course.totalSections ?? 0, icon: '📂', color: 'text-orange-600' },
              {
                label: 'Duration',
                value: course.totalDurationSeconds
                  ? (course.totalDurationSeconds >= 3600
                    ? `${Math.floor(course.totalDurationSeconds / 3600)}h ${Math.floor((course.totalDurationSeconds % 3600) / 60)}m`
                    : `${Math.floor(course.totalDurationSeconds / 60)}m`)
                  : '—',
                icon: '⏱', color: 'text-green-600',
              },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-lg flex-shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400 font-medium">{label}</p>
                  <p className={cn('text-base font-bold', color)}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings sidebar card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Settings</p>

          <div>
            <label className={labelCls}>Level</label>
            <select value={level} onChange={(e) => setLevel(e.target.value as CourseLevel)}
              className={inputCls}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Category</label>
            <select value={parentCatId} onChange={e => { setParentCatId(e.target.value); setSubCatId(''); }}
              className={inputCls}>
              <option value="">No category</option>
              {topLevelCats.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>

          {parentCatId && subCats.length > 0 && (
            <div>
              <label className={labelCls}>Sub-category</label>
              <select value={subCatId} onChange={e => setSubCatId(e.target.value)} className={inputCls}>
                <option value="">All of {parentName}</option>
                {subCats.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Capacity</label>
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)}
              placeholder="Unlimited" className={inputCls} />
          </div>

          {/* Certificate */}
          <div className="border-t border-gray-100 pt-4">
            <label className={cn(labelCls, 'mb-2')}>Certificate</label>
            <label className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-colors',
              certificateEnabled ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
            )}>
              <input type="checkbox" checked={certificateEnabled} onChange={(e) => setCertificateEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Issue Certificate</p>
                <p className="text-[11px] text-gray-400">Award a certificate on completion</p>
              </div>
            </label>
          </div>

          {/* Pricing */}
          <div className="border-t border-gray-100 pt-4">
            <label className={cn(labelCls, 'mb-2')}>Pricing</label>
            <label className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-colors mb-2',
              isFree ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            )}>
              <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Free</p>
                <p className="text-[11px] text-gray-400">No payment required</p>
              </div>
            </label>
            {!isFree && (
              <div>
                <label className={labelCls}>Price (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                  <input type="number" min={0} step={0.01} value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="29.99"
                    className={cn(inputCls, 'pl-7')} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Students Tab ─────────────────────────────────────────────────────────────

function StudentsTab({ courseId, enrollmentCount }: { courseId: string; enrollmentCount: number }) {
  const qc = useQueryClient();
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollUserId, setEnrollUserId]       = useState('');
  const [enrollEmail, setEnrollEmail]         = useState('');
  const [enrollMsg, setEnrollMsg]             = useState('');
  const [removingId, setRemovingId]           = useState<string | null>(null);
  const [extendingId, setExtendingId]         = useState<string | null>(null);
  const [extendDays, setExtendDays]           = useState('30');
  const [csvResult, setCsvResult]             = useState<{ enrolled: string[]; skipped: string[]; notFound: string[] } | null>(null);
  const [showCsvModal, setShowCsvModal]       = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['course-students', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/students`);
      return data.data as {
        students: Array<{
          _id: string;
          userId: { _id: string; firstName: string; lastName: string; email: string };
          enrolledAt: string;
          expiresAt: string | null;
          status: string;
        }>;
        total: number;
      };
    },
  });

  // Lookup user by email before enrolling
  const lookupMutation = useMutation({
    mutationFn: (email: string) => api.get(`/users?search=${encodeURIComponent(email)}&limit=1`),
    onSuccess: (res) => {
      const users = res.data.data.users ?? [];
      if (users.length === 0) { setEnrollMsg('No user found with that email'); return; }
      setEnrollUserId(users[0]._id);
      setEnrollMsg(`Found: ${users[0].firstName} ${users[0].lastName}`);
    },
    onError: () => setEnrollMsg('Lookup failed'),
  });

  const enrollMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/courses/${courseId}/students`, { userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-students', courseId] });
      setShowEnrollModal(false);
      setEnrollEmail(''); setEnrollUserId(''); setEnrollMsg('');
    },
    onError: (err: AxiosError<{ message: string }>) => setEnrollMsg(err.response?.data?.message ?? 'Enrollment failed'),
  });

  const unenrollMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/courses/${courseId}/students/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-students', courseId] });
      setRemovingId(null);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setRemovingId(null);
      setEnrollMsg(err.response?.data?.message ?? 'Failed to remove student');
    },
  });

  const extendMutation = useMutation({
    mutationFn: ({ userId, days }: { userId: string; days: number }) =>
      api.patch(`/courses/${courseId}/students/${userId}/extend-access`, { extraDays: days }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-students', courseId] });
      setExtendingId(null);
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setEnrollMsg(err.response?.data?.message ?? 'Failed to extend access'),
  });

  const csvMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/courses/${courseId}/students/bulk-csv`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['course-students', courseId] });
      setCsvResult(res.data.data);
      setShowCsvModal(true);
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setEnrollMsg(err.response?.data?.message ?? 'CSV import failed'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  const students = data?.students ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{data?.total ?? enrollmentCount} enrolled students</p>
        <div className="flex items-center gap-2">
          {/* Bulk CSV import */}
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              {csvMutation.isPending ? 'Importing…' : '↑ Import CSV'}
            </span>
            <input type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) csvMutation.mutate(f); e.target.value = ''; }} />
          </label>
          <Button size="sm" onClick={() => setShowEnrollModal(true)}>+ Enroll Student</Button>
        </div>
      </div>

      {/* CSV result modal */}
      {showCsvModal && csvResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold">CSV Import Results</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{csvResult.enrolled.length}</p>
                <p className="text-xs text-green-600">Enrolled</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{csvResult.skipped.length}</p>
                <p className="text-xs text-amber-600">Skipped</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{csvResult.notFound.length}</p>
                <p className="text-xs text-red-600">Not found</p>
              </div>
            </div>
            {csvResult.notFound.length > 0 && (
              <div className="text-xs text-gray-500 max-h-24 overflow-y-auto space-y-0.5">
                <p className="font-medium text-gray-700 mb-1">Emails not found:</p>
                {csvResult.notFound.map(e => <p key={e} className="font-mono">{e}</p>)}
              </div>
            )}
            <Button className="w-full" onClick={() => { setShowCsvModal(false); setCsvResult(null); }}>Done</Button>
          </div>
        </div>
      )}

      {/* Manual enroll modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Enroll a Student</h2>
            <p className="text-sm text-gray-500">Enter the student's email address to look them up, then confirm enrollment.</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={enrollEmail}
                onChange={(e) => { setEnrollEmail(e.target.value); setEnrollUserId(''); setEnrollMsg(''); }}
                placeholder="student@example.com"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              <Button
                size="sm" variant="outline"
                loading={lookupMutation.isPending}
                disabled={!enrollEmail.trim()}
                onClick={() => lookupMutation.mutate(enrollEmail.trim())}
              >
                Look up
              </Button>
            </div>
            {enrollMsg && (
              <p className={`text-sm ${enrollUserId ? 'text-green-700' : 'text-red-600'}`}>{enrollMsg}</p>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => { setShowEnrollModal(false); setEnrollEmail(''); setEnrollUserId(''); setEnrollMsg(''); }}>
                Cancel
              </Button>
              <Button
                loading={enrollMutation.isPending}
                disabled={!enrollUserId}
                onClick={() => enrollMutation.mutate(enrollUserId)}
              >
                Enroll
              </Button>
            </div>
          </div>
        </div>
      )}

      {students.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-medium text-gray-900">No students yet</p>
            <p className="text-sm text-gray-500 mt-1">Enroll students manually or share the course link.</p>
          </div>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Enrolled</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Expires</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.map((enrollment) => {
                const u = enrollment.userId;
                return (
                  <tr key={enrollment._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-xs font-medium text-primary-700 flex-shrink-0">
                          {u?.firstName?.[0]}{u?.lastName?.[0]}
                        </div>
                        <span className="font-medium text-gray-900">{u?.firstName} {u?.lastName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500">{u?.email}</td>
                    <td className="px-4 py-4 text-gray-500">
                      {new Date(enrollment.enrolledAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      {enrollment.expiresAt ? (
                        extendingId === enrollment._id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min={1}
                              value={extendDays}
                              onChange={e => setExtendDays(e.target.value)}
                              className="w-14 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-400"
                            />
                            <span className="text-xs text-gray-400">days</span>
                            <button
                              onClick={() => extendMutation.mutate({ userId: u._id, days: parseInt(extendDays) || 30 })}
                              className="text-xs text-green-600 font-medium hover:text-green-700 px-1">
                              {extendMutation.isPending ? '…' : 'OK'}
                            </button>
                            <button onClick={() => setExtendingId(null)} className="text-xs text-gray-400 px-1">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => setExtendingId(enrollment._id)}
                            className="text-xs text-gray-500 hover:text-primary-600 underline underline-offset-2">
                            {new Date(enrollment.expiresAt) < new Date()
                              ? <span className="text-red-500">Expired</span>
                              : new Date(enrollment.expiresAt).toLocaleDateString()}
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">Lifetime</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={enrollment.status === 'completed' ? 'success' : enrollment.status === 'expired' ? 'danger' : 'default'}>
                        {enrollment.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {enrollment.status === 'active' && (
                        removingId === enrollment._id ? (
                          <div className="flex items-center justify-end gap-2 text-xs">
                            <span className="text-gray-500">Remove?</span>
                            <button onClick={() => unenrollMutation.mutate(u._id)}
                              className="text-red-600 font-medium hover:text-red-700">Yes</button>
                            <button onClick={() => setRemovingId(null)}
                              className="text-gray-500 hover:text-gray-700">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setRemovingId(enrollment._id)}
                            className="text-xs text-gray-400 hover:text-red-600 transition-colors">
                            Remove
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Cohorts Tab ──────────────────────────────────────────────────────────────

interface CohortData {
  _id: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  maxSize: number;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  createdAt: string;
}

function CohortsTab({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<CohortData | null>(null);
  const [saveError, setSaveError] = useState('');
  const [enrollModal, setEnrollModal] = useState<CohortData | null>(null);
  const [emailInput, setEmailInput]   = useState('');
  const [pendingIds, setPendingIds]   = useState<string[]>([]);
  const [lookupMsg, setLookupMsg]     = useState('');
  const [enrollResult, setEnrollResult] = useState<{ enrolled: string[]; skipped: { userId: string; reason: string }[] } | null>(null);

  // Form state
  const [name, setName]           = useState('');
  const [desc, setDesc]           = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [maxSize, setMaxSize]     = useState('');

  const resetForm = () => { setName(''); setDesc(''); setStartDate(''); setEndDate(''); setMaxSize(''); setEditing(null); };

  const { data: cohorts = [], isLoading } = useQuery({
    queryKey: ['cohorts', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/cohorts`);
      return data.data.cohorts as CohortData[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: object) => editing
      ? api.patch(`/courses/${courseId}/cohorts/${editing._id}`, payload)
      : api.post(`/courses/${courseId}/cohorts`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', courseId] });
      setShowModal(false);
      resetForm();
      setSaveError('');
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setSaveError(err.response?.data?.message ?? 'Failed to save cohort'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/${courseId}/cohorts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohorts', courseId] }),
  });

  const lookupMutation = useMutation({
    mutationFn: (email: string) => api.get(`/users?search=${encodeURIComponent(email)}&limit=1`),
    onSuccess: (res) => {
      const users = res.data.data.users ?? [];
      if (!users.length) { setLookupMsg('No user found'); return; }
      const u = users[0];
      if (pendingIds.includes(u._id)) { setLookupMsg('Already added'); return; }
      setPendingIds(prev => [...prev, u._id]);
      setLookupMsg(`Added: ${u.firstName} ${u.lastName}`);
      setEmailInput('');
    },
    onError: () => setLookupMsg('Lookup failed'),
  });

  const bulkEnrollMutation = useMutation({
    mutationFn: ({ cohortId, userIds }: { cohortId: string; userIds: string[] }) =>
      api.post(`/courses/${courseId}/cohorts/${cohortId}/enroll`, { userIds }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['course-students', courseId] });
      setEnrollResult(res.data.data);
      setPendingIds([]);
    },
    onError: (err: AxiosError<{ message: string }>) => setLookupMsg(err.response?.data?.message ?? 'Enrollment failed'),
  });

  const openEdit = (c: CohortData) => {
    setEditing(c);
    setName(c.name); setDesc(c.description);
    setStartDate(c.startDate ? new Date(c.startDate).toISOString().split('T')[0] : '');
    setEndDate(c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : '');
    setMaxSize(c.maxSize ? String(c.maxSize) : '');
    setShowModal(true);
  };

  const STATUS_COLOR: Record<string, string> = {
    upcoming: 'bg-blue-50 text-blue-700',
    active: 'bg-green-50 text-green-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-50 text-red-600',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{cohorts.length} cohort{cohorts.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => { resetForm(); setShowModal(true); }}>+ New Cohort</Button>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">{editing ? 'Edit Cohort' : 'New Cohort'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. January 2026 Cohort"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Size <span className="text-gray-400 font-normal">(0 = unlimited)</span></label>
                <input type="number" min={0} value={maxSize} onChange={e => setMaxSize(e.target.value)} placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
              </div>
              {editing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as CohortData['status'] })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white">
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
            </div>
            {saveError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); setSaveError(''); }}>Cancel</Button>
              <Button loading={saveMutation.isPending}
                disabled={!name.trim()}
                onClick={() => saveMutation.mutate({ name, description: desc, startDate: startDate || null, endDate: endDate || null, maxSize: parseInt(maxSize) || 0, ...(editing ? { status: editing.status } : {}) })}>
                {editing ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Enroll Modal */}
      {enrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Enroll Students — {enrollModal.name}</h2>
            {enrollResult ? (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{enrollResult.enrolled.length}</p>
                    <p className="text-xs text-green-600">Enrolled</p>
                  </div>
                  <div className="flex-1 bg-amber-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-amber-700">{enrollResult.skipped.length}</p>
                    <p className="text-xs text-amber-600">Skipped</p>
                  </div>
                </div>
                {enrollResult.skipped.length > 0 && (
                  <div className="text-xs text-gray-500 space-y-1 max-h-32 overflow-y-auto">
                    {enrollResult.skipped.map((s, i) => (
                      <div key={i} className="flex justify-between px-2 py-1 bg-gray-50 rounded">
                        <span className="font-mono">{s.userId}</span>
                        <span>{s.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button className="w-full" onClick={() => { setEnrollModal(null); setEnrollResult(null); }}>Done</Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">Look up students by email and add them to this cohort.</p>
                <div className="flex gap-2">
                  <input type="email" value={emailInput} onChange={e => { setEmailInput(e.target.value); setLookupMsg(''); }}
                    placeholder="student@example.com"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
                  <Button size="sm" variant="outline" loading={lookupMutation.isPending}
                    disabled={!emailInput.trim()}
                    onClick={() => lookupMutation.mutate(emailInput.trim())}>Look up</Button>
                </div>
                {lookupMsg && <p className="text-xs text-gray-500">{lookupMsg}</p>}
                {pendingIds.length > 0 && (
                  <p className="text-sm font-medium text-gray-700">{pendingIds.length} student{pendingIds.length !== 1 ? 's' : ''} ready to enroll</p>
                )}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => { setEnrollModal(null); setPendingIds([]); setLookupMsg(''); }}>Cancel</Button>
                  <Button loading={bulkEnrollMutation.isPending}
                    disabled={pendingIds.length === 0}
                    onClick={() => bulkEnrollMutation.mutate({ cohortId: enrollModal._id, userIds: pendingIds })}>
                    Enroll {pendingIds.length > 0 ? pendingIds.length : ''} Student{pendingIds.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : cohorts.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-medium text-gray-900">No cohorts yet</p>
            <p className="text-sm text-gray-500 mt-1">Create cohorts to group and manage students by batch.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {cohorts.map((c) => (
            <div key={c._id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm">{c.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                  {c.description && <p className="text-xs text-gray-500">{c.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                    {c.startDate && <span>Starts {new Date(c.startDate).toLocaleDateString()}</span>}
                    {c.endDate && <span>Ends {new Date(c.endDate).toLocaleDateString()}</span>}
                    {c.maxSize > 0 && <span>Max {c.maxSize} students</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => { setEnrollModal(c); setEnrollResult(null); setPendingIds([]); setLookupMsg(''); }}>
                    Enroll Students
                  </Button>
                  <button onClick={() => openEdit(c)} className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1">Edit</button>
                  <button onClick={() => deleteMutation.mutate(c._id)} className="text-xs text-gray-400 hover:text-red-600 px-2 py-1">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Enrollment Requests Tab ──────────────────────────────────────────────────

function EnrollmentRequestsTab({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['enrollment-requests', courseId, filter],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/enrollment-requests?status=${filter}`);
      return data.data as {
        requests: Array<{
          _id: string;
          userId: { _id: string; firstName: string; lastName: string; email: string };
          message: string;
          reviewNote: string;
          status: string;
          createdAt: string;
        }>;
        total: number;
      };
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.patch(`/courses/${courseId}/enrollment-requests/${id}/approve`, { reviewNote: note }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['course-students', courseId] }); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.patch(`/courses/${courseId}/enrollment-requests/${id}/reject`, { reviewNote: note }),
    onSuccess: () => refetch(),
  });

  const requests = data?.requests ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full capitalize transition-colors ${
              filter === s
                ? s === 'pending' ? 'bg-blue-100 text-blue-700'
                  : s === 'approved' ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-400">{data?.total ?? 0} total</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : requests.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-medium text-gray-900">No {filter} requests</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const u = req.userId;
            const note = reviewNotes[req._id] ?? '';
            return (
              <div key={req._id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-xs font-medium text-primary-700 flex-shrink-0">
                      {u?.firstName?.[0]}{u?.lastName?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{u?.firstName} {u?.lastName}</p>
                      <p className="text-xs text-gray-500">{u?.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(req.createdAt).toLocaleDateString()}</span>
                </div>

                {req.message && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 italic">"{req.message}"</p>
                )}

                {req.status === 'pending' && (
                  <div className="space-y-2 pt-1 border-t border-gray-100">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setReviewNotes((n) => ({ ...n, [req._id]: e.target.value }))}
                      placeholder="Optional note to student…"
                      className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm" className="flex-1"
                        loading={approveMutation.isPending}
                        onClick={() => approveMutation.mutate({ id: req._id, note })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm" variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                        loading={rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate({ id: req._id, note })}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {req.status !== 'pending' && req.reviewNote && (
                  <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">
                    Note: {req.reviewNote}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Forum components ─────────────────────────────────────────────────────────

interface ForumThread {
  _id: string; authorName: string; authorRole: 'student' | 'instructor' | 'tenant_admin';
  title: string; body: string; tags: string[];
  isPinned: boolean; isResolved: boolean; isClosed: boolean;
  replyCount: number; views: number; likeCount: number; isLikedByMe: boolean;
  lastActivityAt: string; createdAt: string;
}

function forumTimeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ThreadCard({ thread, onClick }: { thread: ForumThread; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all p-4 group"
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-2 h-2 rounded-full mt-2 flex-shrink-0',
          thread.isPinned ? 'bg-amber-400' : thread.isResolved ? 'bg-green-400' : 'bg-gray-300'
        )} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1.5">
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors line-clamp-2 flex-1">
              {thread.title}
            </h3>
            <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
              {thread.isPinned   && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-medium">📌 Pinned</span>}
              {thread.isResolved && <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-1.5 py-0.5 rounded font-medium">✅ Resolved</span>}
              {thread.isClosed   && <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded font-medium">🔒 Closed</span>}
            </div>
          </div>
          <p className="text-xs text-gray-500 line-clamp-1 mb-2">{thread.body}</p>
          {thread.tags && thread.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {thread.tags.slice(0, 4).map(tag => (
                <span key={tag} className="text-[10px] bg-primary-50 text-primary-600 border border-primary-100 px-1.5 py-0.5 rounded-full font-medium">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className={cn('font-semibold', thread.authorRole === 'student' ? 'text-gray-600' : 'text-primary-600')}>
                {thread.authorName}
              </span>
              {thread.authorRole !== 'student' && (
                <span className="bg-primary-100 text-primary-700 px-1 py-0.5 rounded text-[9px] font-bold uppercase">
                  {thread.authorRole === 'tenant_admin' ? 'Admin' : 'Instructor'}
                </span>
              )}
            </span>
            <span>·</span>
            <span>{forumTimeAgo(thread.createdAt)}</span>
            <span className="ml-auto flex items-center gap-3">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {thread.replyCount}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {thread.views}
              </span>
              {thread.likeCount > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                  {thread.likeCount}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function CreateThreadModal({
  onClose, onCreate, title, setTitle, body, setBody, tags, setTags, error, isPending,
}: {
  onClose: () => void; onCreate: () => void;
  title: string; setTitle: (v: string) => void;
  body:  string; setBody:  (v: string) => void;
  tags:  string; setTags:  (v: string) => void;
  error: string; isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">New Thread</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">Title</label>
            <input
              autoFocus type="text" value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What's your question or topic?"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">Body</label>
            <textarea
              rows={5} value={body} onChange={e => setBody(e.target.value)}
              placeholder="Describe your question or thought in detail…"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              maxLength={5000}
            />
            <p className="text-[11px] text-gray-400 text-right mt-1">{body.length}/5000</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
              Tags <span className="font-normal text-gray-400">(optional, comma-separated)</span>
            </label>
            <input
              type="text" value={tags} onChange={e => setTags(e.target.value)}
              placeholder="e.g. question, help, week-3"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!title.trim() || !body.trim()} loading={isPending} onClick={onCreate}>
            Post Thread
          </Button>
        </div>
      </div>
    </div>
  );
}

function ForumTab({ courseId }: { courseId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [sort, setSort] = useState<'latest' | 'top' | 'unanswered'>('latest');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createBody,  setCreateBody]  = useState('');
  const [createTags,  setCreateTags]  = useState('');
  const [createError, setCreateError] = useState('');

  const { data, isLoading, isError } = useQuery<{
    threads: ForumThread[];
    pagination: { page: number; pages: number; total: number };
  }>({
    queryKey: ['forum-threads', courseId, sort, page],
    queryFn: async () => {
      const { data } = await api.get(`/forum/courses/${courseId}/threads?sort=${sort}&page=${page}&limit=15`);
      return data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/forum/courses/${courseId}/threads`, {
      title: createTitle.trim(),
      body:  createBody.trim(),
      tags:  createTags.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forum-threads', courseId] });
      setShowCreate(false);
      setCreateTitle(''); setCreateBody(''); setCreateTags(''); setCreateError('');
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setCreateError(err.response?.data?.message ?? 'Failed to create thread'),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">Forum</h2>
          {(data?.pagination?.total ?? 0) > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {data!.pagination.total} threads
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>+ New Thread</Button>
      </div>

      {/* Sort bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['latest', 'top', 'unanswered'] as const).map(s => (
          <button key={s} onClick={() => { setSort(s); setPage(1); }}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 -mb-px capitalize transition-colors',
              sort === s ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}>
            {s === 'unanswered' ? 'Unanswered' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : isError ? (
        <p className="text-sm text-center text-red-500 py-6">Failed to load forum threads.</p>
      ) : (data?.threads ?? []).length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600">No threads yet</p>
          <p className="text-xs text-gray-400 mt-1">Be the first to start a discussion!</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-xs font-semibold text-primary-600 hover:underline">
            Start a thread →
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {data!.threads.map(thread => (
            <ThreadCard key={thread._id} thread={thread}
              onClick={() => router.push(`/courses/${courseId}/forum/${thread._id}`)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data?.pagination && data.pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Previous</Button>
          <span className="text-xs text-gray-500">{page} of {data.pagination.pages}</span>
          <Button size="sm" variant="outline" disabled={page >= data.pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</Button>
        </div>
      )}

      {/* Create Thread Modal */}
      {showCreate && (
        <CreateThreadModal
          onClose={() => { setShowCreate(false); setCreateError(''); }}
          onCreate={() => createMutation.mutate()}
          title={createTitle} setTitle={setCreateTitle}
          body={createBody}   setBody={setCreateBody}
          tags={createTags}   setTags={setCreateTags}
          error={createError} isPending={createMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Waitlist Management Tab ─────────────────────────────────────────────────

interface WaitlistEntry {
  _id: string;
  position: number;
  joinedAt: string;
  userId: { _id: string; firstName: string; lastName: string; email: string; avatar?: string };
}

function WaitlistTab({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ entries: WaitlistEntry[]; total: number }>({
    queryKey: ['course-waitlist', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/waitlist`);
      return data.data as { entries: WaitlistEntry[]; total: number };
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/courses/${courseId}/waitlist/${userId}`),
    onSuccess: () => {
      setRemovingId(null);
      qc.invalidateQueries({ queryKey: ['course-waitlist', courseId] });
    },
  });

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Waitlist</h3>
          <p className="text-xs text-gray-400 mt-0.5">{data?.total ?? 0} student{(data?.total ?? 0) !== 1 ? 's' : ''} waiting for a seat</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-200 text-center">
          <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="font-medium text-gray-700">No one on the waitlist</p>
          <p className="text-xs text-gray-400 mt-1">Students will appear here when the course is full and waitlist is enabled.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Joined</th>
                <th className="px-5 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map((entry) => {
                const u = entry.userId;
                return (
                  <tr key={entry._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                        {entry.position}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        {u.avatar ? (
                          <img src={u.avatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-gray-500">
                            {u.firstName?.[0]}{u.lastName?.[0]}
                          </div>
                        )}
                        <span className="font-medium text-gray-900">{u.firstName} {u.lastName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-gray-500 text-xs">{u.email}</td>
                    <td className="px-5 py-3.5 hidden lg:table-cell text-gray-400 text-xs">
                      {new Date(entry.joinedAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {removingId === entry._id ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <button
                            onClick={() => removeMutation.mutate(u._id)}
                            disabled={removeMutation.isPending}
                            className="text-red-600 font-medium hover:text-red-800 disabled:opacity-50"
                          >
                            {removeMutation.isPending ? 'Removing…' : 'Confirm'}
                          </button>
                          <button onClick={() => setRemovingId(null)} className="text-gray-400 hover:text-gray-600">
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setRemovingId(entry._id)}
                          className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Instructor / Admin Builder ───────────────────────────────────────────────

type ActiveTab = 'overview' | 'curriculum' | 'students' | 'cohorts' | 'requests' | 'forum' | 'waitlist';

function InstructorView() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const qc = useQueryClient();
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [actionError, setActionError] = useState('');

  const { data: course, isLoading } = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}`);
      return data.data.course as Course;
    },
    staleTime: 30000,
  });

  const publishMutation = useMutation({
    mutationFn: () => api.patch(`/courses/${courseId}/publish`),
    onSuccess: () => {
      qc.setQueryData(['course', courseId], (old: Course | undefined) =>
        old ? { ...old, status: 'published' as const } : old
      );
      qc.invalidateQueries({ queryKey: ['courses'] });
      qc.invalidateQueries({ queryKey: ['course', courseId] });
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Action failed');
      setTimeout(() => setActionError(''), 4000);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.patch(`/courses/${courseId}/archive`),
    onSuccess: () => {
      qc.setQueryData(['course', courseId], (old: Course | undefined) =>
        old ? { ...old, status: 'archived' as const } : old
      );
      qc.invalidateQueries({ queryKey: ['courses'] });
      qc.invalidateQueries({ queryKey: ['course', courseId] });
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setActionError(err.response?.data?.message ?? 'Action failed');
      setTimeout(() => setActionError(''), 4000);
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-gray-500">Course not found.</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push('/courses')}>
          Back to Courses
        </Button>
      </div>
    );
  }

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: 'overview',    label: 'Overview' },
    { key: 'curriculum',  label: 'Curriculum' },
    { key: 'students',    label: `Students (${course.enrollmentCount})` },
    { key: 'cohorts',     label: 'Cohorts' },
    { key: 'forum',       label: 'Forum' },
    ...(course.enrollmentType === 'approval' ? [{ key: 'requests' as ActiveTab, label: 'Requests' }] : []),
    ...(course.waitlistEnabled ? [{ key: 'waitlist' as ActiveTab, label: 'Waitlist' }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push('/courses')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0 mt-0.5"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-gray-900 truncate">{course.title}</h1>
            <Badge variant={STATUS_BADGE[course.status] ?? 'default'}>{course.status}</Badge>
          </div>
          <p className="text-sm text-gray-500">
            {course.totalSections} section{course.totalSections !== 1 ? 's' : ''} ·{' '}
            {course.totalLessons} lesson{course.totalLessons !== 1 ? 's' : ''} ·{' '}
            {fmtDuration(course.totalDurationSeconds)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {course.status === 'draft' && (
            <Button loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
              Publish
            </Button>
          )}
          {course.status === 'published' && (
            <Button variant="outline" loading={archiveMutation.isPending}
              onClick={() => { if (confirm('Archive this course?')) archiveMutation.mutate(); }}>
              Archive
            </Button>
          )}
          {course.status === 'archived' && (
            <Button variant="outline" loading={publishMutation.isPending}
              onClick={() => publishMutation.mutate()}>
              Restore
            </Button>
          )}
        </div>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview'   && <OverviewTab courseId={courseId} course={course} />}
      {tab === 'curriculum' && <CurriculumTab courseId={courseId} />}
      {tab === 'students'   && <StudentsTab courseId={courseId} enrollmentCount={course.enrollmentCount} />}
      {tab === 'cohorts'    && <CohortsTab courseId={courseId} />}
      {tab === 'forum'      && <ForumTab courseId={courseId} />}
      {tab === 'requests'   && <EnrollmentRequestsTab courseId={courseId} />}
      {tab === 'waitlist'   && <WaitlistTab courseId={courseId} />}
    </div>
  );
}

// ─── Chat with Instructor Button ─────────────────────────────────────────────

function ChatWithInstructorButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await api.post('/chat', { courseId });
      const convId = res.data.data.conversation._id;
      router.push(`/chat/${convId}`);
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-xl transition-colors disabled:opacity-50"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      {loading ? 'Opening chat…' : 'Chat with Instructor'}
    </button>
  );
}

// ─── Stripe Payment Element form (used inside <Elements> wrapper) ────────────

function StripeCardForm({
  paymentId,
  clientSecret,
  amount,
  onSuccess,
}: {
  paymentId: string | null;
  clientSecret: string | null;
  amount: number;
  onSuccess: () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    if (!paymentId) return;
    setError('');
    setLoading(true);

    // Mock mode — confirm directly via backend
    if (!stripe || !elements || !clientSecret) {
      try {
        await api.post(`/payments/${paymentId}/confirm`);
        onSuccess();
      } catch (e: unknown) {
        setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Payment failed');
      } finally { setLoading(false); }
      return;
    }

    const { error: submitErr } = await elements.submit();
    if (submitErr) { setError(submitErr.message ?? 'Payment form error'); setLoading(false); return; }

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed');
      setLoading(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      try {
        await api.post(`/payments/${paymentId}/confirm`);
        onSuccess();
      } catch (e: unknown) {
        setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Enrollment failed');
      }
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2 text-xs text-gray-400 border-t border-gray-100 pt-3">
        <svg className="w-4 h-4 flex-shrink-0 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
        </svg>
        <span>Secured by Stripe · Supports cards, Apple Pay, Google Pay</span>
      </div>

      <Button className="w-full" loading={loading} onClick={handlePay}>
        Pay ${amount.toFixed(2)}
      </Button>
    </div>
  );
}

// ─── PayPal Form ──────────────────────────────────────────────────────────────

// Inner component — must be rendered inside a PayPalScriptProvider.
function PayPalButtonsInner({
  paymentId,
  paypalOrderId,
  onSuccess,
  onError,
}: {
  paymentId: string | null;
  paypalOrderId: string | null;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [{ isPending }] = usePayPalScriptReducer();

  if (isPending) {
    return <div className="flex justify-center py-4"><Spinner /></div>;
  }

  return (
    <PayPalButtons
      style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay', height: 45 }}
      createOrder={() => {
        if (!paypalOrderId) return Promise.reject(new Error('No PayPal order'));
        return Promise.resolve(paypalOrderId);
      }}
      onApprove={async () => {
        try {
          await api.post(`/payments/${paymentId}/paypal-capture`);
          onSuccess();
        } catch (e: unknown) {
          onError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'PayPal capture failed');
        }
      }}
      onError={(err) => {
        onError((err as { message?: string })?.message ?? 'PayPal encountered an error');
      }}
      onCancel={() => onError('Payment cancelled')}
    />
  );
}

// Outer wrapper — loads the PayPal SDK lazily only when this component mounts
// (i.e. only when the user selects PayPal as payment method).
function PayPalForm({
  paymentId,
  paypalOrderId,
  onSuccess,
  onError,
}: {
  paymentId: string | null;
  paypalOrderId: string | null;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  // Mock mode — no PayPal client ID configured
  if (!clientId) {
    return (
      <button
        className="w-full py-3 rounded-xl bg-[#FFC439] hover:bg-[#f0b429] text-[#003087] font-bold text-sm transition-colors flex items-center justify-center gap-2"
        onClick={async () => {
          try {
            await api.post(`/payments/${paymentId}/paypal-capture`);
            onSuccess();
          } catch (e: unknown) {
            onError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'PayPal payment failed');
          }
        }}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M7.076 21.337H2.47a.641.641 0 01-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 00-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 00-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 00.554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 01.923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/></svg>
        Pay with PayPal (mock)
      </button>
    );
  }

  // Real mode — PayPalScriptProvider mounts here, so the SDK script tag is only
  // injected when the user reaches the PayPal payment step.
  return (
    <PayPalScriptProvider options={{ clientId, currency: 'USD', intent: 'capture' }}>
      <PayPalButtonsInner
        paymentId={paymentId}
        paypalOrderId={paypalOrderId}
        onSuccess={onSuccess}
        onError={onError}
      />
    </PayPalScriptProvider>
  );
}

// ─── Student View ─────────────────────────────────────────────────────────────

function StudentView() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = params.id as string;
  const qc = useQueryClient();
  const [enrollError, setEnrollError] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [studentTab, setStudentTab] = useState<'overview' | 'forum'>(
    searchParams.get('tab') === 'forum' ? 'forum' : 'overview'
  );

  // ── Coupon state ─────────────────────────────────────────────────────────────
  const [showCoupon, setShowCoupon]   = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string; discountType: string; discountValue: number;
    discountAmount: number; finalPrice: number;
  } | null>(null);
  const [couponError, setCouponError] = useState('');

  // ── Access code state ─────────────────────────────────────────────────────────
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [accessCodeError, setAccessCodeError] = useState('');

  // ── Payment modal state ───────────────────────────────────────────────────────
  const [showPayment, setShowPayment]           = useState(false);
  const [paymentStep, setPaymentStep]           = useState<'method' | 'card' | 'paypal' | 'done'>('method');
  const [paymentId, setPaymentId]               = useState<string | null>(null);
  const [clientSecret, setClientSecret]         = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId]   = useState<string | null>(null);
  const [paypalOrderId, setPaypalOrderId]       = useState<string | null>(null);
  const [paypalError, setPaypalError]           = useState('');

  const { data: course, isLoading } = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}`);
      return data.data.course as Course;
    },
    staleTime: 30000,
  });

  const { data: sections } = useQuery({
    queryKey: ['sections', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/sections`);
      return (data.data.sections as Section[]).slice().sort((a, b) => a.order - b.order);
    },
    staleTime: 30000,
  });

  const { data: enrollments } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: async () => {
      const { data } = await api.get('/courses/my-enrollments');
      return data.data.enrollments as Array<{ courseId: { _id: string } }>;
    },
    staleTime: 30000,
  });

  const isEnrolled = enrollments?.some((e) => e.courseId?._id === courseId) ?? false;

  const { data: membershipAccess } = useQuery<{ hasAccess: boolean; planName?: string }>({
    queryKey: ['membership-access', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/membership/access/${courseId}`);
      return data.data;
    },
    enabled: !isEnrolled,
    staleTime: 60000,
  });

  const { data: progress } = useQuery({
    queryKey: ['course-progress', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/progress`);
      return data.data as { percentage: number; completedLessons: number; totalLessons: number };
    },
    enabled: isEnrolled,
    staleTime: 30000,
  });

  const couponMutation = useMutation({
    mutationFn: (code: string) =>
      api.post('/coupons/validate', { code, courseId, coursePrice: course?.price ?? 0 }),
    onSuccess: (res) => {
      setAppliedCoupon(res.data.data);
      setCouponError('');
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setCouponError(err.response?.data?.message ?? 'Invalid coupon code');
      setAppliedCoupon(null);
    },
  });

  const enrollMutation = useMutation({
    mutationFn: () => api.post(`/courses/${courseId}/enroll`, {
      couponCode: appliedCoupon?.code ?? undefined,
      accessCode: accessCodeInput.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-enrollments'] });
      qc.invalidateQueries({ queryKey: ['course-progress', courseId] });
      setAccessCodeError('');
    },
    onError: (err: AxiosError<{ message: string; code?: string }>) => {
      const code = (err.response?.data as { code?: string })?.code;
      if (code === 'ACCESS_CODE_INVALID' || code === 'ACCESS_CODE_REQUIRED') {
        setAccessCodeError(err.response?.data?.message ?? 'Invalid access code');
      } else {
        setEnrollError(err.response?.data?.message ?? 'Failed to enroll');
        setTimeout(() => setEnrollError(''), 4000);
      }
    },
  });

  // ── Payment mutations ─────────────────────────────────────────────────────────
  const initPaymentMutation = useMutation({
    mutationFn: (provider: 'stripe' | 'paypal') => api.post(`/payments/courses/${courseId}/initiate`, {
      couponCode: appliedCoupon?.code ?? undefined,
      provider,
    }),
    onSuccess: (res, provider) => {
      const d = res.data.data;
      setPaymentId(d.paymentId);
      if (provider === 'paypal') {
        setPaypalOrderId(d.paypalOrderId ?? null);
        setPaypalError('');
        setPaymentStep('paypal');
      } else {
        setClientSecret(d.clientSecret ?? null);
        setStripeAccountId(d.stripeAccountId ?? null);
        setPaymentStep('card');
      }
      setShowPayment(true);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setEnrollError(err.response?.data?.message ?? 'Failed to initiate payment');
      setTimeout(() => setEnrollError(''), 4000);
    },
  });

  const trialMutation = useMutation({
    mutationFn: () => api.post(`/payments/courses/${courseId}/trial`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-enrollments'] });
      qc.invalidateQueries({ queryKey: ['course-progress', courseId] });
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setEnrollError(err.response?.data?.message ?? 'Failed to start trial');
      setTimeout(() => setEnrollError(''), 4000);
    },
  });

  // ── Enrollment approval ───────────────────────────────────────────────────────
  const { data: myRequest, refetch: refetchMyRequest } = useQuery({
    queryKey: ['enrollment-request', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/enrollment-requests/my`);
      return data.data.request as {
        status: 'pending' | 'approved' | 'rejected';
        message: string;
        reviewNote: string;
      } | null;
    },
    enabled: !isEnrolled && course?.enrollmentType === 'approval',
    staleTime: 30000,
  });

  const [requestMessage, setRequestMessage] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);

  const requestMutation = useMutation({
    mutationFn: () => api.post(`/courses/${courseId}/enrollment-requests/my`, { message: requestMessage }),
    onSuccess: () => { refetchMyRequest(); setShowRequestForm(false); },
    onError: (err: AxiosError<{ message: string }>) => {
      setEnrollError(err.response?.data?.message ?? 'Failed to submit request');
      setTimeout(() => setEnrollError(''), 4000);
    },
  });

  // ── Waitlist ──────────────────────────────────────────────────────────────────
  const isFull = (course?.capacity ?? 0) > 0 && (course?.enrollmentCount ?? 0) >= (course?.capacity ?? 0);

  const { data: waitlistPos, refetch: refetchWaitlist } = useQuery({
    queryKey: ['waitlist-pos', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/waitlist/my`);
      return data.data.position as { position: number; total: number } | null;
    },
    enabled: !isEnrolled && (course?.waitlistEnabled ?? false),
    staleTime: 30000,
  });

  const joinWaitlistMutation = useMutation({
    mutationFn: () => api.post(`/courses/${courseId}/waitlist`),
    onSuccess: () => refetchWaitlist(),
    onError: (err: AxiosError<{ message: string }>) => {
      setEnrollError(err.response?.data?.message ?? 'Failed to join waitlist');
      setTimeout(() => setEnrollError(''), 4000);
    },
  });

  const leaveWaitlistMutation = useMutation({
    mutationFn: () => api.delete(`/courses/${courseId}/waitlist`),
    onSuccess: () => refetchWaitlist(),
  });

  const toggleSection = (id: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (isLoading) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-gray-500">Course not found.</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push('/courses')}>
          Back to Courses
        </Button>
      </div>
    );
  }

  const layout = course.displayLayout ?? 'classic';
  const levelVariant = course.level === 'beginner' ? 'success' : course.level === 'intermediate' ? 'warning' : ('danger' as const);

  const isPaidUnenrolled = !isEnrolled && !course.isFree && (course.price ?? 0) > 0;
  const requiresAccessCode = !isEnrolled && course.enrollmentType === 'access_code' && !isFull;
  const requiresApproval   = !isEnrolled && course.enrollmentType === 'approval';

  // Feature 4 — Enrollment window
  const now = new Date();
  const windowNotOpen = course.enrollmentStartsAt ? now < new Date(course.enrollmentStartsAt) : false;
  const windowClosed  = course.enrollmentEndsAt   ? now > new Date(course.enrollmentEndsAt)   : false;
  const enrollmentBlocked = !isEnrolled && (windowNotOpen || windowClosed);

  // Feature 3 — Prerequisites (populated from getCourse)
  const prereqs = (course.prerequisites ?? []) as Array<{ _id: string; title: string }>;
  const hasPrereqs = !isEnrolled && prereqs.length > 0;

  // Feature 1 — Access expiry (from enrollment record, if returned)
  type EnrollmentWithExpiry = { courseId: { _id: string }; expiresAt?: string };
  const myEnrollment = enrollments?.find(e => e.courseId?._id === courseId) as EnrollmentWithExpiry | undefined;
  const accessExpiresAt = myEnrollment?.expiresAt ? new Date(myEnrollment.expiresAt) : null;
  const accessExpired   = accessExpiresAt ? accessExpiresAt < now : false;
  const daysLeft = accessExpiresAt && !accessExpired
    ? Math.ceil((accessExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const displayPrice = appliedCoupon
    ? appliedCoupon.finalPrice
    : (course.price ?? 0);

  // ── Payment modal ─────────────────────────────────────────────────────────────
  const onPaymentSuccess = () => {
    setPaymentStep('done');
    qc.invalidateQueries({ queryKey: ['my-enrollments'] });
    qc.invalidateQueries({ queryKey: ['course-progress', courseId] });
  };

  const paymentModal = showPayment && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">

        {/* ── Success ── */}
        {paymentStep === 'done' && (
          <>
            <div className="flex flex-col items-center py-4 space-y-3">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">Payment successful!</p>
              <p className="text-sm text-gray-500">You are now enrolled. Enjoy the course!</p>
            </div>
            <Button className="w-full" onClick={() => { setShowPayment(false); router.push(`/courses/${courseId}/learn`); }}>
              Start Learning
            </Button>
          </>
        )}

        {/* ── Method selector ── */}
        {paymentStep === 'method' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Choose Payment Method</h2>
              <button onClick={() => setShowPayment(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate">{course.title}</span>
              <span className="text-base font-bold text-gray-900 ml-3 flex-shrink-0">${displayPrice.toFixed(2)}</span>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => initPaymentMutation.mutate('stripe')}
                disabled={initPaymentMutation.isPending}
                className="w-full py-3.5 rounded-xl border-2 border-gray-200 hover:border-primary-400 bg-white flex items-center gap-4 px-4 transition-all disabled:opacity-50"
              >
                <div className="w-10 h-7 bg-gradient-to-r from-indigo-500 to-purple-600 rounded flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-4 text-white" viewBox="0 0 38 24" fill="currentColor">
                    <rect width="38" height="24" rx="4" fill="none"/>
                    <path d="M35 0H3C1.3 0 0 1.3 0 3v18c0 1.7 1.4 3 3 3h32c1.7 0 3-1.3 3-3V3c0-1.7-1.4-3-3-3zm0 22H3V2h32v20z" fill="currentColor" opacity=".3"/>
                    <path d="M15 14.9c-.5.3-1 .4-1.7.4-1.7 0-2.9-1.2-2.9-2.9 0-1.6 1.2-2.9 2.9-2.9.7 0 1.3.2 1.7.5l.9-1c-.7-.5-1.6-.8-2.6-.8-2.4 0-4.3 1.8-4.3 4.2s1.9 4.2 4.3 4.2c1 0 2-.3 2.7-.9l-.9-.8z" fill="currentColor"/>
                    <path d="M20.4 9.2c-2.4 0-4.3 1.8-4.3 4.2s1.9 4.2 4.3 4.2 4.3-1.8 4.3-4.2-1.9-4.2-4.3-4.2zm0 7c-1.6 0-2.9-1.2-2.9-2.8s1.3-2.8 2.9-2.8 2.9 1.2 2.9 2.8-1.3 2.8-2.9 2.8z" fill="currentColor"/>
                  </svg>
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-gray-900">Credit / Debit Card</p>
                  <p className="text-xs text-gray-400">Visa, Mastercard, Amex</p>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>

              <button
                onClick={() => initPaymentMutation.mutate('paypal')}
                disabled={initPaymentMutation.isPending}
                className="w-full py-3.5 rounded-xl border-2 border-gray-200 hover:border-[#FFC439] bg-white flex items-center gap-4 px-4 transition-all disabled:opacity-50"
              >
                <div className="w-10 h-7 bg-[#003087] rounded flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#009cde]" fill="currentColor">
                    <path d="M7.076 21.337H2.47a.641.641 0 01-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 00-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 00-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 00.554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 01.923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/>
                  </svg>
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-gray-900">PayPal</p>
                  <p className="text-xs text-gray-400">Pay with your PayPal account</p>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>

            {initPaymentMutation.isPending && (
              <div className="flex justify-center pt-2"><Spinner /></div>
            )}
          </>
        )}

        {/* ── Stripe card step ── */}
        {paymentStep === 'card' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setPaymentStep('method')} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-gray-900 flex-1">Card Payment</h2>
              <button onClick={() => setShowPayment(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate">{course.title}</span>
              <span className="text-base font-bold text-gray-900 ml-3 flex-shrink-0">${displayPrice.toFixed(2)}</span>
            </div>

            <Elements
              stripe={
                stripeAccountId && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
                  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, { stripeAccount: stripeAccountId })
                  : getStripePromise()
              }
              options={clientSecret ? { clientSecret, appearance: { theme: 'stripe' } } : undefined}
            >
              <StripeCardForm
                paymentId={paymentId}
                clientSecret={clientSecret}
                amount={displayPrice}
                onSuccess={onPaymentSuccess}
              />
            </Elements>
          </>
        )}

        {/* ── PayPal step ── */}
        {paymentStep === 'paypal' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setPaymentStep('method')} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-gray-900 flex-1">Pay with PayPal</h2>
              <button onClick={() => setShowPayment(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate">{course.title}</span>
              <span className="text-base font-bold text-gray-900 ml-3 flex-shrink-0">${displayPrice.toFixed(2)}</span>
            </div>

            {paypalError && <p className="text-sm text-red-600">{paypalError}</p>}

            <PayPalForm
              paymentId={paymentId}
              paypalOrderId={paypalOrderId}
              onSuccess={onPaymentSuccess}
              onError={(msg) => setPaypalError(msg)}
            />
          </>
        )}

      </div>
    </div>
  );

  const ctaButton = isEnrolled ? (
    <div className="space-y-3">
      {/* Feature 1 — Expiry banner */}
      {accessExpired ? (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
          </svg>
          Your access to this course has expired. Contact your instructor to extend.
        </div>
      ) : daysLeft !== null && daysLeft <= 7 ? (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
          </svg>
          Access expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''} — {accessExpiresAt!.toLocaleDateString()}
        </div>
      ) : accessExpiresAt ? (
        <p className="text-xs text-gray-400">Access until {accessExpiresAt.toLocaleDateString()}</p>
      ) : null}
      <Button onClick={() => router.push(`/courses/${courseId}/learn`)} disabled={accessExpired}>
        {accessExpired ? 'Access Expired' : 'Continue Learning'}
      </Button>
      {!accessExpired && (
        <ChatWithInstructorButton courseId={courseId} />
      )}
    </div>
  ) : (
    <div className="space-y-3">
      {/* Feature 4 — Enrollment window blocked */}
      {enrollmentBlocked && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600">
          <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          {windowNotOpen
            ? `Enrollment opens ${new Date(course.enrollmentStartsAt!).toLocaleDateString()}`
            : `Enrollment closed ${new Date(course.enrollmentEndsAt!).toLocaleDateString()}`}
        </div>
      )}

      {/* Feature 3 — Prerequisites checklist */}
      {hasPrereqs && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 space-y-2">
          <p className="text-sm font-medium text-amber-800">Complete these courses first:</p>
          <ul className="space-y-1">
            {prereqs.map((p) => (
              <li key={p._id} className="flex items-center gap-2 text-sm text-amber-700">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                {p.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Access code input */}
      {requiresAccessCode && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span>This course requires an access code to enroll.</span>
          </div>
          <input
            type="text"
            value={accessCodeInput}
            onChange={(e) => { setAccessCodeInput(e.target.value); setAccessCodeError(''); }}
            placeholder="Enter access code"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          {accessCodeError && (
            <p className="text-xs text-red-600">{accessCodeError}</p>
          )}
        </div>
      )}
      {/* Membership access badge */}
      {isPaidUnenrolled && membershipAccess?.hasAccess && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span className="text-sm text-green-700 font-medium">
            Included in your <span className="font-bold">{membershipAccess.planName}</span> membership
          </span>
        </div>
      )}

      {/* Price display */}
      {isPaidUnenrolled && (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900">
            ${displayPrice.toFixed(2)}
          </span>
          {appliedCoupon && (
            <>
              <span className="text-sm line-through text-gray-400">${(course.price ?? 0).toFixed(2)}</span>
              <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                Save ${appliedCoupon.discountAmount.toFixed(2)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Coupon toggle (paid courses only) */}
      {isPaidUnenrolled && !appliedCoupon && (
        <button
          type="button"
          className="text-sm text-primary-600 hover:text-primary-700 underline underline-offset-2"
          onClick={() => setShowCoupon((v) => !v)}
        >
          {showCoupon ? 'Hide coupon field' : 'Have a coupon code?'}
        </button>
      )}

      {/* Coupon input */}
      {isPaidUnenrolled && showCoupon && !appliedCoupon && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              placeholder="Enter coupon code"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <Button
              size="sm"
              variant="outline"
              loading={couponMutation.isPending}
              disabled={!couponInput.trim()}
              onClick={() => couponMutation.mutate(couponInput.trim())}
            >
              Apply
            </Button>
          </div>
          {couponError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {couponError}
            </p>
          )}
        </div>
      )}

      {/* Applied coupon confirmation */}
      {isPaidUnenrolled && appliedCoupon && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-green-800">
              <span className="font-mono">{appliedCoupon.code}</span> applied —{' '}
              {appliedCoupon.discountType === 'percentage'
                ? `${appliedCoupon.discountValue}% off`
                : `$${appliedCoupon.discountValue} off`}
            </span>
          </div>
          <button
            type="button"
            className="text-xs text-green-600 hover:text-green-800 underline"
            onClick={() => { setAppliedCoupon(null); setCouponInput(''); }}
          >
            Remove
          </button>
        </div>
      )}

      {/* Capacity full + waitlist enabled */}
      {isFull && course.waitlistEnabled ? (
        waitlistPos ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">
                  You're #{waitlistPos.position} on the waitlist
                </p>
                <p className="text-xs text-amber-600">{waitlistPos.total} people waiting</p>
              </div>
            </div>
            <button
              type="button"
              className="w-full text-sm text-red-600 hover:text-red-700 underline underline-offset-2 text-center"
              onClick={() => leaveWaitlistMutation.mutate()}
            >
              {leaveWaitlistMutation.isPending ? 'Leaving…' : 'Leave waitlist'}
            </button>
          </div>
        ) : (
          <Button
            className="w-full"
            variant="outline"
            loading={joinWaitlistMutation.isPending}
            onClick={() => joinWaitlistMutation.mutate()}
          >
            Join Waitlist
          </Button>
        )
      ) : isFull ? (
        <Button className="w-full" disabled>Course Full</Button>
      ) : requiresApproval ? (
        /* Approval flow */
        myRequest ? (
          <div className="space-y-2">
            {myRequest.status === 'pending' && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-blue-800">Request pending review</p>
                  <p className="text-xs text-blue-600">You'll be enrolled once an instructor approves.</p>
                </div>
              </div>
            )}
            {myRequest.status === 'rejected' && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-red-800">Request was not approved</p>
                    {myRequest.reviewNote && <p className="text-xs text-red-600 mt-0.5">{myRequest.reviewNote}</p>}
                  </div>
                </div>
                <Button
                  className="w-full" variant="outline"
                  loading={requestMutation.isPending}
                  onClick={() => requestMutation.mutate()}
                >
                  Resubmit Request
                </Button>
              </div>
            )}
          </div>
        ) : showRequestForm ? (
          <div className="space-y-2">
            <textarea
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
              rows={3}
              placeholder="Optional: explain why you'd like to join this course…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowRequestForm(false)}>Cancel</Button>
              <Button
                className="flex-1"
                loading={requestMutation.isPending}
                onClick={() => requestMutation.mutate()}
              >
                Submit Request
              </Button>
            </div>
          </div>
        ) : (
          <Button className="w-full" variant="outline" onClick={() => setShowRequestForm(true)}>
            Request Access
          </Button>
        )
      ) : (
        /* Enroll / Buy button */
        <div className="space-y-2">
          <Button
            className="w-full"
            loading={enrollMutation.isPending || initPaymentMutation.isPending}
            disabled={enrollmentBlocked || hasPrereqs}
            onClick={() => {
              if (course.isFree || membershipAccess?.hasAccess) {
                enrollMutation.mutate();
              } else {
                setPaymentStep('method');
                setShowPayment(true);
              }
            }}
          >
            {enrollmentBlocked
              ? (windowNotOpen ? 'Enrollment Not Open Yet' : 'Enrollment Closed')
              : hasPrereqs
              ? 'Complete Prerequisites First'
              : (course.isFree || membershipAccess?.hasAccess)
              ? 'Enroll Free'
              : appliedCoupon
              ? `Buy for $${displayPrice.toFixed(2)}`
              : `Buy Now — $${displayPrice.toFixed(2)}`}
          </Button>

          {/* Feature 11 — Trial button */}
          {!enrollmentBlocked && !hasPrereqs && !course.isFree && course.trialEnabled && (
            <Button
              className="w-full"
              variant="outline"
              loading={trialMutation.isPending}
              onClick={() => trialMutation.mutate()}
            >
              Start Free {course.trialDurationDays ?? 7}-Day Trial
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const backButton = (
    <button onClick={() => router.push('/courses')}
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back to Courses
    </button>
  );

  const curriculumContent = (sections ?? []).length > 0 ? (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Course Content</h2>
      {(sections ?? []).map((section) => {
        const expanded = expandedSections.has(section._id);
        const lessons = section.lessons ?? [];
        return (
          <div key={section._id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
              onClick={() => toggleSection(section._id)}
            >
              <svg
                className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="flex-1 font-medium text-sm text-gray-900">{section.title}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
                {section.totalDurationSeconds ? ` · ${fmtDuration(section.totalDurationSeconds)}` : ''}
              </span>
            </button>
            {expanded && (
              <div className="divide-y divide-gray-50">
                {lessons.map((lesson) => {
                  const accessible = isEnrolled || lesson.isPreview;
                  return (
                    <button
                      key={lesson._id}
                      disabled={!accessible}
                      onClick={() => router.push(`/courses/${courseId}/learn?lessonId=${lesson._id}`)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2 group',
                        accessible
                          ? 'cursor-pointer hover:bg-primary-50 hover:border-primary-400 border-transparent'
                          : 'opacity-50 cursor-not-allowed border-transparent'
                      )}
                    >
                      {/* Type icon */}
                      <div className={cn(
                        'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                        accessible ? 'bg-gray-100 group-hover:bg-primary-100' : 'bg-gray-100'
                      )}>
                        {lesson.type === 'video' && (
                          <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                        {lesson.type === 'quiz' && (
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        )}
                        {(lesson.type === 'text' || lesson.type === 'file') && (
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                      </div>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          'block text-sm truncate',
                          accessible ? 'text-gray-800 group-hover:text-primary-700 font-medium' : 'text-gray-500'
                        )}>
                          {lesson.title}
                        </span>
                        {lesson.video && (
                          <span className="text-xs text-gray-400">{fmtDuration(lesson.video.durationSeconds)}</span>
                        )}
                      </div>

                      {/* Right badges */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {lesson.isPreview && (
                          <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-medium">Preview</span>
                        )}
                        {!accessible ? (
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  ) : null;

  // ── Hero layout ──────────────────────────────────────────────────────────────
  if (layout === 'hero') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {paymentModal}
        {backButton}
        {enrollError && <Alert variant="error">{enrollError}</Alert>}

        {/* Hero Banner */}
        <div className="relative rounded-2xl overflow-hidden h-64 bg-gradient-to-br from-primary-700 to-primary-900">
          {course.thumbnail && (
            <img src={course.thumbnail} alt={course.title}
              className="absolute inset-0 w-full h-full object-cover opacity-40" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-6">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={levelVariant}>{LEVEL_LABEL[course.level]}</Badge>
              {course.isFree
                ? <span className="text-xs bg-green-500/90 text-white px-2 py-0.5 rounded-full font-medium">Free</span>
                : <span className="text-sm font-bold text-white bg-black/30 px-2.5 py-0.5 rounded-full">${course.price}</span>
              }
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight">{course.title}</h1>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap px-1">
          <span>{course.totalLessons} lessons</span>
          <span className="text-gray-300">·</span>
          <span>{fmtDuration(course.totalDurationSeconds)}</span>
          <span className="text-gray-300">·</span>
          <span>{course.enrollmentCount} students</span>
        </div>

        {/* About */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-3.5 border-b border-gray-100 bg-gray-50">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-700">About this Course</h2>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-gray-700 leading-7 break-words whitespace-pre-line">
              {course.description || 'No description has been provided for this course.'}
            </p>
          </div>
        </div>

        {/* Progress */}
        {isEnrolled && progress && (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between text-sm mb-2.5">
              <span className="font-medium text-gray-700">Your progress</span>
              <span className="font-semibold text-primary-600">{progress.percentage ?? 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div className="bg-primary-600 h-2.5 rounded-full transition-all" style={{ width: `${progress.percentage ?? 0}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {progress.completedLessons ?? 0} of {progress.totalLessons ?? 0} lessons completed
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-4">
          {ctaButton}
        </div>

        {curriculumContent}
      </div>
    );
  }

  // ── Minimal layout ───────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {paymentModal}
        {backButton}
        {enrollError && <Alert variant="error">{enrollError}</Alert>}

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold text-gray-900 leading-tight">{course.title}</h1>
            <span className="text-xl font-bold flex-shrink-0">
              {course.isFree ? <span className="text-green-600">Free</span> : `$${course.price}`}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant={levelVariant}>{LEVEL_LABEL[course.level]}</Badge>
            <span className="text-sm text-gray-500">
              {course.totalLessons} lessons · {fmtDuration(course.totalDurationSeconds)} · {course.enrollmentCount} students
            </span>
          </div>
        </div>

        {/* About */}
        <div className="border-l-4 border-primary-200 bg-primary-50/40 rounded-r-xl px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-400 mb-2">About this Course</p>
          <p className="text-sm text-gray-700 leading-7 break-words whitespace-pre-line">
            {course.description || 'No description has been provided for this course.'}
          </p>
        </div>

        {isEnrolled && progress && (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="flex items-center justify-between text-sm mb-2.5">
              <span className="font-medium text-gray-700">Your progress</span>
              <span className="font-semibold text-primary-600">{progress.percentage ?? 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div className="bg-primary-600 h-2.5 rounded-full transition-all" style={{ width: `${progress.percentage ?? 0}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {progress.completedLessons ?? 0} of {progress.totalLessons ?? 0} lessons completed
            </p>
          </div>
        )}

        {ctaButton}

        {curriculumContent}
      </div>
    );
  }

  // ── Classic layout (default) — Premium redesign ──────────────────────────────
  return (
    <div className="min-h-screen -mt-6 -mx-6">
      {paymentModal}

      {/* ── Full-width Hero Banner ── */}
      <div className="relative h-72 md:h-80 bg-gradient-to-br from-gray-900 to-gray-800 overflow-hidden">
        {course.thumbnail ? (
          <img src={course.thumbnail} alt={course.title}
            className="absolute inset-0 w-full h-full object-cover opacity-40" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-primary-800 to-blue-900 opacity-80" />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8 max-w-5xl mx-auto w-full">
          {/* Back + badges row */}
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.push('/courses')}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide',
              course.level === 'beginner' ? 'bg-emerald-500 text-white'
              : course.level === 'intermediate' ? 'bg-amber-500 text-white'
              : course.level === 'advanced' ? 'bg-red-500 text-white'
              : 'bg-gray-600 text-white')}>
              {LEVEL_LABEL[course.level]}
            </span>
            <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide',
              course.isFree ? 'bg-green-500 text-white' : 'bg-white/20 text-white backdrop-blur-sm')}>
              {course.isFree ? 'FREE' : `$${course.price}`}
            </span>
            {isEnrolled && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary-500 text-white uppercase tracking-wide flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                </svg>
                Enrolled
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight max-w-2xl">{course.title}</h1>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-3 text-xs text-white/70 flex-wrap">
            {course.totalLessons > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13"/>
                </svg>
                {course.totalLessons} lessons
              </span>
            )}
            {fmtDuration(course.totalDurationSeconds) && (
              <>
                <span className="text-white/30">·</span>
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  {fmtDuration(course.totalDurationSeconds)}
                </span>
              </>
            )}
            <span className="text-white/30">·</span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {course.enrollmentCount} students
            </span>
          </div>
        </div>
      </div>

      {/* ── Main content area ── */}
      <div className="max-w-5xl mx-auto px-6 md:px-8 py-8">
        {enrollError && <Alert variant="error" className="mb-6">{enrollError}</Alert>}

        <div className="flex flex-col lg:flex-row gap-8">

          {/* ── Left column (main) ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Tab bar — enrolled students only */}
            {isEnrolled && (
              <div className="border-b border-gray-200">
                <nav className="flex gap-1">
                  {([
                    { key: 'overview' as const, label: 'Overview' },
                    { key: 'forum'    as const, label: 'Forum' },
                  ]).map(({ key, label }) => (
                    <button key={key} onClick={() => setStudentTab(key)}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        studentTab === key
                          ? 'border-primary-600 text-primary-700'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}>
                      {label}
                    </button>
                  ))}
                </nav>
              </div>
            )}

            {/* Forum tab content */}
            {isEnrolled && studentTab === 'forum' && (
              <ForumTab courseId={courseId} />
            )}

            {/* Progress (if enrolled) */}
            {isEnrolled && studentTab === 'overview' && progress && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-gray-800">Your Progress</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {progress.completedLessons} of {progress.totalLessons} lessons completed
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={cn('text-2xl font-extrabold',
                        (progress.percentage ?? 0) === 100 ? 'text-emerald-600'
                        : (progress.percentage ?? 0) > 50 ? 'text-blue-600'
                        : 'text-primary-600')}>
                        {progress.percentage ?? 0}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-700',
                      (progress.percentage ?? 0) === 100 ? 'bg-emerald-500'
                      : (progress.percentage ?? 0) > 50 ? 'bg-blue-500'
                      : 'bg-primary-600')}
                      style={{ width: `${progress.percentage ?? 0}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* About */}
            {(!isEnrolled || studentTab === 'overview') && course.description && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 bg-gray-50">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold text-gray-800">About this Course</h2>
                </div>
                <div className="px-5 py-5">
                  <p className="text-sm text-gray-700 leading-8 break-words whitespace-pre-line">
                    {course.description}
                  </p>
                  {/* Tags */}
                  {course.tags && course.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-gray-100">
                      {course.tags.map(tag => (
                        <span key={tag} className="text-xs bg-primary-50 text-primary-600 border border-primary-100 px-2.5 py-1 rounded-full font-medium">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Curriculum */}
            {(!isEnrolled || studentTab === 'overview') && curriculumContent && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 bg-gray-50">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h7" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold text-gray-800">Course Content</h2>
                  <span className="ml-auto text-xs text-gray-400">{course.totalLessons} lessons</span>
                </div>
                <div className="px-5 py-4">
                  {curriculumContent}
                </div>
              </div>
            )}
          </div>

          {/* ── Right sidebar — Enrollment card ── */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <div className="sticky top-6 bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">

              {/* Thumbnail preview */}
              <div className="relative h-40 bg-gray-100 overflow-hidden">
                {course.thumbnail ? (
                  <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-blue-100 flex items-center justify-center">
                    <svg className="w-12 h-12 text-primary-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Price */}
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={cn('text-3xl font-extrabold', course.isFree ? 'text-emerald-600' : 'text-gray-900')}>
                    {course.isFree ? 'Free' : `$${displayPrice.toFixed(2)}`}
                  </span>
                  {appliedCoupon && !course.isFree && (
                    <span className="text-sm line-through text-gray-400">${(course.price ?? 0).toFixed(2)}</span>
                  )}
                </div>
                {appliedCoupon && (
                  <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                    You save ${appliedCoupon.discountAmount.toFixed(2)}
                  </span>
                )}
              </div>

              {/* CTA section */}
              <div className="px-5 pb-5 space-y-3">
                {ctaButton}

                {/* Course meta */}
                <div className="border-t border-gray-100 pt-4 space-y-2.5">
                  {[
                    { icon: '📚', label: 'Lessons', value: `${course.totalLessons} lessons` },
                    { icon: '⏱', label: 'Duration', value: fmtDuration(course.totalDurationSeconds) ?? '—' },
                    { icon: '👥', label: 'Students', value: `${course.enrollmentCount} enrolled` },
                    { icon: '📊', label: 'Level', value: LEVEL_LABEL[course.level] ?? course.level },
                    ...(course.certificateEnabled ? [{ icon: '🏆', label: 'Certificate', value: 'Included' }] : []),
                  ].map(({ icon, label, value }) => value && (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 flex items-center gap-1.5">
                        <span>{icon}</span>{label}
                      </span>
                      <span className="font-semibold text-gray-800">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page Entry Point ─────────────────────────────────────────────────────────

export default function CourseDetailPage() {
  const user = useAuthStore((s) => s.user);
  return user?.role === 'student' ? <StudentView /> : <InstructorView />;
}
