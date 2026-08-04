import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GuideLayout } from '@/components/guides/GuideLayout';
import { GuideBlockRenderer } from '@/components/guides/GuideBlockRenderer';
import { GUIDES, GUIDE_ROLE_KEYS, isGuideRoleKey } from '@/lib/guides';

export function generateStaticParams() {
  return GUIDE_ROLE_KEYS.flatMap((role) => GUIDES[role].articles.map((a) => ({ role, slug: a.slug })));
}

export function generateMetadata({ params }: { params: { role: string; slug: string } }): Metadata {
  if (!isGuideRoleKey(params.role)) return {};
  const article = GUIDES[params.role].articles.find((a) => a.slug === params.slug);
  if (!article) return {};
  return { title: `${article.title} — Coursel Guides`, description: article.summary };
}

export default function GuideArticlePage({ params }: { params: { role: string; slug: string } }) {
  if (!isGuideRoleKey(params.role)) notFound();
  const guide = GUIDES[params.role];
  const index = guide.articles.findIndex((a) => a.slug === params.slug);
  if (index === -1) notFound();

  const article = guide.articles[index];
  const prev = guide.articles[index - 1];
  const next = guide.articles[index + 1];

  return (
    <GuideLayout>
      <div className="max-w-3xl mx-auto">
        <p className="text-sm mb-8">
          <Link href="/guides" className="text-gray-400 hover:text-indigo-600 transition-colors">Guides</Link>
          <span className="text-gray-300 mx-2">/</span>
          <Link href={`/guides/${guide.role}`} className="text-gray-400 hover:text-indigo-600 transition-colors">{guide.title}</Link>
          <span className="text-gray-300 mx-2">/</span>
          <span className="text-gray-500">{article.title}</span>
        </p>

        <div className="flex items-center gap-4 mb-8">
          <span className="text-4xl">{article.icon}</span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{article.title}</h1>
            <p className="text-gray-500 mt-1">{article.summary}</p>
          </div>
        </div>

        <GuideBlockRenderer blocks={article.blocks} />

        <div className="grid sm:grid-cols-2 gap-4 mt-16 pt-8 border-t border-gray-100">
          {prev ? (
            <Link
              href={`/guides/${guide.role}/${prev.slug}`}
              className="p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:shadow-sm transition-all"
            >
              <p className="text-xs text-gray-400 mb-1">← Previous</p>
              <p className="text-sm font-semibold text-gray-800">{prev.title}</p>
            </Link>
          ) : <div />}
          {next ? (
            <Link
              href={`/guides/${guide.role}/${next.slug}`}
              className="p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:shadow-sm transition-all text-right sm:col-start-2"
            >
              <p className="text-xs text-gray-400 mb-1">Next →</p>
              <p className="text-sm font-semibold text-gray-800">{next.title}</p>
            </Link>
          ) : <div />}
        </div>
      </div>
    </GuideLayout>
  );
}
