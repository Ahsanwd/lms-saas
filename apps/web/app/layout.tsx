import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title:       'LMS Platform',
  description: 'Multi-tenant Learning Management System',
  manifest:    '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'LMS Platform' },
  formatDetection: { telephone: false },
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
