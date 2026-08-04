import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideLayout } from '@/components/guides/GuideLayout';
import { GuideSearch } from '@/components/guides/GuideSearch';
import { GUIDES, GUIDE_ROLE_KEYS, ALL_ARTICLES } from '@/lib/guides';

export const metadata: Metadata = {
  title: 'Guides — Coursel',
  description: 'Step-by-step guides for school admins, instructors, and students on Coursel.',
};

const ROLE_META: Record<string, { icon: string; blurb: string }> = {
  admin: { icon: '🏫', blurb: 'Set up your school, build courses, manage instructors and students, and handle billing.' },
  instructor: { icon: '🎓', blurb: 'Create courses, build quizzes and assignments, run live classes, and support students.' },
  student: { icon: '📖', blurb: 'Enroll in courses, learn at your own pace, take quizzes, and earn certificates.' },
};

export default function GuidesIndexPage() {
  return (
    <GuideLayout>
      <div className="text-center mb-14">
        <p className="text-xs font-bold tracking-widest uppercase text-indigo-600 mb-3">Guides</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">How to use Coursel</h1>
        <div className="w-14 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto mb-5" />
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          Step-by-step guides for every role — pick yours below, or search across all of them.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto mb-16">
        {GUIDE_ROLE_KEYS.map((role) => {
          const guide = GUIDES[role];
          const meta = ROLE_META[role];
          return (
            <Link
              key={role}
              href={`/guides/${role}`}
              className="group flex flex-col items-center text-center p-8 rounded-2xl bg-white border border-gray-100 hover:border-indigo-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <span className="text-4xl mb-4">{meta.icon}</span>
              <h2 className="font-bold text-lg text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">{guide.title}</h2>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">{meta.blurb}</p>
              <span className="text-xs font-semibold text-indigo-600 mt-auto">{guide.articles.length} articles →</span>
            </Link>
          );
        })}
      </div>

      <div className="max-w-3xl mx-auto">
        <p className="text-center text-sm font-semibold text-gray-500 mb-4">Or search every guide at once</p>
        <GuideSearch articles={ALL_ARTICLES} placeholder="Search all guides — e.g. &quot;create a course&quot;" showRoleBadge />
      </div>
    </GuideLayout>
  );
}
