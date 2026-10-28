import { randomUUID } from 'node:crypto';
import { putStored, deleteStored } from './storage';
import { actor, ManagementError, recordAudit } from './management';
import { courseInput } from './course-editor';
import { coverPresets } from './cover-presets';
import { imageWebp } from './images';
import { coverPath } from './course-covers';
import { run, transaction } from './db';
export async function createCourseWithBanner(
  actorId: string,
  input: unknown,
  preset = 'books',
  bytes?: Buffer,
) {
  await actor(actorId, ['teacher', 'admin']);
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) throw new ManagementError('courseform');
  if (!coverPresets.some((p) => p.id === preset)) throw new ManagementError('coverinvalid');
  const output = bytes ? await imageWebp(bytes, 1600, 900) : undefined;
  const id = randomUUID(),
    key = output ? `${randomUUID()}.webp` : undefined;
  if (output && key) {
    const path = coverPath(key);
    await putStored(`covers/${key}`, path, output, 'image/webp');
  }
  try {
    await transaction(async () => {
      await actor(actorId, ['teacher', 'admin']);
      const c = parsed.data;
      await run(
        'INSERT INTO courses (id,owner_id,title,description,category,level,status,accent,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        id,
        actorId,
        c.title,
        c.description,
        c.category,
        c.level,
        'draft',
        'teal',
        Date.now(),
        Date.now(),
      );
      await run('INSERT INTO sections VALUES (?,?,?,?)', randomUUID(), id, 'Дәрістер', 0);
      await run(
        'INSERT INTO course_presentation VALUES (?,?,?,?)',
        id,
        preset,
        key || null,
        key ? 1 : 0,
      );
      if (key) await run('INSERT INTO course_cover_files VALUES (?,?)', id, key);
      await recordAudit(actorId, 'course.created', id);
    });
  } catch (error) {
    if (key) await deleteStored(`covers/${key}`, coverPath(key)).catch(() => {});
    throw error;
  }
  return id;
}
