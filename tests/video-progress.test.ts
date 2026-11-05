import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrate, one, run } from '../src/lib/db';
import { saveVideoPosition, videoPosition } from '../src/lib/video-progress';
import { loadEnvironment } from '../scripts/postgres-environment';

if (process.env.BILIMHUB_POSTGRES_LEARNING_TEST === '1') {
  assert(process.env.APP_ENV_FILE, 'An isolated branch env file is required');
  loadEnvironment();
  assert(process.env.NEON_BRANCH?.startsWith('codex-bilimhub-verify'), 'Test branch required');
  process.env.DATABASE_DRIVER = 'postgres';
} else {
  process.env.DATABASE_PATH = ':memory:';
  process.env.DATABASE_DRIVER = 'sqlite';
  await migrate();
}
const owner = randomUUID(),
  student = randomUUID(),
  peer = randomUUID(),
  outsider = randomUUID();
for (const id of [owner, student, peer, outsider])
  await run(
    'INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',
    id,
    `${id}@video.invalid`,
    'Video test',
    'unused',
    id === owner ? 'teacher' : 'student',
    Date.now(),
  );
const course = randomUUID(),
  section = randomUUID(),
  lesson = randomUUID();
await run(
  'INSERT INTO courses(id,owner_id,title,description,category,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
  course,
  owner,
  'Video test',
  'Isolated fixture',
  'STEM',
  'published',
  Date.now(),
  Date.now(),
);
await run(
  'INSERT INTO sections(id,course_id,title,position) VALUES(?,?,?,?)',
  section,
  course,
  'Section',
  0,
);
await run(
  'INSERT INTO lessons(id,section_id,title,video_url,position) VALUES(?,?,?,?,?)',
  lesson,
  section,
  'Video',
  'https://video.invalid/video.mp4',
  0,
);
for (const id of [student, peer])
  await run(
    'INSERT INTO enrollments(user_id,course_id,created_at) VALUES(?,?,?)',
    id,
    course,
    Date.now(),
  );

test('resume is personal, supports seeking backward, and never completes a lesson', async () => {
  await saveVideoPosition(student, lesson, 24.67);
  assert.equal(await videoPosition(student, lesson), 24.7);
  assert.equal(await videoPosition(peer, lesson), 0);
  assert.equal(
    (await one<{ completed_at: number | null }>(
      'SELECT completed_at FROM lesson_progress WHERE user_id=? AND lesson_id=?',
      student,
      lesson,
    ))!.completed_at,
    null,
  );
  await saveVideoPosition(student, lesson, 5);
  assert.equal(await videoPosition(student, lesson), 5);
  await run(
    'UPDATE lesson_progress SET completed_at=? WHERE user_id=? AND lesson_id=?',
    12345,
    student,
    lesson,
  );
  await saveVideoPosition(student, lesson, 0);
  assert.equal(
    (await one<{ completed_at: number }>(
      'SELECT completed_at FROM lesson_progress WHERE user_id=? AND lesson_id=?',
      student,
      lesson,
    ))!.completed_at,
    12345,
  );
});
test('rejects nonfinite/out-of-range positions and non-enrolled or blocked users', async () => {
  for (const position of [NaN, Infinity, -1, 86401])
    await assert.rejects(saveVideoPosition(student, lesson, position));
  await assert.rejects(saveVideoPosition(outsider, lesson, 5));
  await assert.rejects(saveVideoPosition(owner, lesson, 5));
  await run("UPDATE users SET status='blocked' WHERE id=?", peer);
  await assert.rejects(saveVideoPosition(peer, lesson, 5));
  assert.equal(await videoPosition(peer, lesson), 0);
  await run("UPDATE users SET status='active' WHERE id=?", peer);
});
test('hidden courses, removed sections and lessons without video cannot save resume state', async () => {
  await saveVideoPosition(peer, lesson, 8);
  await run("UPDATE courses SET status='archived' WHERE id=?", course);
  assert.equal(await videoPosition(peer, lesson), 0);
  await assert.rejects(saveVideoPosition(peer, lesson, 9));
  await run("UPDATE courses SET status='published' WHERE id=?", course);
  await run('INSERT INTO section_trash(section_id,removed_at) VALUES(?,?)', section, Date.now());
  await assert.rejects(saveVideoPosition(peer, lesson, 9));
  await run('DELETE FROM section_trash WHERE section_id=?', section);
  await run("UPDATE lessons SET video_url='' WHERE id=?", lesson);
  await assert.rejects(saveVideoPosition(peer, lesson, 9));
  assert.equal(
    (await one<{ video_position: number }>(
      'SELECT video_position FROM lesson_progress WHERE user_id=? AND lesson_id=?',
      peer,
      lesson,
    ))!.video_position,
    8,
  );
});
test('stored duration clamps a forged position without trusting client duration or grades', async () => {
  await run(
    'INSERT INTO lesson_videos VALUES(?,?,?,?,?,?,?,?)',
    lesson,
    `${randomUUID()}.mp4`,
    60000,
    100,
    'digest',
    'fixture',
    owner,
    Date.now(),
  );
  await saveVideoPosition(peer, lesson, 900);
  assert.equal(await videoPosition(peer, lesson), 60);
  assert.equal(
    (await one<{ completed_at: number | null }>(
      'SELECT completed_at FROM lesson_progress WHERE user_id=? AND lesson_id=?',
      peer,
      lesson,
    ))!.completed_at,
    null,
  );
});
