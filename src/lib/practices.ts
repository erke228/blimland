import { one } from './db';
import { canReadLesson } from './materials';
import { ManagementError } from './management';
export type Practice = {
  title: string;
  instructions: string;
  starter_code: string;
  expected_output: string;
};
export async function lessonPractice(lessonId: string, userId?: string) {
  if (!(await canReadLesson(lessonId, userId))) throw new ManagementError('forbidden');
  const row = await one<Practice>(
    'SELECT title,instructions,starter_code,expected_output FROM lesson_practices WHERE lesson_id=?',
    lessonId,
  );
  // SQLite returns rows with a null prototype; React client props require plain objects.
  return row ? { ...row } : undefined;
}
export async function practiceDownload(lessonId: string, userId?: string) {
  if (!(await canReadLesson(lessonId, userId))) return undefined;
  return one<{ title: string; full_code: string; requirements: string }>(
    'SELECT title,full_code,requirements FROM lesson_practices WHERE lesson_id=?',
    lessonId,
  );
}
