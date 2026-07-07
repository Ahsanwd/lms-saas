import axios from 'axios';
import type { PageSection, PublicCourse } from '@/components/website/LandingPageSections';

// If a page's Courses section is set to "Selected" mode, re-fetch by id so
// explicitly hand-picked courses aren't silently filtered out by unrelated
// Storefront category-hiding rules (see course.repository.js findByIdsPublic
// on the API side). Otherwise returns the general course list unchanged.
export async function resolveSectionCourses(
  headers: Record<string, string>,
  sections: PageSection[],
  generalCourses: PublicCourse[]
): Promise<PublicCourse[]> {
  const coursesSection = sections.find((s) => s.type === 'coursesSection');
  const cs = coursesSection?.data as { displayMode?: string; courseIds?: string[] } | undefined;
  if (cs?.displayMode !== 'selected' || !cs.courseIds || cs.courseIds.length === 0) return generalCourses;

  try {
    const idsRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/courses/public`, {
      headers, params: { ids: cs.courseIds.join(',') },
    });
    return idsRes.data.data.courses ?? [];
  } catch {
    return generalCourses;
  }
}
