'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { applyBrandColor, applySecondaryColor, applyFontFamily } from '@/lib/brandColor';

interface TenantBranding {
  tenantName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'coursel.space';
    const isTenantSubdomain =
      host !== rootDomain &&
      host !== `www.${rootDomain}` &&
      host.endsWith(`.${rootDomain}`);

    if (isTenantSubdomain) {
      const sub = host.replace(`.${rootDomain}`, '');
      setSubdomain(sub);
      axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/api/tenant/branding`, {
          headers: { 'X-Tenant-Subdomain': sub },
        })
        .then((res) => {
          setBranding(res.data.data ?? null);
          if (res.data.data?.primaryColor) applyBrandColor(res.data.data.primaryColor);
          if (res.data.data?.secondaryColor) applySecondaryColor(res.data.data.secondaryColor);
          applyFontFamily(res.data.data?.fontFamily);
        })
        .catch(() => setBranding(null));
    } else {
      setSubdomain('');
    }
  }, []);

  const isOnSubdomain = Boolean(subdomain);
  const tenantName = branding?.tenantName || subdomain;
  const logoUrl = branding?.logoUrl;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 min-h-[52px] flex flex-col items-center justify-center">
          {subdomain === null ? null : isOnSubdomain && logoUrl ? (
            <img src={logoUrl} alt={tenantName || 'Logo'} className="h-12 mx-auto object-contain" />
          ) : isOnSubdomain && tenantName ? (
            <span className="text-3xl font-extrabold text-primary-600 tracking-tight capitalize">
              {tenantName}
            </span>
          ) : (
            <>
              <span className="text-3xl font-extrabold text-primary-600 tracking-tight">Coursel</span>
              <p className="text-sm text-gray-400 mt-1">Launch your online school in minutes</p>
            </>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
