'use client';

import { useState, useEffect } from 'react';

/**
 * Detects whether the current page is being viewed on a tenant subdomain
 * (e.g. demo.coursel.space) vs. the root platform domain (coursel.space).
 *
 * Returns:
 * - `null` while not yet determined (avoids a hydration-mismatch flash —
 *   render nothing until this resolves)
 * - `''` (empty string) when on the root domain (no tenant)
 * - the subdomain string when on a tenant subdomain
 */
export function useTenantSubdomain(): string | null {
  const [subdomain, setSubdomain] = useState<string | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'coursel.space';
    if (host !== rootDomain && host !== `www.${rootDomain}` && host.endsWith(`.${rootDomain}`)) {
      setSubdomain(host.replace(`.${rootDomain}`, ''));
    } else {
      setSubdomain('');
    }
  }, []);

  return subdomain;
}
