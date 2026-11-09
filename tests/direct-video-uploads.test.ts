import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrate, one, run } from '../src/lib/db';
import {
  reserveDirectVideoUpload,
  MAX_DIRECT_VIDEO_BYTES,
  directVideoUploadOffer,
  finalizeDirectVideoUpload,
  cancelDirectVideoUpload,
  cleanDirectVideoStaging,
  cleanDirectVideoFinalObjects,
} from '../src/lib/direct-video-uploads';
import { checkCourseVideoQuota } from '../src/lib/video-quota';
import { saveLessonVideo, videoPath } from '../src/lib/lesson-videos';
import { putStored, getStored } from '../src/lib/storage';
import { writeFile, readdir, mkdir, unlink, rmdir } from 'node:fs/promises';
import { mp4Fixture } from './video-fixtures';
process.env.DATABASE_DRIVER = 'sqlite';
process.env.DATABASE_PATH = ':memory:';
process.env.DIRECT_VIDEO_UPLOAD_ENABLED = 'true';
process.env.VIDEO_COURSE_QUOTA_BYTES = '0';
process.env.STORAGE_DRIVER = 'local';
process.env.VIDEO_DIR = `.test-data/direct-reservations-${randomUUID()}`;
await migrate();
async function user(role: string) {
  const id = randomUUID();
  await run(
    'INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',
    id,
    `${id}@direct.invalid`,
    'Fixture',
    'unused',
    role,
    Date.now(),
  );
  return id;
}
async function fixture() {
  const owner = await user('teacher'),
    course = randomUUID(),
    section = randomUUID(),
    lesson = randomUUID();
  await run(
    'INSERT INTO courses(id,owner_id,title,description,category,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    course,
    owner,
    'Direct fixture',
    'Private fixture',
    'STEM',
    'draft',
    Date.now(),
    Date.now(),
  );
  await run('INSERT INTO sections VALUES(?,?,?,?)', section, course, 'Section', 0);
  await run(
    'INSERT INTO lessons(id,section_id,title,position) VALUES(?,?,?,?)',
    lesson,
    section,
    'Lecture',
    0,
  );
  return { owner, course, section, lesson };
}
test('direct preparation is disabled by default and enforces owner, draft and byte bounds when enabled', async () => {
  const f = await fixture(),
    key = randomUUID();
  delete process.env.DIRECT_VIDEO_UPLOAD_ENABLED;
  await assert.rejects(reserveDirectVideoUpload(f.owner, f.lesson, key, 100), {
    code: 'directuploadunavailable',
  });
  process.env.DIRECT_VIDEO_UPLOAD_ENABLED = 'true';
  for (const actor of [await user('student'), await user('teacher')])
    await assert.rejects(reserveDirectVideoUpload(actor, f.lesson, key, 100), {
      code: 'forbidden',
    });
  for (const size of [0, -1, 0.5, Infinity, MAX_DIRECT_VIDEO_BYTES + 1])
    await assert.rejects(reserveDirectVideoUpload(f.owner, f.lesson, key, size), {
      code: 'videoinvalid',
    });
  await run("UPDATE courses SET status='published' WHERE id=?", f.course);
  await assert.rejects(reserveDirectVideoUpload(f.owner, f.lesson, key, 100), { code: 'readonly' });
});
test('retry reserves once and cannot change the intended lesson or size', async () => {
  const f = await fixture(),
    key = randomUUID();
  const rows = await Promise.all([
    reserveDirectVideoUpload(f.owner, f.lesson, key, 1000),
    reserveDirectVideoUpload(f.owner, f.lesson, key, 1000),
  ]);
  assert.deepEqual(rows[0], rows[1]);
  assert.equal(rows[0].storage_key, `${rows[0].id}.mp4`);
  assert.equal(rows[0].expires_at - rows[0].created_at, 15 * 60 * 1000);
  await assert.rejects(reserveDirectVideoUpload(f.owner, f.lesson, key, 2000), {
    code: 'videoinvalid',
  });
  const next = randomUUID();
  await run(
    'INSERT INTO lessons(id,section_id,title,position) VALUES(?,?,?,?)',
    next,
    f.section,
    'Next',
    1,
  );
  await assert.rejects(reserveDirectVideoUpload(f.owner, next, key, 1000), {
    code: 'videoinvalid',
  });
  assert.equal(
    (await one<{ n: number }>(
      'SELECT COUNT(*) n FROM direct_video_uploads WHERE actor_id=?',
      f.owner,
    ))!.n,
    1,
  );
});
test('pending reservations consume quota atomically, including for the ordinary video writer', async () => {
  const f = await fixture();
  process.env.VIDEO_COURSE_QUOTA_BYTES = '1000';
  try {
    const results = await Promise.allSettled([
      reserveDirectVideoUpload(f.owner, f.lesson, randomUUID(), 1000),
      reserveDirectVideoUpload(f.owner, f.lesson, randomUUID(), 1000),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.code,
      'videoquota',
    );
    await assert.rejects(checkCourseVideoQuota(f.course, 1), { code: 'videoquota' });
    await assert.rejects(
      saveLessonVideo(f.owner, f.lesson, mp4Fixture(), 53000, 'ordinary-bypass'),
      { code: 'videoquota' },
    );
    assert.equal(
      await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', f.lesson),
      undefined,
    );
    await run(
      'UPDATE direct_video_uploads SET created_at=0,expires_at=1 WHERE course_id=?',
      f.course,
    );
    await assert.doesNotReject(checkCourseVideoQuota(f.course, 1000));
    const row = (await one<{ request_key: string }>(
      'SELECT request_key FROM direct_video_uploads WHERE course_id=?',
      f.course,
    ))!;
    await assert.rejects(reserveDirectVideoUpload(f.owner, f.lesson, row.request_key, 1000), {
      code: 'directuploadexpired',
    });
  } finally {
    process.env.VIDEO_COURSE_QUOTA_BYTES = '0';
  }
});
test('upload journal survives course deletion, but deletion revokes preparation access', async () => {
  const f = await fixture(),
    key = randomUUID();
  const row = await reserveDirectVideoUpload(f.owner, f.lesson, key, 1000);
  await run('DELETE FROM courses WHERE id=?', f.course);
  assert(await one('SELECT id FROM direct_video_uploads WHERE id=?', row.id));
  await assert.rejects(reserveDirectVideoUpload(f.owner, f.lesson, key, 1000), {
    code: 'forbidden',
  });
  await migrate();
  assert(await one('SELECT id FROM direct_video_uploads WHERE id=?', row.id));
});
test('a signed offer stays private and is withheld if rights or reservation change during signing', async () => {
  const f = await fixture(),
    row = await reserveDirectVideoUpload(f.owner, f.lesson, randomUUID(), 1000);
  let calls = 0;
  const sign = async () => {
    calls++;
    return { url: 'https://storage.invalid', fields: {}, expiresAt: Date.now() + 30000 };
  };
  await assert.rejects(directVideoUploadOffer(await user('teacher'), row.id, sign), {
    code: 'forbidden',
  });
  assert.equal(calls, 0);
  assert.equal(
    (await directVideoUploadOffer(f.owner, row.id, sign)).url,
    'https://storage.invalid',
  );
  await assert.rejects(
    directVideoUploadOffer(f.owner, row.id, async () => {
      await run("UPDATE courses SET status='published' WHERE id=?", f.course);
      return sign();
    }),
    { code: 'readonly' },
  );
  await run("UPDATE courses SET status='draft' WHERE id=?", f.course);
  await assert.rejects(
    directVideoUploadOffer(f.owner, row.id, async () => {
      await run("UPDATE direct_video_uploads SET state='abandoned' WHERE id=?", row.id);
      return sign();
    }),
    { code: 'directuploadexpired' },
  );
});

async function staged(bytes = mp4Fixture()) {
  const f = await fixture();
  const row = await reserveDirectVideoUpload(f.owner, f.lesson, randomUUID(), bytes.length);
  await putStored(`videos/${row.storage_key}`, videoPath(row.storage_key), bytes, 'video/mp4');
  return { ...f, row, bytes };
}

test('finalization creates immutable final bytes, derives metadata and repeats without staging', async () => {
  const f = await staged();
  process.env.VIDEO_COURSE_QUOTA_BYTES = String(f.bytes.length);
  try {
    const [a, b] = await Promise.all([
      finalizeDirectVideoUpload(f.owner, f.row.id),
      finalizeDirectVideoUpload(f.owner, f.row.id),
    ]);
    assert.deepEqual(a, b);
    assert.notEqual(a.storage_key, f.row.storage_key);
    assert.equal(a.duration_ms, 53000);
    assert.equal(a.size_bytes, f.bytes.length);
    assert.equal(
      (await one<{ state: string }>(
        'SELECT state FROM direct_video_final_objects WHERE storage_key=?',
        a.storage_key,
      ))!.state,
      'attached',
    );
    assert.match(a.sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      (await one<{ state: string }>('SELECT state FROM direct_video_uploads WHERE id=?', f.row.id))!
        .state,
      'attached',
    );
    await writeFile(videoPath(f.row.storage_key), 'late overwrite');
    assert.deepEqual(await getStored(`videos/${a.storage_key}`, videoPath(a.storage_key)), f.bytes);
    assert.deepEqual(await finalizeDirectVideoUpload(f.owner, f.row.id), a);
    const audits = await one<{ count: number }>(
      "SELECT COUNT(*) count FROM audit_log WHERE target_id=? AND action='lesson.video_uploaded'",
      f.lesson,
    );
    assert.equal(audits!.count, 1);
  } finally {
    process.env.VIDEO_COURSE_QUOTA_BYTES = '0';
  }
});

test('finalization rejects invalid bytes and keeps reservations without attaching', async () => {
  for (const kind of ['oversize', 'truncated', 'invalid', 'long']) {
    const f = await staged(kind === 'long' ? mp4Fixture(91000) : mp4Fixture());
    if (kind !== 'long')
      await writeFile(
        videoPath(f.row.storage_key),
        kind === 'oversize'
          ? Buffer.alloc(f.bytes.length + 1)
          : kind === 'truncated'
            ? f.bytes.subarray(0, -1)
            : Buffer.alloc(f.bytes.length),
      );
    await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id));
    assert.equal(
      await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', f.lesson),
      undefined,
    );
    assert.equal(
      (await one<{ state: string }>('SELECT state FROM direct_video_uploads WHERE id=?', f.row.id))!
        .state,
      'pending',
    );
  }
});

