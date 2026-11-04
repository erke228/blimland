import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrate, one, run } from '../src/lib/db';
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
import { saveLessonVideo, readableVideo } from '../src/lib/lesson-videos';
import { changeCourseVisibility, purgeCourse } from '../src/lib/course-lifecycle';
import { loadEnvironment } from '../scripts/postgres-environment';
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
  await assert.rejects(() => publicQuiz(lesson, outsider), denied);
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
  const bytes = Buffer.from('0000ftypmp42test-only-video');
  await assert.rejects(() => saveLessonVideo(teacher, lesson, bytes, 90001, 'source'));
  await saveLessonVideo(teacher, lesson, bytes, 53000, 'source');
  assert.equal(await readableVideo(lesson, outsider), undefined);
  assert((await readableVideo(lesson, teacher))!.buffer!.equals(bytes));
  await run("UPDATE courses SET status='published' WHERE id=?", course);
  assert((await readableVideo(lesson, student))!.buffer!.equals(bytes));
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
