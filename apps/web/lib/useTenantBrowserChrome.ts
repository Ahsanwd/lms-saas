import { useEffect } from 'react';

// Sets the browser tab title + favicon to the tenant's own branding instead
// of the platform's static defaults from app/layout.tsx — client component
// pages can't use Next's generateMetadata (server-only), so this is the
// standard imperative fallback. Used by every public tenant page (home,
// [pageSlug]) that fetches its own branding client-side.
export function useTenantBrowserChrome(tenantName: string, faviconUrl: string | null, logoUrl: string | null) {
  useEffect(() => {
    if (tenantName) document.title = tenantName;
  }, [tenantName]);

  useEffect(() => {
    const href = faviconUrl || logoUrl;
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }, [faviconUrl, logoUrl]);
}
