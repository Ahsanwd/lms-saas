import type { Guide, GuideArticle, GuideRoleKey } from './types';
import { adminGuide } from './content/adminGuide';
import { instructorGuide } from './content/instructorGuide';
import { studentGuide } from './content/studentGuide';

export * from './types';

export const GUIDES: Record<GuideRoleKey, Guide> = {
  admin: adminGuide,
  instructor: instructorGuide,
  student: studentGuide,
};

export const GUIDE_ROLE_KEYS: GuideRoleKey[] = ['admin', 'instructor', 'student'];

export function isGuideRoleKey(value: string): value is GuideRoleKey {
  return (GUIDE_ROLE_KEYS as string[]).includes(value);
}

export interface FlatGuideArticle extends GuideArticle {
  role: GuideRoleKey;
  guideTitle: string;
}

export const ALL_ARTICLES: FlatGuideArticle[] = GUIDE_ROLE_KEYS.flatMap((role) =>
  GUIDES[role].articles.map((article) => ({ ...article, role, guideTitle: GUIDES[role].title }))
);