test('finalization validates actor, current rights, expiry, cancellation and quota on server', async () => {
  const f = await staged();
  process.env.DIRECT_VIDEO_UPLOAD_ENABLED = 'false';
  try {
    await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), {
      code: 'directuploadunavailable',
    });
  } finally {
    process.env.DIRECT_VIDEO_UPLOAD_ENABLED = 'true';
  }
  await assert.rejects(finalizeDirectVideoUpload(await user('teacher'), f.row.id), {
    code: 'forbidden',
  });
  await run("UPDATE courses SET status='published' WHERE id=?", f.course);
  await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), { code: 'readonly' });
  await run("UPDATE courses SET status='draft' WHERE id=?", f.course);
  await run("UPDATE users SET status='blocked' WHERE id=?", f.owner);
  await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), { code: 'forbidden' });
  await run("UPDATE users SET status='active' WHERE id=?", f.owner);
  process.env.VIDEO_COURSE_QUOTA_BYTES = String(f.bytes.length - 1);
  try {
    await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), { code: 'videoquota' });
  } finally {
    process.env.VIDEO_COURSE_QUOTA_BYTES = '0';
  }
  await run("UPDATE direct_video_uploads SET state='abandoned' WHERE id=?", f.row.id);
  await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), {
    code: 'directuploadexpired',
  });
  await run(
    "UPDATE direct_video_uploads SET state='pending',expires_at=? WHERE id=?",
    Date.now() - 1,
    f.row.id,
  );
  await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), {
    code: 'directuploadexpired',
  });
  assert.equal(
    await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', f.lesson),
    undefined,
  );
});

