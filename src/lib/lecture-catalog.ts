import { all } from './db';
import { listCourses, type Course } from './courses';
export type CatalogFilters = {
  q?: string;
  category?: string;
  teacher?: string;
  level?: string;
  format?: string;
  access?: string;
  sort?: string;
  view?: string;
  page?: string;
};
export type LectureListing = {
  id: string;
  title: string;
  course_id: string;
  course_title: string;
  category: string;
  level: string;
  teacher: string;
  owner_id: string;
  section_title: string;
  duration_minutes: number;
  is_preview: number;
  has_pdf: number;
  has_docx: number;
  has_video: number;
  has_text: number;
  updated_at: number;
};
const normalized = (value: string) => value.normalize('NFKC').toLocaleLowerCase('kk-KZ').trim();
export async function lectureCatalog(filters: CatalogFilters = {}) {
  const courses = await listCourses();
  // Public metadata only. Lesson bodies, video URLs and document identifiers stay private.
  const lectures =
    await all<LectureListing>(`SELECT l.id,l.title,s.course_id,c.title course_title,c.category,c.level,u.name teacher,c.owner_id,s.title section_title,l.duration_minutes,l.is_preview,c.updated_at,
    EXISTS(SELECT 1 FROM lesson_materials m WHERE m.lesson_id=l.id AND m.kind='pdf' AND m.removed_at IS NULL) has_pdf,
    EXISTS(SELECT 1 FROM lesson_materials m WHERE m.lesson_id=l.id AND m.kind='docx' AND m.removed_at IS NULL) has_docx,
    (l.video_url!='') has_video,(l.body!='') has_text
    FROM lessons l JOIN sections s ON s.id=l.section_id JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=c.owner_id
    WHERE c.status='published' AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id)
    ORDER BY c.updated_at DESC,s.position,l.position,l.id`);
  const q = normalized((filters.q || '').slice(0, 200));
  const matches = (l: LectureListing) =>
    (!q ||
      normalized(`${l.title} ${l.course_title} ${l.teacher} ${l.section_title}`).includes(q)) &&
    (!filters.category || l.category === filters.category) &&
    (!filters.teacher || l.owner_id === filters.teacher) &&
    (!filters.level || l.level === filters.level) &&
    (filters.access !== 'open' || !!l.is_preview) &&
    (!['pdf', 'docx', 'video', 'text'].includes(filters.format || '') ||
      !!l[`has_${filters.format}` as 'has_pdf']);
  let results = lectures.filter(matches);
  if (filters.sort === 'title') results.sort((a, b) => a.title.localeCompare(b.title, 'kk'));
  if (filters.sort === 'duration')
    results.sort(
      (a, b) => a.duration_minutes - b.duration_minutes || a.title.localeCompare(b.title, 'kk'),
    );
  const lectureCourseIds = new Set(results.map((l) => l.course_id));
  let courseResults = courses.filter(
    (c) =>
      lectureCourseIds.has(c.id) ||
      (!filters.format &&
        filters.access !== 'open' &&
        (!q || normalized(`${c.title} ${c.description} ${c.teacher}`).includes(q)) &&
        (!filters.category || c.category === filters.category) &&
        (!filters.teacher || c.owner_id === filters.teacher) &&
        (!filters.level || c.level === filters.level)),
  );
  if (filters.sort === 'title') courseResults.sort((a, b) => a.title.localeCompare(b.title, 'kk'));
  if (filters.sort === 'duration') {
    const duration = (c: Course) =>
      lectures.filter((l) => l.course_id === c.id).reduce((sum, l) => sum + l.duration_minutes, 0);
    courseResults.sort((a, b) => duration(a) - duration(b));
  }
  const view = filters.view === 'courses' ? 'courses' : 'lectures';
  const total = view === 'courses' ? courseResults.length : results.length;
  const pages = Math.max(1, Math.ceil(total / 12)),
    number = Number(filters.page);
  const page = Number.isSafeInteger(number) && number > 0 ? Math.min(number, pages) : 1;
  const start = (page - 1) * 12;
  return {
    view,
    total,
    page,
    pages,
    results: results.slice(start, start + 12),
    courses: courseResults.slice(start, start + 12),
    courseMap: new Map(courses.map((c) => [c.id, c])),
    categories: [...new Set(courses.map((c) => c.category))].sort((a, b) =>
      a.localeCompare(b, 'kk'),
    ),
    teachers: [
      ...new Map(courses.map((c) => [c.owner_id, { id: c.owner_id, name: c.teacher }])).values(),
    ],
    totals: {
      courses: courses.length,
      lectures: lectures.length,
      teachers: new Set(courses.map((c) => c.owner_id)).size,
    },
  };
}
