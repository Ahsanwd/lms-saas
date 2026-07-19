'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

interface JoinResult {
  platform: string;
  roomName?: string;
  token?: string;
  meetingUrl?: string;
}

export default function LiveRoomPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [join, setJoin] = useState<JoinResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.post(`/live/lessons/${lessonId}/join`)
      .then(({ data }) => {
        if (cancelled) return;
        const result = data.data as JoinResult;
        if (result.platform !== 'livekit' || !result.token) {
          // Legacy platform somehow landed here — bounce back to the lesson.
          router.replace(`/courses`);
          return;
        }
        setJoin(result);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.message ?? 'Could not join this live class.');
        setState('error');
      });
    return () => { cancelled = true; };
  }, [lessonId, router]);

  if (state === 'loading') {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-gray-900 text-white">
        <Spinner size="lg" />
        <p className="text-sm text-gray-400">Connecting to live class…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gray-900 text-white px-4">
        <p className="text-lg font-semibold">Can't join this live class</p>
        <p className="text-sm text-gray-400 text-center max-w-sm">{error}</p>
        <Button variant="outline" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900">
      <LiveKitRoom
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
        token={join!.token}
        video={false}
        audio={false}
        onDisconnected={() => router.back()}
        data-lk-theme="default"
        style={{ height: '100%' }}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
