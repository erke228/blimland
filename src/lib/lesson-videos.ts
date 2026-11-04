import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { one, run, transaction } from './db';
import { canReadLesson, editableLesson } from './materials';
import { putStored, deleteStored, getStored, privateVideoUrl } from './storage';
import { recordAudit } from './management';
export function videoPath(key: string) {
  if (!/^[a-f0-9-]{36}\.mp4$/.test(key)) throw Error('Invalid video key');
  return resolve(process.env.VIDEO_DIR || './uploads/videos', key);
}
export async function saveLessonVideo(
  actorId: string,
  lessonId: string,
  bytes: Buffer,
  durationMs: number,
  sourceId: string,
) {
  await editableLesson(actorId, lessonId);
  if (
    !Number.isInteger(durationMs) ||
    durationMs < 1 ||
    durationMs > 90000 ||
    bytes.length > 80 * 1024 * 1024 ||
    !bytes.subarray(0, 128).includes(Buffer.from('ftyp'))
  )
    throw Error('Invalid video or duration exceeds 90 seconds.');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const previous = await one<{ sha256: string }>(
    'SELECT sha256 FROM lesson_videos WHERE lesson_id=?',
    lessonId,
  );
  if (previous) {
    if (previous.sha256 !== digest) throw Error('Existing video differs; refusing to overwrite.');
    return;
  }
  const key = `${randomUUID()}.mp4`;
  await putStored(`videos/${key}`, videoPath(key), bytes, 'video/mp4');
  try {
    await transaction(async () => {
      await editableLesson(actorId, lessonId);
      await run(
        'INSERT INTO lesson_videos VALUES(?,?,?,?,?,?,?,?)',
        lessonId,
        key,
        durationMs,
        bytes.length,
        digest,
        sourceId,
        actorId,
        Date.now(),
      );
      await recordAudit(actorId, 'lesson.video_uploaded', lessonId);
    });
  } catch (error) {
    await deleteStored(`videos/${key}`, videoPath(key)).catch(() => {});
    throw error;
  }
}
export async function hasLessonVideo(lessonId: string) {
  return !!(await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', lessonId));
}
export async function readableVideo(lessonId: string, viewerId?: string) {
  if (!(await canReadLesson(lessonId, viewerId))) return undefined;
  const row = await one<{ storage_key: string; size_bytes: number }>(
    'SELECT storage_key,size_bytes FROM lesson_videos WHERE lesson_id=?',
    lessonId,
  );
  if (!row) return undefined;
  const url = await privateVideoUrl(`videos/${row.storage_key}`);
  return url
    ? { url, buffer: undefined }
    : {
        url: undefined,
        buffer: await getStored(`videos/${row.storage_key}`, videoPath(row.storage_key)),
      };
}
