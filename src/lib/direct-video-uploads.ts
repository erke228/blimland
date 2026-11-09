import { randomUUID, createHash } from 'node:crypto';
import { all, one, run, transaction } from './db';
import { editableLesson } from './materials';
import { actor, ManagementError, recordAudit } from './management';
import { checkCourseVideoQuota, directVideoUploadsEnabled } from './video-quota';
import { MAX_DIRECT_VIDEO_BYTES } from './video-limits';
import { privateVideoUploadPost, getReservedVideoBytes, putStored, deleteStored } from './storage';
import { discardUnattachedVideo, videoPath } from './lesson-videos';
import { mp4DurationMs } from './mp4-metadata';

export { MAX_DIRECT_VIDEO_BYTES } from './video-limits';
export type DirectVideoReservation = {
  id: string;
  actor_id: string;
  lesson_id: string;
  course_id: string;
  request_key: string;
  storage_key: string;
  expected_bytes: number;
  state: 'pending' | 'attached' | 'abandoned' | 'cleaned';
  created_at: number;
  expires_at: number;
};
type AttachedVideo = {
  storage_key: string;
  duration_ms: number;
  size_bytes: number;
  sha256: string;
  source_id: string;
};

// A user can abandon their own pending upload even after losing course ownership.
// This releases the reservation, not the already issued signature or attached lesson video.
export async function cancelDirectVideoUpload(actorId: string, reservationId: string) {
  return transaction(async () => {
    await actor(actorId);
    const row = await one<DirectVideoReservation>(
      'SELECT * FROM direct_video_uploads WHERE id=? AND actor_id=?',
      reservationId,
      actorId,
    );
    if (!row) throw new ManagementError('forbidden');
    if (row.state === 'attached') throw new ManagementError('videoexists');
    if (row.state !== 'pending') return false;
    await run("UPDATE direct_video_uploads SET state='abandoned' WHERE id=?", row.id);
    await recordAudit(actorId, 'lesson.video_upload_cancelled', row.lesson_id);
    return true;
  });
}

// Internal maintenance, deliberately not a public route. Restart scans from '' after each cycle.
// Keep journals and retry even successful deletes: a valid/in-flight POST may recreate staging.
export async function cleanDirectVideoStaging(afterId = '', limit = 25) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (afterId && !/^[a-f0-9-]{36}$/.test(afterId))
  )
    throw new Error('Invalid staging cleanup batch.');
  const rows = await all<DirectVideoReservation>(
    `SELECT * FROM direct_video_uploads WHERE id>? AND
     (state IN ('attached','abandoned') OR (state='pending' AND expires_at<=?)) ORDER BY id LIMIT ?`,
    afterId,
    Date.now(),
    limit,
  );
  let removed = 0,
    failed = 0;
  for (const row of rows) {
    try {
      await transaction(async () => {
        await run(
          "UPDATE direct_video_uploads SET state='abandoned' WHERE id=? AND state='pending' AND expires_at<=?",
          row.id,
          Date.now(),
        );
      });
      // Never remove a referenced key, including legacy/corrupt rows violating staging isolation.
      if (await one('SELECT lesson_id FROM lesson_videos WHERE storage_key=?', row.storage_key))
        throw new Error('Staging key is referenced.');
      await deleteStored(`videos/${row.storage_key}`, videoPath(row.storage_key));
      removed++;
    } catch {
      failed++;
    }
  }
  return {
    checked: rows.length,
    removed,
    failed,
    nextCursor: rows.length === limit ? rows.at(-1)!.id : '',
  };
}