test('competing reservations attach once and discard the losing final object', async () => {
  const f = await staged();
  const second = await reserveDirectVideoUpload(f.owner, f.lesson, randomUUID(), f.bytes.length);
  await putStored(
    `videos/${second.storage_key}`,
    videoPath(second.storage_key),
    f.bytes,
    'video/mp4',
  );
  const before = await readdir(process.env.VIDEO_DIR!);
  const results = await Promise.allSettled([
    finalizeDirectVideoUpload(f.owner, f.row.id),
    finalizeDirectVideoUpload(f.owner, second.id),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const loser = results.find((r) => r.status === 'rejected');
  assert.equal(loser?.status === 'rejected' && loser.reason.code, 'videoexists');
  const after = await readdir(process.env.VIDEO_DIR!);
  assert.equal(after.length, before.length + 1);
});

test('attachment and journal transition roll back together when audit fails', async () => {
  const f = await staged();
  const before = await readdir(process.env.VIDEO_DIR!);
  await run(
    "CREATE TRIGGER reject_direct_audit BEFORE INSERT ON audit_log WHEN NEW.action='lesson.video_uploaded' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END",
  );
  try {
    await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), /fixture audit failure/);
    assert.equal(
      await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', f.lesson),
      undefined,
    );
    assert.equal(
      (await one<{ state: string }>('SELECT state FROM direct_video_uploads WHERE id=?', f.row.id))!
        .state,
      'pending',
    );
    assert.deepEqual(await readdir(process.env.VIDEO_DIR!), before);
    const finalJournal = await one<{ state: string; storage_key: string }>(
      'SELECT state,storage_key FROM direct_video_final_objects WHERE reservation_id=?',
      f.row.id,
    );
    assert.equal(finalJournal!.state, 'pending');
    assert.notEqual(finalJournal!.storage_key, f.row.storage_key);
  } finally {
    await run('DROP TRIGGER reject_direct_audit');
  }
  await finalizeDirectVideoUpload(f.owner, f.row.id);
});

