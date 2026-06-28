import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'coursel.space';
const EXCLUDED = new Set(['www', 'app', 'api', 'mail', 'admin']);

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');

  const isSubdomain =
    host.endsWith(`.${ROOT_DOMAIN}`) &&
    host !== `www.${ROOT_DOMAIN}`;

  if (isSubdomain) {
    const subdomain = host.replace(`.${ROOT_DOMAIN}`, '');

    if (subdomain && !EXCLUDED.has(subdomain)) {
      const response = NextResponse.next();
      response.cookies.set('lms_tenant', subdomain, {
        sameSite: 'lax',
        path: '/',
        // Shared across all *.coursel.space subdomains
        domain: `.${ROOT_DOMAIN}`,
      });
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on all pages except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
