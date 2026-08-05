import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

const SITE_TITLE = 'Coursel — Launch Your Own Online Academy';
const SITE_DESCRIPTION = 'Coursel is the all-in-one platform to launch your own branded online school — courses, quizzes, certificates, live classes, and payments, no coding required. Start free for 14 days.';

export const metadata: Metadata = {
  metadataBase: new URL('https://coursel.space'),
  title:       SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest:    '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Coursel' },
  formatDetection: { telephone: false },
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
    { media: '(prefers-color-scheme: light)', color: '#3b82f6' },
    { media: '(prefers-color-scheme: dark)',  color: '#1d4ed8' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of unstyled dark mode */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t===null&&p)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