test('final attempt keys survive course deletion and repeated migrations for late-write cleanup', async () => {
  const f = await staged();
  const video = await finalizeDirectVideoUpload(f.owner, f.row.id);
  await run('DELETE FROM courses WHERE id=?', f.course);
  await migrate();
  const journal = await one<{ reservation_id: string; state: string }>(
    'SELECT reservation_id,state FROM direct_video_final_objects WHERE storage_key=?',
    video.storage_key,
  );
  assert.equal(journal!.reservation_id, f.row.id);
  assert.equal(journal!.state, 'attached');
});

test('cancel is owner-scoped, idempotent, releases quota and preserves a late-write journal', async () => {
  const f = await staged();
  await assert.rejects(cancelDirectVideoUpload(await user('admin'), f.row.id), {
    code: 'forbidden',
  });
  await run('UPDATE courses SET owner_id=? WHERE id=?', await user('teacher'), f.course);
  process.env.DIRECT_VIDEO_UPLOAD_ENABLED = 'false';
  try {
    assert.equal(await cancelDirectVideoUpload(f.owner, f.row.id), true);
    assert.equal(await cancelDirectVideoUpload(f.owner, f.row.id), false);
  } finally {
    process.env.DIRECT_VIDEO_UPLOAD_ENABLED = 'true';
  }
  await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), { code: 'forbidden' });
  await run('UPDATE courses SET owner_id=? WHERE id=?', f.owner, f.course);
  await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), {
    code: 'directuploadexpired',
  });
  process.env.VIDEO_COURSE_QUOTA_BYTES = String(f.bytes.length);
  try {
    await reserveDirectVideoUpload(f.owner, f.lesson, randomUUID(), f.bytes.length);
  } finally {
    process.env.VIDEO_COURSE_QUOTA_BYTES = '0';
  }
  const audits = await one<{ count: number }>(
    "SELECT COUNT(*) count FROM audit_log WHERE target_id=? AND action='lesson.video_upload_cancelled'",
    f.lesson,
  );
  assert.equal(audits!.count, 1);
});

