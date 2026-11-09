import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readdir, mkdir, rmdir, writeFile, readFile } from 'node:fs/promises';
import { all, migrate, one, run } from '../src/lib/db';
import {
  publicQuiz,
  submitQuiz,
  latestAttempt,
  reviewQueue,
  gradeShortAnswer,
  ownAttemptFeedback,
} from '../src/lib/assessments';
import { practiceDownload, lessonPractice } from '../src/lib/practices';
import { createCourseWithBanner } from '../src/lib/course-creation';
import { writeLesson } from '../src/lib/course-editor';
import {
  saveLessonVideo,
  readableVideo,
  discardUnattachedVideo,
  videoPath,
  replaceLessonVideo,
} from '../src/lib/lesson-videos';
import {
  changeCourseVisibility,
  purgeCourse,
  flushFileDeletions,
} from '../src/lib/course-lifecycle';
import { auditPresentation } from '../src/lib/audit-presentation';
import { loadEnvironment } from '../scripts/postgres-environment';
import { mp4Fixture } from './video-fixtures';
const postgres = process.env.BILIMHUB_POSTGRES_LEARNING_TEST === '1';
if (postgres) {
  if (!process.env.APP_ENV_FILE) throw Error('Explicit test branch configuration required.');
  loadEnvironment();
  if (!process.env.NEON_BRANCH?.startsWith('codex-bilimhub-verify'))
    throw Error('Refusing fixtures outside verification branch.');
  process.env.DATABASE_DRIVER = 'postgres';
} else {
  process.env.DATABASE_PATH = ':memory:';
  await migrate();
}
process.env.STORAGE_DRIVER = 'local';
process.env.VIDEO_COURSE_QUOTA_BYTES = '0';
process.env.VIDEO_DIR = `.test-data/videos-${randomUUID()}`;
async function user(role: string) {
  const id = randomUUID();
  await run(
    'INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',
    id,
    `${id}@test.invalid`,
    role,
    'unused',
    role,
    Date.now(),
  );
  return id;
}
const teacher = await user('teacher'),
  foreign = await user('teacher'),
  student = await user('student'),
  outsider = await user('student');
const course = await createCourseWithBanner(teacher, {
  title: 'Практика және тесттер',
  description: 'Студенттердің білімін тексеретін нақты оқу курсы.',
  category: 'STEM',
  level: 'Бастапқы',
});
const section = (await one<{ id: string }>('SELECT id FROM sections WHERE course_id=?', course))!
  .id;
const lesson = await writeLesson(teacher, course, {
  id: '',
  sectionId: section,
  title: 'Бірінші дәріс',
  body: 'Толық дәріс материалы.',
  videoUrl: '',
  minutes: 20,
  preview: false,
  summary: '',
  objectives: '',
});
await run(
  'INSERT INTO lesson_quizzes VALUES(?,?,?,?,?,?,?)',
  lesson,
  'Білімді тексеру',
  1,
  3,
  20,
  teacher,
  Date.now(),
);
const choice = `${lesson}-choice`,
  written = `${lesson}-written`;
