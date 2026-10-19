import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { all, one, run, transaction } from './db';
import { getCourse } from './courses';
import { actor, ManagementError, recordAudit } from './management';
import { coverPresets, levels } from './cover-presets';
import { safeVideoUrl } from './security';

export function managedCourse(actorId: string, id: string, draftOnly = true) {
  const user = actor(actorId, ['teacher', 'admin']);
  const course = getCourse(id);
  if (!course || (course.owner_id !== user.id && user.role !== 'admin'))
    throw new ManagementError('forbidden');
  if (course.status === 'archived' || (draftOnly && course.status !== 'draft'))
    throw new ManagementError('readonly');
  return course;
}
export const courseInput = z.object({
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(30).max(5000),
  category: z.string().trim().min(2).max(100),
  level: z.enum(levels).default('Бастапқы'),
  price: z.coerce.number().int().min(0).max(10000000),
});
export function saveCourseInformation(actorId: string, id: string, input: unknown) {
  managedCourse(actorId, id);
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) throw new ManagementError('courseform');
  const data = parsed.data;
  run(
    'UPDATE courses SET title=?, description=?, category=?, level=?, price_kzt=?, updated_at=? WHERE id=?',
    data.title,
    data.description,
    data.category,
    data.level,
    data.price,
    Date.now(),
    id,
  );
  recordAudit(actorId, 'course.details.updated', id);
}
export function saveCoverPreset(actorId: string, id: string, preset: string) {
  managedCourse(actorId, id, false);
  if (!coverPresets.some((item) => item.id === preset)) throw new ManagementError('coverinvalid');
  run(
    `INSERT INTO course_presentation(course_id,preset) VALUES (?,?)
    ON CONFLICT(course_id) DO UPDATE SET preset=excluded.preset, cover_key=NULL, cover_version=course_presentation.cover_version+1`,
    id,
    preset,
  );
  recordAudit(actorId, 'course.cover.preset', id);
}
export function reopenCourse(actorId: string, id: string) {
  managedCourse(actorId, id, false);
  run("UPDATE courses SET status='draft',updated_at=? WHERE id=?", Date.now(), id);
  recordAudit(actorId, 'course.reopened', id);
}
export function managedLectureCover(actorId: string, courseId: string, lessonId: string) {
  managedCourse(actorId, courseId, false);
  if (
    !one(
      'SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id WHERE l.id=? AND s.course_id=?',
      lessonId,
      courseId,
    )
  )
    throw new ManagementError('forbidden');
}
export function saveLectureCoverPreset(
  actorId: string,
  courseId: string,
  lessonId: string,
  preset: string,
) {
  managedLectureCover(actorId, courseId, lessonId);
  if (preset === 'inherit') run('DELETE FROM lesson_presentation WHERE lesson_id=?', lessonId);
  else {
    if (!coverPresets.some((p) => p.id === preset)) throw new ManagementError('coverinvalid');
    run(
      `INSERT INTO lesson_presentation(lesson_id,preset) VALUES (?,?) ON CONFLICT(lesson_id) DO UPDATE SET preset=excluded.preset,cover_key=NULL,cover_version=lesson_presentation.cover_version+1`,
      lessonId,
      preset,
    );
  }
  recordAudit(actorId, 'lesson.cover.updated', lessonId);
}
function orderedLessons(sectionId: string) {
  return all<{ id: string }>(
    'SELECT id FROM lessons WHERE section_id=? ORDER BY position,id',
    sectionId,
  ).map((row) => row.id);
}
function reorder(sectionId: string, ids: string[]) {
  ids.forEach((id, index) =>
    run('UPDATE lessons SET section_id=?,position=? WHERE id=?', sectionId, index, id),
  );
}
export function writeLesson(
  actorId: string,
  courseId: string,
  input: {
    id: string;
    sectionId: string;
    title: string;
    body: string;
    videoUrl: string;
    minutes: number;
    preview: boolean;
    summary: string;
    objectives: string;
    position?: number;
  },
) {
  managedCourse(actorId, courseId);
  if (!one('SELECT id FROM sections WHERE id=? AND course_id=?', input.sectionId, courseId))
    throw new ManagementError('forbidden');
  const previous = input.id
    ? one<{ section_id: string; position: number }>(
        'SELECT l.section_id,l.position FROM lessons l JOIN sections s ON s.id=l.section_id WHERE l.id=? AND s.course_id=?',
        input.id,
        courseId,
      )
    : undefined;
  if (input.id && !previous) throw new ManagementError('forbidden');
  const video = safeVideoUrl(input.videoUrl);
  if (
    input.title.length < 3 ||
    input.title.length > 180 ||
    input.body.length > 30000 ||
    input.summary.length > 500 ||
    input.objectives.length > 3000 ||
    video === null ||
    !Number.isInteger(input.minutes) ||
    input.minutes < 1 ||
    input.minutes > 600 ||
    (input.position !== undefined &&
      (!Number.isInteger(input.position) || input.position < 1 || input.position > 10000))
  )
    throw new ManagementError('lessonform');
  const id = input.id || randomUUID();
  transaction(() => {
    if (previous)
      run(
        'UPDATE lessons SET title=?,body=?,video_url=?,duration_minutes=?,is_preview=? WHERE id=?',
        input.title,
        input.body,
        video,
        input.minutes,
        input.preview ? 1 : 0,
        id,
      );
    else
      run(
        'INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?)',
        id,
        input.sectionId,
        input.title,
        input.body,
        video,
        input.minutes,
        10000,
        input.preview ? 1 : 0,
      );
    const ids = orderedLessons(input.sectionId).filter((item) => item !== id);
    const index =
      input.position === undefined
        ? previous?.section_id === input.sectionId
          ? previous.position
          : ids.length
        : input.position - 1;
    ids.splice(Math.min(index, ids.length), 0, id);
    reorder(input.sectionId, ids);
    if (previous && previous.section_id !== input.sectionId)
      reorder(previous.section_id, orderedLessons(previous.section_id));
    run(
      `INSERT INTO lesson_details VALUES (?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET summary=excluded.summary,objectives=excluded.objectives`,
      id,
      input.summary,
      input.objectives,
    );
    run('UPDATE courses SET updated_at=? WHERE id=?', Date.now(), courseId);
    recordAudit(actorId, previous ? 'lesson.updated' : 'lesson.created', id);
  });
  return id;
}
export function saveSectionInformation(
  actorId: string,
  courseId: string,
  id: string,
  title: string,
  position: number,
) {
  managedCourse(actorId, courseId);
  if (!one('SELECT id FROM sections WHERE id=? AND course_id=?', id, courseId))
    throw new ManagementError('forbidden');
  if (
    title.length < 2 ||
    title.length > 140 ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > 10000
  )
    throw new ManagementError('invalid');
  transaction(() => {
    run('UPDATE sections SET title=? WHERE id=?', title, id);
    const ids = all<{ id: string }>(
      'SELECT id FROM sections WHERE course_id=? ORDER BY position,id',
      courseId,
    )
      .map((s) => s.id)
      .filter((s) => s !== id);
    ids.splice(Math.min(position - 1, ids.length), 0, id);
    ids.forEach((section, index) =>
      run('UPDATE sections SET position=? WHERE id=?', index, section),
    );
  });
}
export function assertCourseComplete(id: string) {
  if (
    !one('SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id WHERE s.course_id=?', id)
  )
    throw new ManagementError('emptycourse');
  const empty = one(
    `SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id WHERE s.course_id=?
    AND trim(l.body)='' AND l.video_url='' AND NOT EXISTS(SELECT 1 FROM lesson_materials m WHERE m.lesson_id=l.id AND m.removed_at IS NULL)`,
    id,
  );
  if (empty) throw new ManagementError('emptylesson');
}