test('cleanup revisits late staging, retains active uploads and never removes final video', async () => {
  const attached = await staged(),
    active = await staged(),
    expired = await staged();
  const video = await finalizeDirectVideoUpload(attached.owner, attached.row.id);
  await assert.rejects(cancelDirectVideoUpload(attached.owner, attached.row.id), {
    code: 'videoexists',
  });
  await run(
    'UPDATE direct_video_uploads SET created_at=?,expires_at=? WHERE id=?',
    Date.now() - 20000,
    Date.now() - 10000,
    expired.row.id,
  );
  await run('DELETE FROM courses WHERE id=?', expired.course);
  async function sweep() {
    let cursor = '';
    do {
      const batch = await cleanDirectVideoStaging(cursor, 2);
      cursor = batch.nextCursor;
    } while (cursor);
  }
  await sweep();
  for (const f of [attached, expired]) {
    await assert.rejects(getStored(`videos/${f.row.storage_key}`, videoPath(f.row.storage_key)), {
      code: 'ENOENT',
    });
    assert(await one('SELECT id FROM direct_video_uploads WHERE id=?', f.row.id));
  }
  assert.deepEqual(
    await getStored(`videos/${active.row.storage_key}`, videoPath(active.row.storage_key)),
    active.bytes,
  );
  assert.deepEqual(
    await getStored(`videos/${video.storage_key}`, videoPath(video.storage_key)),
    attached.bytes,
  );
  await writeFile(videoPath(expired.row.storage_key), 'late in-flight upload');
  await sweep();
  await assert.rejects(
    getStored(`videos/${expired.row.storage_key}`, videoPath(expired.row.storage_key)),
    { code: 'ENOENT' },
  );
  assert.equal(
    (await one<{ state: string }>(
      'SELECT state FROM direct_video_uploads WHERE id=?',
      expired.row.id,
    ))!.state,
    'abandoned',
  );
});

test('cleanup failures retain retryable journals and referenced-key protection', async () => {
  const f = await staged();
  await cancelDirectVideoUpload(f.owner, f.row.id);
  await unlink(videoPath(f.row.storage_key));
  await mkdir(videoPath(f.row.storage_key));
  try {
    assert((await cleanDirectVideoStaging('', 100)).failed >= 1);
    assert(await one('SELECT id FROM direct_video_uploads WHERE id=?', f.row.id));
  } finally {
    await rmdir(videoPath(f.row.storage_key));
  }
  const attached = await staged();
  await finalizeDirectVideoUpload(attached.owner, attached.row.id);
  await run(
    'UPDATE lesson_videos SET storage_key=? WHERE lesson_id=?',
    attached.row.storage_key,
    attached.lesson,
  );
  assert((await cleanDirectVideoStaging('', 100)).failed >= 1);
  assert.deepEqual(
    await getStored(`videos/${attached.row.storage_key}`, videoPath(attached.row.storage_key)),
    attached.bytes,
  );
  for (const count of [0, 101, 1.5]) await assert.rejects(cleanDirectVideoStaging('', count));
  await assert.rejects(cleanDirectVideoStaging('../bad', 1));
});

test('cancel racing finalization cannot abandon an attached video or resurrect cancellation', async () => {
  const f = await staged();
  const [finished, cancelled] = await Promise.allSettled([
    finalizeDirectVideoUpload(f.owner, f.row.id),
    cancelDirectVideoUpload(f.owner, f.row.id),
  ]);
  const journal = (await one<{ state: string }>(
    'SELECT state FROM direct_video_uploads WHERE id=?',
    f.row.id,
  ))!;
  const attached = await one<{ storage_key: string }>(
    'SELECT storage_key FROM lesson_videos WHERE lesson_id=?',
    f.lesson,
  );
  if (journal.state === 'attached') {
    assert.equal(finished.status, 'fulfilled');
    assert.equal(cancelled.status === 'rejected' && cancelled.reason.code, 'videoexists');
    assert(attached);
  } else {
    assert.equal(journal.state, 'abandoned');
    assert.equal(cancelled.status, 'fulfilled');
    assert.equal(finished.status === 'rejected' && finished.reason.code, 'directuploadexpired');
    assert.equal(attached, undefined);
  }
  await cleanDirectVideoStaging('', 100);
  if (attached)
    assert.deepEqual(
      await getStored(`videos/${attached.storage_key}`, videoPath(attached.storage_key)),
      f.bytes,
    );
});

