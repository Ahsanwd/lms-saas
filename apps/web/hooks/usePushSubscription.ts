'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushSubscription() {
  const [permission, setPermission]     = useState<PushPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [vapidKey, setVapidKey]         = useState<string | null>(null);
  const isSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  // Fetch VAPID public key and register service worker
  useEffect(() => {
    if (!isSupported) return;

    // Register service worker
    navigator.serviceWorker.register('/sw.js').catch(() => {});

    // Fetch VAPID key
    api.get('/push/vapid-key').then(res => {
      setVapidKey(res.data?.data?.key ?? null);
    }).catch(() => {});

    // Sync current permission + subscription state
    setPermission(Notification.permission as PushPermission);
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setIsSubscribed(!!sub);
      });
    }).catch(() => {});
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !vapidKey) return false;
    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setPermission(permission as PushPermission);
      if (permission !== 'granted') return false;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api.post('/push/subscribe', {
        endpoint:  subJson.endpoint,
        keys:      subJson.keys,
        userAgent: navigator.userAgent,
      });

      setIsSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, vapidKey]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setIsSubscribed(false); return true; }

      await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
      setIsSubscribed(false);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, permission, isLoading, subscribe, unsubscribe };
}
