import Link from 'next/link';
import type { GuideRoleKey } from '@/lib/guides';

export function ArticleCard({
  role,
  slug,
  icon,
  title,
  summary,
  roleBadge,
}: {
  role: GuideRoleKey;
  slug: string;
  icon: string;
  title: string;
  summary: string;
  roleBadge?: string;
}) {
  return (
    <Link
      href={`/guides/${role}/${slug}`}
      className="group flex flex-col p-6 rounded-2xl bg-white border border-gray-100 hover:border-indigo-200 hover:shadow-lg transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {roleBadge && (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
            {roleBadge}
          </span>
        )}
      </div>
      <h3 className="font-bold text-gray-900 mb-1.5 group-hover:text-indigo-600 transition-colors">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{summary}</p>
    </Link>
  );
}