// Retry terminal pending attempts on every cycle, including objects recreated by late PUTs.
export async function cleanDirectVideoFinalObjects(afterKey = '', limit = 25) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (afterKey && !/^[a-f0-9-]{36}\.mp4$/.test(afterKey))
  )
    throw new Error('Invalid final cleanup batch.');
  const rows = await all<{ storage_key: string; reservation_id: string }>(
    `SELECT f.storage_key,f.reservation_id FROM direct_video_final_objects f
     LEFT JOIN direct_video_uploads r ON r.id=f.reservation_id
     WHERE f.storage_key>? AND f.state='pending' AND
       (r.id IS NULL OR r.state<>'pending' OR r.expires_at<=?) ORDER BY f.storage_key LIMIT ?`,
    afterKey,
    Date.now(),
    limit,
  );
  let removed = 0,
    failed = 0;
  for (const row of rows) {
    try {
      const eligible = await transaction(async () => {
        // The expiry transition conflicts with concurrent final attachment on PostgreSQL.
        await run(
          "UPDATE direct_video_uploads SET state='abandoned' WHERE id=? AND state='pending' AND expires_at<=?",
          row.reservation_id,
          Date.now(),
        );
        const attempt = await one<{ state: string }>(
          'SELECT state FROM direct_video_final_objects WHERE storage_key=?',
          row.storage_key,
        );
        const reservation = await one<{ state: string; expires_at: number }>(
          'SELECT state,expires_at FROM direct_video_uploads WHERE id=?',
          row.reservation_id,
        );
        return attempt?.state === 'pending' && (!reservation || reservation.state !== 'pending');
      });
      if (!eligible) continue;
      if (await one('SELECT lesson_id FROM lesson_videos WHERE storage_key=?', row.storage_key))
        throw new Error('Final object is referenced.');
      await deleteStored(`videos/${row.storage_key}`, videoPath(row.storage_key));
      removed++;
    } catch {
      failed++;
    }
  }
  // No journal deletion: a successful DELETE is not proof that a late PUT cannot recreate it.
  return {
    checked: rows.length,
    removed,
    failed,
    nextCursor: rows.length === limit ? rows.at(-1)!.storage_key : '',
  };
}

