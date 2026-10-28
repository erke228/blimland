import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { all, one, run, transaction } from './db';
import { getCourse } from './courses';
import { actor, ManagementError, recordAudit } from './management';
import { coverPresets, levels } from './cover-presets';
import { safeVideoUrl } from './security';
export async function managedCourse(actorId: string, id: string, draftOnly = true) {
  const user = await actor(actorId, ['teacher', 'admin']);
  const course = await getCourse(id);
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
});
export async function saveCourseInformation(actorId: string, id: string, input: unknown) {
  await managedCourse(actorId, id);
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) throw new ManagementError('courseform');
  const data = parsed.data;
  await run(
    'UPDATE courses SET title=?, description=?, category=?, level=?, updated_at=? WHERE id=?',
    data.title,
    data.description,
    data.category,
    data.level,
    Date.now(),
    id,
  );
  await recordAudit(actorId, 'course.details.updated', id);
}
export async function saveCoverPreset(actorId: string, id: string, preset: string) {
  await managedCourse(actorId, id, false);
  if (!coverPresets.some((item) => item.id === preset)) throw new ManagementError('coverinvalid');
  await run(
    `INSERT INTO course_presentation(course_id,preset) VALUES (?,?)
    ON CONFLICT(course_id) DO UPDATE SET preset=excluded.preset, cover_key=NULL, cover_version=course_presentation.cover_version+1`,
    id,
    preset,
  );
  await recordAudit(actorId, 'course.cover.preset', id);
}
export async function reopenCourse(actorId: string, id: string) {
  await managedCourse(actorId, id, false);
  await run("UPDATE courses SET status='draft',updated_at=? WHERE id=?", Date.now(), id);
  await recordAudit(actorId, 'course.reopened', id);
}
export async function managedLectureCover(actorId: string, courseId: string, lessonId: string) {
  await managedCourse(actorId, courseId, false);
  if (
    !(await one(
      'SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id WHERE l.id=? AND s.course_id=?',
      lessonId,
      courseId,
    ))
  )
    throw new ManagementError('forbidden');
}
export async function saveLectureCoverPreset(
  actorId: string,
  courseId: string,
  lessonId: string,
  preset: string,
) {
  await managedLectureCover(actorId, courseId, lessonId);
  if (preset === 'inherit')
    await run('DELETE FROM lesson_presentation WHERE lesson_id=?', lessonId);
  else {
    if (!coverPresets.some((p) => p.id === preset)) throw new ManagementError('coverinvalid');
    await run(
      `INSERT INTO lesson_presentation(lesson_id,preset) VALUES (?,?) ON CONFLICT(lesson_id) DO UPDATE SET preset=excluded.preset,cover_key=NULL,cover_version=lesson_presentation.cover_version+1`,
      lessonId,
      preset,
    );
  }
  await recordAudit(actorId, 'lesson.cover.updated', lessonId);
}
async function orderedLessons(sectionId: string) {
  return (
    await all<{
      id: string;
    }>('SELECT id FROM lessons WHERE section_id=? ORDER BY position,id', sectionId)
  ).map((row) => row.id);
}
async function reorder(sectionId: string, ids: string[]) {
  await Promise.all(
    ids.map(
      async (id, index) =>
        await run('UPDATE lessons SET section_id=?,position=? WHERE id=?', sectionId, index, id),
    ),
  );
}
export async function writeLesson(
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
  await managedCourse(actorId, courseId);
  if (
    !(await one(
      'SELECT id FROM sections WHERE id=? AND course_id=? AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=sections.id)',
      input.sectionId,
      courseId,
    ))
  )
    throw new ManagementError('forbidden');
  const previous = input.id
    ? await one<{
        section_id: string;
        position: number;
      }>(
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
  await transaction(async () => {
    if (previous)
      await run(
        'UPDATE lessons SET title=?,body=?,video_url=?,duration_minutes=?,is_preview=? WHERE id=?',
        input.title,
        input.body,
        video,
        input.minutes,
        input.preview ? 1 : 0,
        id,
      );
    else
      await run(
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
    const ids = (await orderedLessons(input.sectionId)).filter((item) => item !== id);
    const index =
      input.position === undefined
        ? previous?.section_id === input.sectionId
          ? previous.position
          : ids.length
        : input.position - 1;
    ids.splice(Math.min(index, ids.length), 0, id);
    await reorder(input.sectionId, ids);
    if (previous && previous.section_id !== input.sectionId)
      await reorder(previous.section_id, await orderedLessons(previous.section_id));
    await run(
      `INSERT INTO lesson_details VALUES (?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET summary=excluded.summary,objectives=excluded.objectives`,
      id,
      input.summary,
      input.objectives,
    );
    await run('UPDATE courses SET updated_at=? WHERE id=?', Date.now(), courseId);
    await recordAudit(actorId, previous ? 'lesson.updated' : 'lesson.created', id);
  });
  return id;
}
export async function saveSectionInformation(
  actorId: string,
  courseId: string,
  id: string,
  title: string,
  position: number,
) {
  await managedCourse(actorId, courseId);
  if (
    !(await one(
      'SELECT id FROM sections WHERE id=? AND course_id=? AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=sections.id)',
      id,
      courseId,
    ))
  )
    throw new ManagementError('forbidden');
  if (
    title.length < 2 ||
    title.length > 140 ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > 10000
  )
    throw new ManagementError('invalid');
  await transaction(async () => {
    await run('UPDATE sections SET title=? WHERE id=?', title, id);
    const ids = (
      await all<{
        id: string;
      }>(
        'SELECT id FROM sections WHERE course_id=? AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=sections.id) ORDER BY position,id',
        courseId,
      )
    )
      .map((s) => s.id)
      .filter((s) => s !== id);
    ids.splice(Math.min(position - 1, ids.length), 0, id);
    await Promise.all(
      ids.map(
        async (section, index) =>
          await run('UPDATE sections SET position=? WHERE id=?', index, section),
      ),
    );
    await recordAudit(actorId, 'section.updated', id);
  });
}
export async function removeCourseSection(
  actorId: string,
  courseId: string,
  sectionId: string,
  targetId = '',
  reopen = false,
) {
  const course = await managedCourse(actorId, courseId, !reopen);
  const active = await all<{
    id: string;
  }>(
    'SELECT id FROM sections WHERE course_id=? AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=sections.id) ORDER BY position,id',
    courseId,
  );
  if (!active.some((s) => s.id === sectionId)) throw new ManagementError('forbidden');
  const lessons = await orderedLessons(sectionId);
  if (targetId && (targetId === sectionId || !active.some((s) => s.id === targetId)))
    throw new ManagementError('sectiondestination');
  await transaction(async () => {
    if (lessons.length && targetId)
      await reorder(targetId, [...(await orderedLessons(targetId)), ...lessons]);
    if (course.status !== 'draft')
      await run("UPDATE courses SET status='draft' WHERE id=?", courseId);
    await run('INSERT INTO section_trash VALUES (?,?)', sectionId, Date.now());
    await Promise.all(
      active
        .filter((s) => s.id !== sectionId)
        .map(
          async (s, index) => await run('UPDATE sections SET position=? WHERE id=?', index, s.id),
        ),
    );
    await run('UPDATE courses SET updated_at=? WHERE id=?', Date.now(), courseId);
    await recordAudit(actorId, 'section.removed', sectionId);
  });
}
export async function restoreCourseSection(actorId: string, courseId: string, sectionId: string) {
  await managedCourse(actorId, courseId);
  if (
    !(await one(
      'SELECT s.id FROM sections s JOIN section_trash t ON t.section_id=s.id WHERE s.id=? AND s.course_id=?',
      sectionId,
      courseId,
    ))
  )
    throw new ManagementError('forbidden');
  await transaction(async () => {
    const count = (await one<{
      n: number;
    }>(
      'SELECT COUNT(*) n FROM sections s WHERE s.course_id=? AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id)',
      courseId,
    ))!.n;
    await run('DELETE FROM section_trash WHERE section_id=?', sectionId);
    await run('UPDATE sections SET position=? WHERE id=?', count, sectionId);
    await run('UPDATE courses SET updated_at=? WHERE id=?', Date.now(), courseId);
    await recordAudit(actorId, 'section.restored', sectionId);
  });
}
export function lessonFormInput(form: FormData) {
  const text = (key: string) => String(form.get(key) || '').trim();
  return {
    id: text('lessonId'),
    sectionId: text('sectionId'),
    title: text('title'),
    body: text('body'),
    videoUrl: text('videoUrl'),
    minutes: Number(text('minutes')),
    preview: form.get('preview') === 'on',
    summary: text('summary'),
    objectives: text('objectives'),
    position: text('position') ? Number(text('position')) : undefined,
  };
}
export async function assertCourseComplete(id: string) {
  if (
    !(await one(
      'SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id WHERE s.course_id=? AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id)',
      id,
    ))
  )
    throw new ManagementError('emptycourse');
  const empty = await one(
    `SELECT l.id FROM lessons l JOIN sections s ON s.id=l.section_id WHERE s.course_id=?
    AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id) AND trim(l.body)='' AND l.video_url='' AND NOT EXISTS(SELECT 1 FROM lesson_materials m WHERE m.lesson_id=l.id AND m.removed_at IS NULL)`,
    id,
  );
  if (empty) throw new ManagementError('emptylesson');
}
