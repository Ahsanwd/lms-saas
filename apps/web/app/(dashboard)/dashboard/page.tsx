'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { PageLoader } from '@/components/ui';

// Auto-dispatch based on role
export default function DashboardIndexPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'super_admin') router.replace('/admin/dashboard');
    else if (user.role === 'tenant_admin') router.replace('/dashboard/tenant-admin');
    else if (user.role === 'instructor') router.replace('/dashboard/instructor');
    else router.replace('/dashboard/student');
  }, [user]);

  return <PageLoader />;
}
