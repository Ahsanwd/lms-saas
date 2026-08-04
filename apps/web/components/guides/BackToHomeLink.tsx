'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';

// Guides are reachable both from inside the dashboard (nav link, dashboard
// callout) and from the public marketing site — "back" should return to
// wherever that visitor actually came from, not always the public home page.
export function BackToHomeLink() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const loggedIn = hasHydrated && isAuthenticated;

  return (
    <Link href={loggedIn ? '/dashboard' : '/'} className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
      {loggedIn ? 'Back to dashboard' : 'Back to home'}
    </Link>
  );
}