// Internal engine only: no HTTP endpoint until the cleanup and real storage flow are verified.
export async function finalizeDirectVideoUpload(actorId: string, reservationId: string) {
  async function check() {
    if (!directVideoUploadsEnabled()) throw new ManagementError('directuploadunavailable');
    const row = await one<DirectVideoReservation>(
      'SELECT * FROM direct_video_uploads WHERE id=? AND actor_id=?',
      reservationId,
      actorId,
    );
    if (!row) throw new ManagementError('forbidden');
    const lesson = await editableLesson(actorId, row.lesson_id);
    if (lesson.course_id !== row.course_id) throw new ManagementError('forbidden');
    const attached = await one<AttachedVideo>(
      'SELECT storage_key,duration_ms,size_bytes,sha256,source_id FROM lesson_videos WHERE lesson_id=?',
      row.lesson_id,
    );
    if (row.state === 'attached' && attached?.source_id === `direct:${row.id}`)
      return { row, attached: { ...attached } };
    if (row.state !== 'pending' || row.expires_at <= Date.now())
      throw new ManagementError('directuploadexpired');
    if (attached) throw new ManagementError('videoexists');
    await checkCourseVideoQuota(row.course_id, row.expected_bytes, row.id);
    return { row, attached: undefined };
  }
  const initial = await check();
  if (initial.attached) return initial.attached;
  const { row } = initial;
  const bytes = await getReservedVideoBytes(
    `videos/${row.storage_key}`,
    videoPath(row.storage_key),
    row.expected_bytes,
  );
  const duration = mp4DurationMs(bytes);
  if (duration > 90000) throw new ManagementError('videolong');
  const digest = createHash('sha256').update(bytes).digest('hex');
  // Never attach the writable staging key; a still-valid POST must not mutate published bytes.
  const key = `${randomUUID()}.mp4`;
  // Persist before any object write: a timeout/delete is not proof that a remote PUT cannot finish late.
  const alreadyAttached = await transaction(async () => {
    const current = await check();
    if (current.attached) return current.attached;
    await run(
      "INSERT INTO direct_video_final_objects(storage_key,reservation_id,state,created_at) VALUES(?,?,'pending',?)",
      key,
      row.id,
      Date.now(),
    );
  });
  if (alreadyAttached) return alreadyAttached;
  try {
    await putStored(`videos/${key}`, videoPath(key), bytes, 'video/mp4');
    const result = await transaction(async () => {
      const current = await check();
      if (current.attached) return current.attached;
      await run(
        'INSERT INTO lesson_videos VALUES(?,?,?,?,?,?,?,?)',
        row.lesson_id,
        key,
        duration,
        bytes.length,
        digest,
        `direct:${row.id}`,
        actorId,
        Date.now(),
      );
      await run(
        "UPDATE direct_video_uploads SET state='attached' WHERE id=? AND state='pending'",
        row.id,
      );
      await run("UPDATE direct_video_final_objects SET state='attached' WHERE storage_key=?", key);
      await recordAudit(actorId, 'lesson.video_uploaded', row.lesson_id);
      return {
        storage_key: key,
        duration_ms: duration,
        size_bytes: bytes.length,
        sha256: digest,
        source_id: `direct:${row.id}`,
      };
    });
    if (result.storage_key !== key) await discardUnattachedVideo(key);
    return result;
  } catch (error) {
    // An ambiguous commit must never delete a referenced video. Keep staging journal for late writes.
    await discardUnattachedVideo(key).catch(() => {});
    throw error;
  }
}
// Preparation only: this does not issue an upload URL or attach a video.
export async function reserveDirectVideoUpload(
  actorId: string,
  lessonId: string,
  requestKey: string,
  expectedBytes: number,
) {
  if (!directVideoUploadsEnabled()) throw new ManagementError('directuploadunavailable');
  if (
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(requestKey) ||
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes < 1 ||
    expectedBytes > MAX_DIRECT_VIDEO_BYTES
  )
    throw new ManagementError('videoinvalid');
  return transaction(async () => {
    const lesson = await editableLesson(actorId, lessonId);
    if (await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', lessonId))
      throw new ManagementError('videoexists');
    const previous = await one<DirectVideoReservation>(
      'SELECT * FROM direct_video_uploads WHERE actor_id=? AND request_key=?',
      actorId,
      requestKey,
    );
    if (previous) {
      if (previous.lesson_id !== lessonId || previous.expected_bytes !== expectedBytes)
        throw new ManagementError('videoinvalid');
      if (previous.state !== 'pending' || previous.expires_at <= Date.now())
        throw new ManagementError('directuploadexpired');
      return previous;
    }
    await checkCourseVideoQuota(lesson.course_id, expectedBytes);
    const id = randomUUID(),
      now = Date.now();
    await run(
      `INSERT INTO direct_video_uploads(id,actor_id,lesson_id,course_id,request_key,storage_key,expected_bytes,state,created_at,expires_at)
      VALUES(?,?,?,?,?,?,?,'pending',?,?)`,
      id,
      actorId,
      lessonId,
      lesson.course_id,
      requestKey,
      `${id}.mp4`,
      expectedBytes,
      now,
      now + 15 * 60 * 1000,
    );
    return (await one<DirectVideoReservation>(
      'SELECT * FROM direct_video_uploads WHERE id=?',
      id,
    ))!;
  });
}
export async function directVideoUploadOffer(
  actorId: string,
  reservationId: string,
  signer = privateVideoUploadPost,
) {
  if (!directVideoUploadsEnabled()) throw new ManagementError('directuploadunavailable');
  const row = await one<DirectVideoReservation>(
    'SELECT * FROM direct_video_uploads WHERE id=? AND actor_id=?',
    reservationId,
    actorId,
  );
  if (!row) throw new ManagementError('forbidden');
  if (row.state !== 'pending' || row.expires_at <= Date.now())
    throw new ManagementError('directuploadexpired');
  await editableLesson(actorId, row.lesson_id);
  if (await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', row.lesson_id))
    throw new ManagementError('videoexists');
  const offer = await signer(row);
  // Creating a signature is not authority to disclose it after access/state has changed.
  await editableLesson(actorId, row.lesson_id);
  const active = await one(
    'SELECT id FROM direct_video_uploads WHERE id=? AND actor_id=? AND state=? AND expires_at>?',
    row.id,
    actorId,
    'pending',
    Date.now(),
  );
  if (!directVideoUploadsEnabled()) throw new ManagementError('directuploadunavailable');
  if (await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', row.lesson_id))
    throw new ManagementError('videoexists');
  await checkCourseVideoQuota(row.course_id, 0);
  if (!active || offer.expiresAt > row.expires_at || offer.expiresAt <= Date.now())
    throw new ManagementError('directuploadexpired');
  return offer;
}
