import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GuideLayout } from '@/components/guides/GuideLayout';
import { GuideSearch } from '@/components/guides/GuideSearch';
import { ArticleCard } from '@/components/guides/ArticleCard';
import { GUIDES, GUIDE_ROLE_KEYS, isGuideRoleKey, type FlatGuideArticle } from '@/lib/guides';

export function generateStaticParams() {
  return GUIDE_ROLE_KEYS.map((role) => ({ role }));
}

export function generateMetadata({ params }: { params: { role: string } }): Metadata {
  if (!isGuideRoleKey(params.role)) return {};
  const guide = GUIDES[params.role];
  return { title: `${guide.title} — Coursel`, description: guide.description };
}

export default function GuideRolePage({ params }: { params: { role: string } }) {
  if (!isGuideRoleKey(params.role)) notFound();
  const guide = GUIDES[params.role];

  const articles: FlatGuideArticle[] = guide.articles.map((a) => ({ ...a, role: guide.role, guideTitle: guide.title }));

  return (
    <GuideLayout>
      <p className="text-center text-sm mb-6">
        <Link href="/guides" className="text-gray-400 hover:text-indigo-600 transition-colors">Guides</Link>
        <span className="text-gray-300 mx-2">/</span>
        <span className="text-gray-500">{guide.title}</span>
      </p>

      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">{guide.title}</h1>
        <div className="w-14 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto mb-5" />
        <p className="text-gray-500 text-lg max-w-xl mx-auto">{guide.description}</p>
      </div>

      <div className="max-w-xl mx-auto mb-12">
        <GuideSearch articles={articles} placeholder={`Search the ${guide.title}...`} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {guide.articles.map((article) => (
          <ArticleCard
            key={article.slug}
            role={guide.role}
            slug={article.slug}
            icon={article.icon}
            title={article.title}
            summary={article.summary}
          />
        ))}
      </div>
    </GuideLayout>
  );
}
