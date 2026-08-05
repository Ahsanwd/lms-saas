import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/admin', '/settings', '/join', '/verify'],
      },
    ],
    sitemap: 'https://coursel.space/sitemap.xml',
  };
}
