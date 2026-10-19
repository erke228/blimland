import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { one, run } from './db';
import { managedCourse, managedLectureCover } from './course-editor';
import { actor, ManagementError, recordAudit } from './management';

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
function coverPath(key: string) {
  if (!/^[a-f0-9-]{36}\.webp$/.test(key)) throw new ManagementError('coverinvalid');
  return resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || './uploads', 'covers', key);
}
export async function uploadCourseCover(
  actorId: string,
  courseId: string,
  bytes: Buffer,
  lessonId?: string,
) {
  const check = () =>
    lessonId
      ? managedLectureCover(actorId, courseId, lessonId)
      : managedCourse(actorId, courseId, false);
  check();
  if (!bytes.length || bytes.length > MAX_COVER_BYTES) throw new ManagementError('coversize');
  const raster =
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
  if (!raster) throw new ManagementError('coverinvalid');
  let output: Buffer;
  try {
    const image = sharp(bytes, { limitInputPixels: 20000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) !== 1)
      throw new Error('format');
    output = await image
      .rotate()
      .resize(1600, 900, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ManagementError('coverinvalid');
  }
  const key = `${randomUUID()}.webp`;
  const path = coverPath(key);
  await mkdir(resolve(/* turbopackIgnore: true */ path, '..'), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ path, output, { flag: 'wx' });
  try {
    check();
    if (lessonId)
      run(
        `INSERT INTO lesson_presentation(lesson_id,cover_key,cover_version) VALUES (?,?,1) ON CONFLICT(lesson_id) DO UPDATE SET cover_key=excluded.cover_key,cover_version=lesson_presentation.cover_version+1`,
        lessonId,
        key,
      );
    else
      run(
        `INSERT INTO course_presentation(course_id,cover_key,cover_version) VALUES (?,?,1)
      ON CONFLICT(course_id) DO UPDATE SET cover_key=excluded.cover_key,cover_version=course_presentation.cover_version+1`,
        courseId,
        key,
      );
    recordAudit(
      actorId,
      lessonId ? 'lesson.cover.uploaded' : 'course.cover.uploaded',
      lessonId || courseId,
    );
  } catch (error) {
    await unlink(/* turbopackIgnore: true */ path);
    throw error;
  }
}
export async function readCourseCover(courseId: string, actorId?: string, lessonId?: string) {
  const row = one<{ owner_id: string; status: string; cover_key: string }>(
    lessonId
      ? 'SELECT c.owner_id,c.status,p.cover_key FROM courses c JOIN sections s ON s.course_id=c.id JOIN lessons l ON l.section_id=s.id JOIN lesson_presentation p ON p.lesson_id=l.id WHERE c.id=? AND l.id=?'
      : 'SELECT c.owner_id,c.status,p.cover_key FROM courses c JOIN course_presentation p ON p.course_id=c.id WHERE c.id=?',
    ...(lessonId ? [courseId, lessonId] : [courseId]),
  );
  if (!row?.cover_key) return undefined;
  if (row.status !== 'published') {
    if (!actorId) return undefined;
    try {
      const user = actor(actorId);
      if (user.role !== 'admin' && !(user.role === 'teacher' && row.owner_id === user.id))
        return undefined;
    } catch {
      return undefined;
    }
  }
  try {
    return await readFile(/* turbopackIgnore: true */ coverPath(row.cover_key));
  } catch {
    return undefined;
  }
}
export function lectureCoverPresentation(lessonId: string) {
  const row = one<{ preset: string; has_cover: number; cover_version: number }>(
    'SELECT preset,(cover_key IS NOT NULL) has_cover,cover_version FROM lesson_presentation WHERE lesson_id=?',
    lessonId,
  );
  return row
    ? {
        cover_preset: row.preset,
        has_cover: row.has_cover,
        cover_version: row.cover_version,
        cover_url: `/learn/${lessonId}/cover`,
      }
    : undefined;
}
