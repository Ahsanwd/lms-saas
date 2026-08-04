'use client';

import { useMemo, useState } from 'react';
import type { FlatGuideArticle } from '@/lib/guides';
import { ArticleCard } from './ArticleCard';

export function GuideSearch({
  articles,
  placeholder = 'Search guides...',
  showRoleBadge = false,
}: {
  articles: FlatGuideArticle[];
  placeholder?: string;
  showRoleBadge?: boolean;
}) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return articles.filter(
      (a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)
    );
  }, [query, articles]);

  const roleBadgeLabel: Record<string, string> = {
    admin: 'Admin Guide',
    instructor: 'Instructor Guide',
    student: 'Student Guide',
  };

  return (
    <div>
      <div className="relative max-w-xl mx-auto">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
      </div>

      {query.trim() && (
        <div className="max-w-4xl mx-auto mt-8">
          {results.length === 0 ? (
            <p className="text-center text-gray-400 text-sm">No articles found for "{query}".</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {results.map((a) => (
                <ArticleCard
                  key={`${a.role}-${a.slug}`}
                  role={a.role}
                  slug={a.slug}
                  icon={a.icon}
                  title={a.title}
                  summary={a.summary}
                  roleBadge={showRoleBadge ? roleBadgeLabel[a.role] : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
