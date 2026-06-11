'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import type { Role } from '@/types';

export function useAuth(requiredRoles?: Role[]) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, fetchMe } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      fetchMe();
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
    if (!isLoading && isAuthenticated && user && requiredRoles) {
      if (!requiredRoles.includes(user.role)) {
        router.replace('/dashboard');
      }
    }
  }, [isAuthenticated, isLoading, user]);

  return { user, isAuthenticated, isLoading };
}
