import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'LMS Platform',
    short_name:       'LMS',
    description:      'Multi-tenant Learning Management System',
    start_url:        '/',
    display:          'standalone',
    orientation:      'portrait',
    background_color: '#ffffff',
    theme_color:      '#3b82f6',
    categories:       ['education', 'productivity'],
    icons: [
      { src: '/icon.png',  sizes: '32x32',   type: 'image/png' },
      { src: '/icon.png',  sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon.png',  sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
    shortcuts: [
      { name: 'Dashboard', url: '/dashboard', description: 'Go to your dashboard' },
      { name: 'My Courses', url: '/courses',   description: 'Browse courses' },
    ],
  };
}