test('final cleanup keeps active attempts, repeatedly removes late terminal objects and retains journal', async () => {
  const f = await staged(),
    key = `${randomUUID()}.mp4`;
  await run(
    "INSERT INTO direct_video_final_objects VALUES(?,?,'pending',?)",
    key,
    f.row.id,
    Date.now(),
  );
  await putStored(`videos/${key}`, videoPath(key), f.bytes, 'video/mp4');
  await cleanDirectVideoFinalObjects('', 100);
  assert.deepEqual(await getStored(`videos/${key}`, videoPath(key)), f.bytes);
  await cancelDirectVideoUpload(f.owner, f.row.id);
  async function sweep() {
    let cursor = '';
    do {
      cursor = (await cleanDirectVideoFinalObjects(cursor, 1)).nextCursor;
    } while (cursor);
  }
  await sweep();
  await assert.rejects(getStored(`videos/${key}`, videoPath(key)), { code: 'ENOENT' });
  await writeFile(videoPath(key), 'late PUT');
  await sweep();
  await assert.rejects(getStored(`videos/${key}`, videoPath(key)), { code: 'ENOENT' });
  assert(await one('SELECT storage_key FROM direct_video_final_objects WHERE storage_key=?', key));
});

test('final cleanup handles expiry/missing reservation, protects referenced keys and retries failures', async () => {
  const f = await staged(),
    key = `${randomUUID()}.mp4`;
  await run(
    "INSERT INTO direct_video_final_objects VALUES(?,?,'pending',?)",
    key,
    f.row.id,
    Date.now(),
  );
  await putStored(`videos/${key}`, videoPath(key), f.bytes, 'video/mp4');
  await run(
    'UPDATE direct_video_uploads SET created_at=?,expires_at=? WHERE id=?',
    Date.now() - 20000,
    Date.now() - 10000,
    f.row.id,
  );
  await cleanDirectVideoFinalObjects('', 100);
  assert.equal(
    (await one<{ state: string }>('SELECT state FROM direct_video_uploads WHERE id=?', f.row.id))!
      .state,
    'abandoned',
  );
  await assert.rejects(finalizeDirectVideoUpload(f.owner, f.row.id), {
    code: 'directuploadexpired',
  });
  await run('DELETE FROM courses WHERE id=?', f.course);
  await run('DELETE FROM direct_video_uploads WHERE id=?', f.row.id);
  await mkdir(videoPath(key));
  try {
    assert((await cleanDirectVideoFinalObjects('', 100)).failed > 0);
  } finally {
    await rmdir(videoPath(key));
  }
  await writeFile(videoPath(key), 'late missing parent');
  await cleanDirectVideoFinalObjects('', 100);
  await assert.rejects(getStored(`videos/${key}`, videoPath(key)), { code: 'ENOENT' });
  const good = await staged(),
    video = await finalizeDirectVideoUpload(good.owner, good.row.id);
  await cleanDirectVideoFinalObjects('', 100);
  assert.deepEqual(
    await getStored(`videos/${video.storage_key}`, videoPath(video.storage_key)),
    good.bytes,
  );
  await run(
    "UPDATE direct_video_final_objects SET state='pending' WHERE storage_key=?",
    video.storage_key,
  );
  assert((await cleanDirectVideoFinalObjects('', 100)).failed > 0);
  assert.deepEqual(
    await getStored(`videos/${video.storage_key}`, videoPath(video.storage_key)),
    good.bytes,
  );
  for (const n of [0, 101, 1.5]) await assert.rejects(cleanDirectVideoFinalObjects('', n));
  await assert.rejects(cleanDirectVideoFinalObjects('../bad', 1));
});