await run(
  'INSERT INTO quiz_questions VALUES(?,?,?,?,?,?,?,?)',
  choice,
  lesson,
  0,
  'single_choice',
  '2+3?',
  '["4","5","6"]',
  '{"correct_index":1,"explanation":"private-key-example"}',
  2,
);
await run(
  'INSERT INTO quiz_questions VALUES(?,?,?,?,?,?,?,?)',
  written,
  lesson,
  1,
  'short_answer',
  'Шешімді түсіндіріңіз.',
  '[]',
  '{"sample_answer":"private-sample-answer","rubric":"0-2"}',
  2,
);
await run(
  'INSERT INTO lesson_practices VALUES(?,?,?,?,?,?,?)',
  lesson,
  'Python',
  'Есептеңіз.',
  'print(2+3)',
  'print(2+3)',
  '',
  '5',
);
await run('INSERT INTO enrollments VALUES(?,?,?)', student, course, Date.now());
const denied = (e: unknown) => e instanceof Error && e.message === 'forbidden';
test('assessment and practice access: draft, unregistered, unrelated teacher, blocked student', async () => {
  await assert.rejects(() => publicQuiz(lesson, student), denied);
  assert.equal(await practiceDownload(lesson, outsider), undefined);
  await assert.rejects(() => reviewQueue(foreign, course), denied);
  await run("UPDATE courses SET status='published' WHERE id=?", course);
  assert(await publicQuiz(lesson, outsider));
  assert(await publicQuiz(lesson));
  await assert.rejects(() =>
    submitQuiz(outsider, lesson, randomUUID(), { [choice]: '1', [written]: 'test' }),
  );
  await run("UPDATE users SET status='blocked' WHERE id=?", student);
  await assert.rejects(
    () => submitQuiz(student, lesson, randomUUID(), { [choice]: '1', [written]: 'test' }),
    denied,
  );
  await run("UPDATE users SET status='active' WHERE id=?", student);
});
test('public questions contain neither keys nor explanations; no claimed score can be posted', async () => {
  const quiz = await publicQuiz(lesson, student);
  assert.equal(quiz!.questions.length, 2);
  const encoded = JSON.stringify(quiz);
  assert(!/answer_json|correct_index|private-key|private-sample/.test(encoded));
  const practice = await lessonPractice(lesson, student);
  assert.equal(Object.getPrototypeOf(practice!), Object.prototype);
  await assert.rejects(() =>
    submitQuiz(student, lesson, randomUUID(), { [choice]: '1', [written]: 'text', points: '999' }),
  );
  await assert.rejects(() =>
    submitQuiz(student, lesson, randomUUID(), { [choice]: '999', [written]: 'text' }),
  );
});
let attempt: string;
test('server scoring, idempotency and awaiting manual review', async () => {
  const key = randomUUID();
  attempt = await submitQuiz(student, lesson, key, { [choice]: '1', [written]: 'Менің шешімім.' });
  assert.equal(
    await submitQuiz(student, lesson, key, { [choice]: '0', [written]: 'changed' }),
    attempt,
  );
  const row = await latestAttempt(student, lesson);
  assert.equal(row!.points, 2);
  assert.equal(row!.max_points, 4);
  assert.equal(row!.status, 'awaiting_review');
  assert.equal(
    (await one<{ n: number }>('SELECT COUNT(*) n FROM quiz_attempts WHERE lesson_id=?', lesson))!.n,
    1,
  );
});
test('only owning teacher/admin grades, bounded points and retained question snapshot', async () => {
  await assert.rejects(() => gradeShortAnswer(student, attempt, written, 2, ''), denied);
  await assert.rejects(() => gradeShortAnswer(foreign, attempt, written, 2, ''), denied);
  await assert.rejects(() => gradeShortAnswer(teacher, attempt, written, 3, ''));
  await assert.rejects(() => gradeShortAnswer(teacher, attempt, choice, 2, ''));
  await gradeShortAnswer(teacher, attempt, written, 1, 'Негіздемені толықтырыңыз.');
  let row = await latestAttempt(student, lesson);
  assert.equal(row!.points, 3);
  assert.equal(row!.status, 'graded');
  await gradeShortAnswer(teacher, attempt, written, 2, 'Толық жауап.');
  await assert.rejects(() => ownAttemptFeedback(outsider, attempt), denied);
  const feedback = await ownAttemptFeedback(student, attempt);
  assert.equal(feedback[0].feedback, 'Толық жауап.');
  assert(!/answer_json|private-key|private-sample/.test(JSON.stringify(feedback)));
  row = await latestAttempt(student, lesson);
  assert.equal(row!.points, 4);
});
test('three daily attempts; retries reuse an existing attempt and do not consume another slot', async () => {
  await submitQuiz(student, lesson, randomUUID(), { [choice]: '0', [written]: 'a' });
  const key = randomUUID();
  const id = await submitQuiz(student, lesson, key, { [choice]: '0', [written]: 'b' });
  await assert.rejects(
    () => submitQuiz(student, lesson, randomUUID(), { [choice]: '1', [written]: 'c' }),
    (e) => e instanceof Error && e.message === 'attemptlimit',
  );
  assert.equal(await submitQuiz(student, lesson, key, { [choice]: '1', [written]: 'c' }), id);
});
test('private videos reject overlong clips and enforce lecture access', async () => {
  await run("UPDATE courses SET status='draft' WHERE id=?", course);
  const bytes = mp4Fixture();
  await assert.rejects(() =>
    saveLessonVideo(teacher, lesson, mp4Fixture(120000), 53000, 'forged-duration'),
  );
  await assert.rejects(() =>
    saveLessonVideo(teacher, lesson, Buffer.from('0000ftypmp42fake'), 53000, 'fake-file'),
  );
  await assert.rejects(() => saveLessonVideo(teacher, lesson, bytes, 90001, 'source'));
  await saveLessonVideo(teacher, lesson, bytes, 53000, 'source');
  assert.equal(await readableVideo(lesson, outsider), undefined);
  assert((await readableVideo(lesson, teacher))!.buffer!.equals(bytes));
  await run("UPDATE courses SET status='published' WHERE id=?", course);
  assert((await readableVideo(lesson, student))!.buffer!.equals(bytes));
  assert((await readableVideo(lesson))!.buffer!.equals(bytes));
  assert((await readableVideo(lesson, outsider))!.buffer!.equals(bytes));
  assert(await practiceDownload(lesson));
  await run("UPDATE courses SET status='archived' WHERE id=?", course);
  assert.equal(await readableVideo(lesson), undefined);
  assert.equal(await practiceDownload(lesson), undefined);
  await run("UPDATE courses SET status='published' WHERE id=?", course);
});
test('explicit video replacement rejects stale edits and preserves progress and quiz history', async () => {
  const original = mp4Fixture(),
    next = mp4Fixture(60000);
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  await assert.rejects(replaceLessonVideo(teacher, lesson, next, hash(original)), {
    code: 'readonly',
  });
  await run("UPDATE courses SET status='draft' WHERE id=?", course);
  await assert.rejects(replaceLessonVideo(student, lesson, next, hash(original)), {
    code: 'forbidden',
  });
  await assert.rejects(replaceLessonVideo(foreign, lesson, next, hash(original)), {
    code: 'forbidden',
  });
  await assert.rejects(replaceLessonVideo(teacher, lesson, next, '0'.repeat(64)), {
    code: 'videostale',
  });
  await run(
    'INSERT INTO lesson_progress(user_id,lesson_id,completed_at,video_position) VALUES(?,?,?,?)',
    student,
    lesson,
    12345,
    12,
  );
  const progress = await one(
    'SELECT * FROM lesson_progress WHERE user_id=? AND lesson_id=?',
    student,
    lesson,
  );
  const attempts = await all('SELECT * FROM quiz_attempts WHERE lesson_id=? ORDER BY id', lesson);
  process.env.VIDEO_COURSE_QUOTA_BYTES = String(original.length);
  try {
    await assert.rejects(
      replaceLessonVideo(teacher, lesson, mp4Fixture(60000, 1), hash(original)),
      { code: 'videoquota' },
    );
    assert((await readableVideo(lesson, teacher))!.buffer!.equals(original));
    assert.equal(await replaceLessonVideo(teacher, lesson, next, hash(original)), true);
    const events = (await one<{ n: number }>(
      "SELECT COUNT(*) n FROM audit_log WHERE target_id=? AND action='lesson.video_replaced'",
      lesson,
    ))!.n;
    assert.equal(
      await replaceLessonVideo(teacher, lesson, next, hash(original)),
      false,
      'Retry after lost response is idempotent',
    );
    assert.equal(
      (await one<{ n: number }>(
        "SELECT COUNT(*) n FROM audit_log WHERE target_id=? AND action='lesson.video_replaced'",
        lesson,
      ))!.n,
      events,
    );
    const competing = await Promise.allSettled([
      replaceLessonVideo(teacher, lesson, mp4Fixture(40000), hash(next)),
      replaceLessonVideo(teacher, lesson, mp4Fixture(50000), hash(next)),
    ]);
    assert.equal(competing.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (competing.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.code,
      'videostale',
    );
    const current = (await one<{ sha256: string }>(
      'SELECT sha256 FROM lesson_videos WHERE lesson_id=?',
      lesson,
    ))!.sha256;
    await replaceLessonVideo(teacher, lesson, original, current);
    assert.deepEqual(
      await one('SELECT * FROM lesson_progress WHERE user_id=? AND lesson_id=?', student, lesson),
      progress,
    );
    assert.deepEqual(
      await all('SELECT * FROM quiz_attempts WHERE lesson_id=? ORDER BY id', lesson),
      attempts,
    );
    await flushFileDeletions();
    assert.equal((await readdir(process.env.VIDEO_DIR!)).length, 1);
    assert((await readableVideo(lesson, teacher))!.buffer!.equals(original));
    assert.equal(auditPresentation('lesson.video_replaced').kind, 'edit');
    assert.equal(auditPresentation('lesson.video_replaced').permanent, false);
  } finally {
    process.env.VIDEO_COURSE_QUOTA_BYTES = '0';
  }
});
test('configured course video quota resists concurrent uploads and counts removed sections', async () => {
  const original = process.env.VIDEO_COURSE_QUOTA_BYTES;
  const bytes = mp4Fixture();
  await run("UPDATE courses SET status='draft' WHERE id=?", course);
  const create = async (sectionId: string) =>
    writeLesson(teacher, course, {
      id: '',
      sectionId,
      title: 'Қосымша бейнесабақ',
      body: 'Квота тексерісі.',
      videoUrl: '',
      minutes: 1,
      preview: false,
      summary: '',
      objectives: '',
    });
  try {
    process.env.VIDEO_COURSE_QUOTA_BYTES = String(bytes.length * 2);
    const first = await create(section),
      second = await create(section);
    const results = await Promise.allSettled([
      saveLessonVideo(teacher, first, bytes, 53000, 'quota-first'),
      saveLessonVideo(teacher, second, bytes, 53000, 'quota-second'),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal(failure.reason.code, 'videoquota');
    assert.equal(
      (await readdir(process.env.VIDEO_DIR!)).length,
      2,
      'Failed concurrent staging file must be removed',
    );
    await assert.doesNotReject(saveLessonVideo(teacher, lesson, bytes, 53000, 'same-file-retry'));
    const nextSection = randomUUID();
    await run('INSERT INTO sections VALUES(?,?,?,?)', nextSection, course, 'Белсенді бөлім', 1);
    const next = await create(nextSection);
    await run('INSERT INTO section_trash VALUES(?,?)', section, Date.now());
    await assert.rejects(saveLessonVideo(teacher, next, bytes, 53000, 'hidden-bypass'), {
      code: 'videoquota',
    });
    process.env.VIDEO_COURSE_QUOTA_BYTES = 'invalid-setting';
    await assert.rejects(
      saveLessonVideo(teacher, next, bytes, 53000, 'bad-config'),
      /nonnegative integer/,
    );
    assert.equal((await readdir(process.env.VIDEO_DIR!)).length, 2);
  } finally {
    if (original === undefined) delete process.env.VIDEO_COURSE_QUOTA_BYTES;
    else process.env.VIDEO_COURSE_QUOTA_BYTES = original;
  }
});
test('failed staging cleanup keeps a retry job and never deletes an attached video', async () => {
  const attached = (await one<{ storage_key: string }>(
    'SELECT storage_key FROM lesson_videos WHERE lesson_id=?',
    lesson,
  ))!.storage_key;
  const original = await readFile(videoPath(attached));
  await discardUnattachedVideo(attached);
  assert((await readFile(videoPath(attached))).equals(original));
  assert.equal(
    await one('SELECT storage_key FROM video_deletions WHERE storage_key=?', attached),
    undefined,
  );
  await run('INSERT INTO video_deletions VALUES(?,?)', attached, Date.now());
  await flushFileDeletions();
  assert(
    (await readFile(videoPath(attached))).equals(original),
    'A stale cleanup job cannot delete an attached video',
  );
  const staged = `${randomUUID()}.mp4`,
    path = videoPath(staged);
  // An empty directory at the isolated path makes unlink fail on Windows and Linux.
  await mkdir(path);
  await discardUnattachedVideo(staged);
  assert(await one('SELECT storage_key FROM video_deletions WHERE storage_key=?', staged));
  await rmdir(path);
  await writeFile(path, Buffer.from('isolated staging fixture'));
  await flushFileDeletions();
  assert.equal(
    await one('SELECT storage_key FROM video_deletions WHERE storage_key=?', staged),
    undefined,
  );
  await assert.rejects(readFile(path), { code: 'ENOENT' });
  assert((await readFile(videoPath(attached))).equals(original));
});
test('permanent course deletion removes video metadata and drains durable cleanup queue', async () => {
  const admin =
    (await one<{ id: string }>("SELECT id FROM users WHERE role='admin' AND status='active'"))
      ?.id || (await user('admin'));
  await changeCourseVisibility(admin, course, 'trash');
  assert.equal(await purgeCourse(admin, course, 'Практика және тесттер', true), 0);
  assert.equal(
    await one('SELECT lesson_id FROM lesson_videos WHERE lesson_id=?', lesson),
    undefined,
  );
  assert.equal(await one('SELECT id FROM quiz_attempts WHERE lesson_id=?', lesson), undefined);
});
