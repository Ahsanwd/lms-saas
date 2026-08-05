import type { MetadataRoute } from 'next';
import { GUIDES, GUIDE_ROLE_KEYS } from '@/lib/guides';

const BASE_URL = 'https://coursel.space';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/register-tenant`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/guides`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/login`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/refund-policy`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const guidePages: MetadataRoute.Sitemap = GUIDE_ROLE_KEYS.flatMap((role) => {
    const guide = GUIDES[role];
    return [
      { url: `${BASE_URL}/guides/${role}`, changeFrequency: 'monthly' as const, priority: 0.7 },
      ...guide.articles.map((article) => ({
        url: `${BASE_URL}/guides/${role}/${article.slug}`,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ];
  });

  return [...staticPages, ...guidePages];
}
