import { randomUUID } from 'node:crypto';
import { deleteStored } from './storage';
import { all, one, run, transaction } from './db';
import { actor, recordAudit, ManagementError } from './management';
import { getCourse } from './courses';
import { materialPath } from './materials';
import { coverPath } from './course-covers';
export async function lifecycleCourse(actorId: string, id: string) {
  const user = await actor(actorId, ['teacher', 'admin']);
  const course = await getCourse(id);
  if (!course || (user.role !== 'admin' && course.owner_id !== user.id))
    throw new ManagementError('forbidden');
  return course;
}
export async function courseInTrash(id: string) {
  return !!(await one('SELECT course_id FROM course_trash WHERE course_id=?', id));
}
export async function changeCourseVisibility(
  actorId: string,
  id: string,
  operation: 'hide' | 'trash' | 'restore',
) {
  await lifecycleCourse(actorId, id);
  await transaction(async () => {
    if (operation === 'restore') {
      await run('DELETE FROM course_trash WHERE course_id=?', id);
      await run("UPDATE courses SET status='draft',updated_at=? WHERE id=?", Date.now(), id);
    } else {
      if (operation === 'hide' && (await courseInTrash(id)))
        throw new ManagementError('coursetrashed');
      await run("UPDATE courses SET status='archived',updated_at=? WHERE id=?", Date.now(), id);
      if (operation === 'trash')
        await run('INSERT OR IGNORE INTO course_trash VALUES (?,?,?)', id, Date.now(), actorId);
    }
    await recordAudit(actorId, `course.${operation}`, id);
  });
}
export async function deletionSummary(actorId: string, id: string) {
  await lifecycleCourse(actorId, id);
  return (await one<{
    lessons: number;
    files: number;
    students: number;
  }>(
    `SELECT
    (SELECT COUNT(*) FROM lessons l JOIN sections s ON s.id=l.section_id WHERE s.course_id=?) lessons,
    (SELECT COUNT(*) FROM lesson_materials m JOIN lessons l ON l.id=m.lesson_id JOIN sections s ON s.id=l.section_id WHERE s.course_id=?) files,
    (SELECT COUNT(*) FROM enrollments WHERE course_id=?) students`,
    id,
    id,
    id,
  ))!;
}
export async function flushFileDeletions() {
  for (const job of await all<{
    id: string;
    kind: string;
    storage_key: string;
  }>('SELECT * FROM file_deletions ORDER BY created_at LIMIT 500')) {
    try {
      const path =
        job.kind === 'cover'
          ? coverPath(job.storage_key)
          : materialPath(job.storage_key, job.kind === 'preview');
      try {
        await deleteStored(
          `${job.kind === 'cover' ? 'covers' : 'materials'}/${job.storage_key}${job.kind === 'preview' ? '.html' : ''}`,
          path,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await run('DELETE FROM file_deletions WHERE id=?', job.id);
    } catch {
      /* A failed cleanup remains queued and can be retried. */
    }
  }
  return (await one<{
    n: number;
  }>('SELECT COUNT(*) n FROM file_deletions'))!.n;
}
export async function purgeCourse(actorId: string, id: string, title: string, confirmed: boolean) {
  await actor(actorId, ['admin']);
  const course = await lifecycleCourse(actorId, id);
  if (!(await courseInTrash(id)) || title !== course.title || !confirmed)
    throw new ManagementError('purgeconfirmation');
  await transaction(async () => {
    const files = await all<{
      storage_key: string;
      kind: string;
    }>(
      'SELECT m.storage_key,m.kind FROM lesson_materials m JOIN lessons l ON l.id=m.lesson_id JOIN sections s ON s.id=l.section_id WHERE s.course_id=?',
      id,
    );
    const queue = async (key: string, kind: string) =>
      await run('INSERT INTO file_deletions VALUES (?,?,?,?)', randomUUID(), key, kind, Date.now());
    await Promise.all(
      files.map(async (file) => {
        await queue(file.storage_key, 'material');
        if (file.kind === 'docx') await queue(file.storage_key, 'preview');
      }),
    );
    await Promise.all(
      (
        await all<{
          storage_key: string;
        }>('SELECT storage_key FROM course_cover_files WHERE course_id=?', id)
      ).map(async (file) => await queue(file.storage_key, 'cover')),
    );
    await run('DELETE FROM courses WHERE id=?', id);
    await recordAudit(actorId, 'course.purged', id);
  });
  return await flushFileDeletions();
}
