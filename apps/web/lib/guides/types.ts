export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'tip'; text: string }
  | { type: 'list'; items: string[] };

export interface GuideArticle {
  slug: string;
  title: string;
  summary: string;
  icon: string;
  blocks: GuideBlock[];
}

export type GuideRoleKey = 'admin' | 'instructor' | 'student';

export interface Guide {
  role: GuideRoleKey;
  title: string;
  description: string;
  articles: GuideArticle[];
}
