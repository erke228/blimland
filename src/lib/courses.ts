import { all, one } from './db';

export type Course = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: string;
  level: string;
  price_kzt: number;
  status: string;
  accent: string;
  teacher: string;
  lesson_count: number;
  cover_preset: string;
  cover_version: number;
  has_cover: number;
  first_lesson_id: string | null;
  first_lesson_title: string | null;
  first_lesson_preview: number | null;
};
export type Lesson = {
  id: string;
  section_id: string;
  title: string;
  body: string;
  video_url: string;
  duration_minutes: number;
  position: number;
  is_preview: number;
  section_title: string;
  course_id: string;
  summary: string;
  objectives: string;
};
const courseSelect = `SELECT c.*, u.name AS teacher,
  COALESCE(p.preset, 'books') cover_preset, COALESCE(p.cover_version, 0) cover_version,
  (p.cover_key IS NOT NULL) has_cover,
  (SELECT l.id FROM lessons l JOIN sections s ON s.id = l.section_id WHERE s.course_id = c.id ORDER BY s.position, l.position, l.id LIMIT 1) first_lesson_id,
  (SELECT l.title FROM lessons l JOIN sections s ON s.id = l.section_id WHERE s.course_id = c.id ORDER BY s.position, l.position, l.id LIMIT 1) first_lesson_title,
  (SELECT l.is_preview FROM lessons l JOIN sections s ON s.id = l.section_id WHERE s.course_id = c.id ORDER BY s.position, l.position, l.id LIMIT 1) first_lesson_preview,
  (SELECT COUNT(*) FROM lessons l JOIN sections s ON s.id = l.section_id WHERE s.course_id = c.id) AS lesson_count
  FROM courses c JOIN users u ON u.id = c.owner_id LEFT JOIN course_presentation p ON p.course_id = c.id`;
export function listCourses(search = '', category = '') {
  const query = search.normalize('NFKC').toLocaleLowerCase('kk-KZ').trim();
  // SQLite LIKE does not case-fold Kazakh/Cyrillic letters. The initial catalog
  // normalizes Unicode in application code; indexed search is scheduled in M09.
  return all<Course>(
    `${courseSelect} WHERE c.status = 'published'
    AND (? = '' OR c.category = ?) ORDER BY c.updated_at DESC, c.id`,
    category,
    category,
  ).filter(
    (course) =>
      !query ||
      `${course.title} ${course.description} ${course.teacher} ${course.first_lesson_title || ''}`
        .normalize('NFKC')
        .toLocaleLowerCase('kk-KZ')
        .includes(query),
  );
}
export function getCourse(id: string) {
  return one<Course>(`${courseSelect} WHERE c.id = ?`, id);
}
export function courseLessons(id: string) {
  return all<Lesson>(
    `SELECT l.*, s.title AS section_title, s.course_id, COALESCE(d.summary, '') summary,
    COALESCE(d.objectives, '') objectives FROM lessons l JOIN sections s ON s.id = l.section_id
    LEFT JOIN lesson_details d ON d.lesson_id = l.id
    WHERE s.course_id = ? ORDER BY s.position, l.position, l.id`,
    id,
  );
}
export function money(amount: number) {
  return amount === 0 ? 'Тегін' : `${new Intl.NumberFormat('kk-KZ').format(amount)} ₸`;
}
