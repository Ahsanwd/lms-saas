import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import Script from 'next/script';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'coursel.space';
const GA_MEASUREMENT_ID = 'G-BPWV1P4BN9';

const SITE_TITLE = 'Coursel — Launch Your Own Online Academy';
const SITE_DESCRIPTION = 'Coursel is the all-in-one platform to launch your own branded online school — courses, quizzes, certificates, live classes, and payments, no coding required. Start free for 14 days.';

export const metadata: Metadata = {
  metadataBase: new URL('https://coursel.space'),
  title:       SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest:    '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Coursel' },
  formatDetection: { telephone: false },
  verification: {
    google: 'yQ_X6ICSxMNgRklsuV5ih-tp0rXOy2JOejjigCcf3es',
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: 'https://coursel.space',
    siteName: 'Coursel',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width:              'device-width',
  initialScale:       1,
  maximumScale:       5,
  themeColor:         [
    { media: '(prefers-color-scheme: light)', color: '#4f46e5' },
    { media: '(prefers-color-scheme: dark)',  color: '#3730a3' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Only track the platform's own marketing/docs pages (coursel.space,
  // www.coursel.space) — not individual tenants' sites, so tenant visitor
  // traffic never mixes into the platform owner's GA4 property.
  const host = (headers().get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  const isPlatformDomain = host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of unstyled dark mode */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t===null&&p)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
        {isPlatformDomain && (
          <>
            <Script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
