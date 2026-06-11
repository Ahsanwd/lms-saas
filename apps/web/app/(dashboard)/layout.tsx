'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { PageLoader } from '@/components/ui';
import { applyBrandColor } from '@/lib/brandColor';
import api from '@/lib/api';
import type { Role } from '@/types';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, fetchMe, impersonation } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on navigation (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Fetch tenant settings to apply brand color
  const { data: tenantData } = useQuery({
    queryKey: ['tenant-settings-brand'],
    queryFn: async () => {
      const { data } = await api.get('/tenant');
      return data.data;
    },
    enabled: isAuthenticated && user?.role !== 'super_admin',
    staleTime: 5 * 60 * 1000,
  });

  // Apply brand color whenever tenant settings change
  useEffect(() => {
    const color = tenantData?.tenant?.settings?.primaryColor;
    if (color) applyBrandColor(color);
  }, [tenantData]);

  const tenantLogo    = tenantData?.tenant?.settings?.logo    ?? undefined;
  const tenantFavicon = tenantData?.tenant?.settings?.favicon ?? undefined;
  const tenantName    = tenantData?.tenant?.name              ?? undefined;

  // Dynamically update the page favicon when tenant branding loads
  useEffect(() => {
    const href = tenantFavicon || tenantLogo;
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }, [tenantFavicon, tenantLogo]);

  useEffect(() => {
    if (!isAuthenticated) {
      fetchMe();
    }
  }, []);

  // Register service worker for offline caching
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading || !user) {
    return <PageLoader />;
  }

  // When a super_admin is impersonating, show tenant_admin nav items in the sidebar
  const effectiveRole: Role | undefined =
    user.role === 'super_admin' && impersonation ? 'tenant_admin' : undefined;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        role={user.role}
        effectiveRole={effectiveRole}
        tenantName={impersonation?.name ?? tenantName}
        logoUrl={tenantLogo}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header user={user} onMenuToggle={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
