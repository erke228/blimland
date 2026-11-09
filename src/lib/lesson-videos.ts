import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { one, run, transaction } from './db';
import { canReadLesson, editableLesson } from './materials';
import { putStored, deleteStored, getStored, privateVideoUrl } from './storage';
import { recordAudit, ManagementError } from './management';
import { mp4DurationMs } from './mp4-metadata';
import { checkCourseVideoQuota as checkCourseQuota } from './video-quota';
import { MAX_VIDEO_UPLOAD_BYTES } from './video-limits';
export { MAX_VIDEO_UPLOAD_BYTES } from './video-limits';
export function videoPath(key: string) {
  if (!/^[a-f0-9-]{36}\.mp4$/.test(key)) throw Error('Invalid video key');
  return resolve(process.env.VIDEO_DIR || './uploads/videos', key);
}
export async function discardUnattachedVideo(key: string) {
  const path = videoPath(key);
  // A database commit error can be ambiguous: never delete an object that was attached.
  if (await one('SELECT lesson_id FROM lesson_videos WHERE storage_key=?', key)) {
    await run('DELETE FROM video_deletions WHERE storage_key=?', key);
    return;
  }
  await run(
    'INSERT INTO video_deletions(storage_key,created_at) VALUES(?,?) ON CONFLICT(storage_key) DO NOTHING',
    key,
    Date.now(),
  );
  try {
    await deleteStored(`videos/${key}`, path);
    await run('DELETE FROM video_deletions WHERE storage_key=?', key);
  } catch {
    // The existing durable cleanup worker will retry; do not lose the object key.
  }
}
export async function saveLessonVideo(
  actorId: string,
  lessonId: string,
  bytes: Buffer,
  durationMs: number,
  sourceId: string,
) {
  const lesson = await editableLesson(actorId, lessonId);
  if (
    !Number.isInteger(durationMs) ||
    durationMs < 1 ||
    durationMs > 90000 ||
    bytes.length > 80 * 1024 * 1024
  )
    throw Error('Invalid video or duration exceeds 90 seconds.');
  const actualDurationMs = mp4DurationMs(bytes);
  if (actualDurationMs > 90000 || Math.abs(actualDurationMs - durationMs) > 250)
    throw Error('Video duration metadata differs or exceeds 90 seconds.');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const previous = await one<{ sha256: string }>(
    'SELECT sha256 FROM lesson_videos WHERE lesson_id=?',
    lessonId,
  );
  if (previous) {
    if (previous.sha256 !== digest) throw Error('Existing video differs; refusing to overwrite.');
    return;
  }
  await checkCourseQuota(lesson.course_id, bytes.length);
  const key = `${randomUUID()}.mp4`;
  await putStored(`videos/${key}`, videoPath(key), bytes, 'video/mp4');
  try {
    await transaction(async () => {
      const currentLesson = await editableLesson(actorId, lessonId);
      // Recheck inside the serializable transaction, after potentially concurrent uploads.
      await checkCourseQuota(currentLesson.course_id, bytes.length);
      await run(
        'INSERT INTO lesson_videos VALUES(?,?,?,?,?,?,?,?)',
        lessonId,
        key,
        actualDurationMs,
        bytes.length,
        digest,
        sourceId,
        actorId,
        Date.now(),
      );
      await recordAudit(actorId, 'lesson.video_uploaded', lessonId);
    });
  } catch (error) {
    await discardUnattachedVideo(key).catch(() => {
      // With the database unavailable, attachment cannot be disproved safely.
      // Preserve the object rather than risk deleting a successfully committed video.
    });
    throw error;
  }
}
export async function replaceLessonVideo(
  actorId: string,
  lessonId: string,
  bytes: Buffer,
  expectedSha256: string,
) {
  const lesson = await editableLesson(actorId, lessonId);
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || bytes.length > MAX_VIDEO_UPLOAD_BYTES)
    throw new ManagementError('videoinvalid');
  const duration = mp4DurationMs(bytes);
  if (duration > 90000) throw new ManagementError('videolong');
  const digest = createHash('sha256').update(bytes).digest('hex');
  type CurrentVideo = { storage_key: string; sha256: string; size_bytes: number };
  const current = () =>
    one<CurrentVideo>(
      'SELECT storage_key,sha256,size_bytes FROM lesson_videos WHERE lesson_id=?',
      lessonId,
    );
  const previous = await current();
  if (!previous) throw new ManagementError('videostale');
  if (previous.sha256 === digest) return false;
  if (previous.sha256 !== expectedSha256) throw new ManagementError('videostale');
  await checkCourseQuota(lesson.course_id, bytes.length - previous.size_bytes);
  const key = `${randomUUID()}.mp4`;
  await putStored(`videos/${key}`, videoPath(key), bytes, 'video/mp4');
  try {
    const changed = await transaction(async () => {
      const editable = await editableLesson(actorId, lessonId);
      const latest = await current();
      if (!latest) throw new ManagementError('videostale');
      if (latest.sha256 === digest) return false;
      if (latest.sha256 !== expectedSha256) throw new ManagementError('videostale');
      await checkCourseQuota(editable.course_id, bytes.length - latest.size_bytes);
      const updated = await run(
        `UPDATE lesson_videos SET storage_key=?,duration_ms=?,size_bytes=?,sha256=?,source_id=?,created_by=?,created_at=? WHERE lesson_id=? AND sha256=?`,
        key,
        duration,
        bytes.length,
        digest,
        'web-replacement',
        actorId,
        Date.now(),
        lessonId,
        expectedSha256,
      );
      if (updated.changes !== 1) throw new ManagementError('videostale');
      await run(
        'INSERT INTO video_deletions(storage_key,created_at) VALUES(?,?) ON CONFLICT(storage_key) DO NOTHING',
        latest.storage_key,
        Date.now(),
      );
      await recordAudit(actorId, 'lesson.video_replaced', lessonId);
      return true;
    });
    if (!changed) await discardUnattachedVideo(key);
    return changed;
  } catch (error) {
    await discardUnattachedVideo(key).catch(() => {});
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
