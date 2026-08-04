import Link from 'next/link';
import type { GuideRoleKey } from '@/lib/guides';

const COPY: Record<GuideRoleKey, { label: string; text: string }> = {
  admin: { label: 'Admin Guide', text: 'New here? Walk through setting up your school, building your first course, and more.' },
  instructor: { label: 'Instructor Guide', text: 'New here? Walk through creating a course, building quizzes, and grading assignments.' },
  student: { label: 'Student Guide', text: 'New here? Learn how to enroll, take courses, and earn certificates.' },
};

export function GuideCallout({ role }: { role: GuideRoleKey }) {
  const { label, text } = COPY[role];
  return (
    <Link
      href={`/guides/${role}`}
      className="flex items-center justify-between gap-4 bg-white border border-primary-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-lg flex-shrink-0">📘</div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{label}</p>
          <p className="text-xs text-gray-500 truncate">{text}</p>
        </div>
      </div>
      <span className="text-primary-600 text-sm font-semibold flex-shrink-0">Read guide →</span>
    </Link>
  );
}
