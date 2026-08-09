'use client';

import { useState, useEffect } from 'react';
import { useParams, notFound } from 'next/navigation';
import axios from 'axios';
import { applyBrandColor, applySecondaryColor, applyFontFamily } from '@/lib/brandColor';
import { useTenantSubdomain } from '@/lib/useTenantSubdomain';
import { useTenantBrowserChrome } from '@/lib/useTenantBrowserChrome';
import { resolveSectionCourses } from '@/lib/tenantPageFetch';
import { PageSectionsRenderer, type PageSection, type PublicCourse, type NavPage, type HeaderConfig, type FooterConfig, type PublicBundle, type PublicMembershipPlan } from '@/components/website/LandingPageSections';

// Tenant-created pages beyond Home (e.g. /about-us). The root platform
// domain has no tenant pages at all, so it 404s immediately. Reserved slugs
// (login, courses, settings, ...) are enforced server-side at page-creation
// time — Next.js always resolves those static routes before this dynamic
// catch-all, so a legitimately-created tenant page never collides with them.
export default function TenantCustomPage() {
  const { pageSlug } = useParams<{ pageSlug: string }>();
  const subdomain = useTenantSubdomain();

  const [loading, setLoading] = useState(true);
  const [notPublished, setNotPublished] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [sections, setSections] = useState<PageSection[]>([]);
  const [pageId, setPageId] = useState<string | undefined>(undefined);
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [navPages, setNavPages] = useState<NavPage[]>([]);
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [footerConfig, setFooterConfig] = useState<FooterConfig | null>(null);
  const [bundles, setBundles] = useState<PublicBundle[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<PublicMembershipPlan[]>([]);

  useEffect(() => {
    if (subdomain === null) return; // not yet resolved
    if (!subdomain) { setNotPublished(true); setLoading(false); return; } // root domain has no tenant pages

    const headers = { 'X-Tenant-Subdomain': subdomain };
    Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/courses/public`, { headers }),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/tenant/pages/public/${pageSlug}`, { headers }).catch(() => null),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/tenant/pages/public`, { headers }).catch(() => null),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/bundles/public`, { headers }).catch(() => null),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/membership/plans/public`, { headers }).catch(() => null),
    ])
      .then(async ([coursesRes, pageRes, navRes, bundlesRes, plansRes]) => {
        setTenantName(coursesRes.data.data.tenantName ?? '');
        setLogoUrl(coursesRes.data.data.branding?.logoUrl ?? null);
        setFaviconUrl(coursesRes.data.data.branding?.faviconUrl ?? null);
        if (coursesRes.data.data.branding?.primaryColor) applyBrandColor(coursesRes.data.data.branding.primaryColor);
        if (coursesRes.data.data.branding?.secondaryColor) applySecondaryColor(coursesRes.data.data.branding.secondaryColor);
        applyFontFamily(coursesRes.data.data.branding?.fontFamily);
        setNavPages(navRes?.data?.data?.pages ?? []);
        setHeaderConfig(coursesRes.data.data.branding?.header ?? null);
        setFooterConfig(coursesRes.data.data.branding?.footer ?? null);
        setBundles(bundlesRes?.data?.data?.bundles ?? []);
        setMembershipPlans(plansRes?.data?.data?.plans ?? []);

        const page = pageRes?.data?.data;
        if (!page?.isPublished) { setNotPublished(true); return; }

        const generalCourses = coursesRes.data.data.courses ?? [];
        setSections(page.sections ?? []);
        setPageId(page._id);
        setCourses(await resolveSectionCourses(headers, page.sections ?? [], generalCourses));
      })
      .catch(() => setNotPublished(true))
      .finally(() => setLoading(false));
  }, [subdomain, pageSlug]);

  useTenantBrowserChrome(tenantName || subdomain || '', faviconUrl, logoUrl);

  if (loading || subdomain === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 rounded-full border-4 border-gray-100 border-t-primary-600 animate-spin" />
      </div>
    );
  }

  if (notPublished) notFound();

  return (
    <PageSectionsRenderer
      sections={sections}
      courses={courses}
      coursesLoading={false}
      displayName={tenantName || subdomain}
      logoUrl={logoUrl}
      pages={navPages}
      subdomain={subdomain}
      pageId={pageId}
      headerConfig={headerConfig}
      footerConfig={footerConfig}
      bundles={bundles}
      membershipPlans={membershipPlans}
    />
  );
}
