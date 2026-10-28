import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrate, run } from '../src/lib/db';
import { lectureCatalog } from '../src/lib/lecture-catalog';
import { teachingProfileCourses } from '../src/lib/teaching-profile';
import { auditPresentation } from '../src/lib/audit-presentation';
process.env.DATABASE_PATH = ':memory:';
await migrate();
async function user(role: string) {
  const id = randomUUID();
  await run(
    'INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',
    id,
    id + '@test.invalid',
    role === 'admin' ? 'Тлеужанова Қ. Е.' : 'Оқытушы',
    'unused',
    role,
    1,
  );
  return id;
}
const teacher = await user('teacher'),
  other = await user('teacher'),
  admin = await user('admin'),
  student = await user('student');
async function course(owner = teacher, status = 'published', category = randomUUID()) {
  const id = randomUUID();
  await run(
    'INSERT INTO courses(id,owner_id,title,description,category,level,status,accent,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    id,
    owner,
    'Пән ' + id,
    'Курстың толық сипаттамасы',
    category,
    'Орташа',
    status,
    'teal',
    1,
    1,
  );
  await run('INSERT INTO sections VALUES(?,?,?,?)', id, id, 'Негізгі бөлім', 0);
  return { id, category };
}
async function lesson(
  c: {
    id: string;
  },
  title = 'Дәріс',
  preview = 0,
  minutes = 30,
) {
  const id = randomUUID();
  await run(
    'INSERT INTO lessons VALUES(?,?,?,?,?,?,?,?)',
    id,
    c.id,
    title,
    'SECRET-LESSON-BODY',
    'https://private.invalid/video.mp4',
    minutes,
    0,
    preview,
  );
  return id;
}
test('Public lecture catalog exposes published active metadata and never lesson bodies, URLs or private document identifiers', async () => {
  const c = await course(),
    live = await lesson(c),
    hidden = await course(teacher, 'draft', c.category),
    archived = await course(teacher, 'archived', c.category);
  await lesson(hidden);
  await lesson(archived);
  await run(
    'INSERT INTO lesson_materials(id,lesson_id,original_name,storage_key,kind,size_bytes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
    'private-material',
    live,
    'private-name.pdf',
    'private-storage.pdf',
    'pdf',
    50,
    teacher,
    1,
  );
  const data = await lectureCatalog({ category: c.category });
  assert.equal(data.total, 1);
  assert.equal(data.results[0].has_pdf, 1);
  assert(
    !/SECRET-LESSON-BODY|private.invalid|private-name|private-material|private-storage/.test(
      JSON.stringify(data.results),
    ),
  );
  await run('INSERT INTO section_trash VALUES(?,?)', c.id, 1);
  assert.equal((await lectureCatalog({ category: c.category })).total, 0);
});
test('Search finds later Kazakh lecture titles; filters combine and pagination preserves all matching items', async () => {
  const c = await course(),
    first = await lesson(c, 'Бастапқы тақырып', 0, 45),
    second = await lesson(c, 'ҚАЗАҚША ҮЛГІ', 1, 15);
  await run(
    'INSERT INTO lesson_materials(id,lesson_id,original_name,storage_key,kind,size_bytes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
    randomUUID(),
    second,
    'document.docx',
    randomUUID() + '.docx',
    'docx',
    50,
    teacher,
    1,
  );
  const data = await lectureCatalog({
    q: 'қазақша үлгі',
    category: c.category,
    teacher,
    level: 'Орташа',
    format: 'docx',
    access: 'open',
  });
  assert.equal(data.total, 1);
  assert.equal(data.results[0].id, second);
  assert.equal((await lectureCatalog({ category: c.category, teacher: other })).total, 0);
  assert.equal((await lectureCatalog({ category: c.category, q: "' OR 1=1 --" })).total, 0);
  assert.equal(
    (await lectureCatalog({ category: c.category, view: 'courses', q: 'қазақша үлгі' })).courses[0]
      .id,
    c.id,
  );
  assert.equal(
    (await lectureCatalog({ category: c.category, sort: 'duration' })).results[0].id,
    second,
  );
  for (let i = 0; i < 12; i++) await lesson(c, 'Қосымша ' + i);
  const a = await lectureCatalog({ category: c.category }),
    b = await lectureCatalog({ category: c.category, page: '2' });
  assert.equal(a.total, 14);
  assert.equal(a.results.length, 12);
  assert.equal(b.results.length, 2);
  assert.equal(new Set([...a.results, ...b.results].map((l) => l.id)).size, 14);
  assert([...a.results, ...b.results].some((l) => l.id === first));
});
test('Teaching profile includes the actual owner lectures for admin and teacher, excludes another author and rejects students', async () => {
  const c = await course(admin),
    l = await lesson(c, 'Алғашқы авторлық дәріс');
  const draft = await course(admin, 'draft');
  await lesson(draft);
  const foreign = await course(other);
  await lesson(foreign);
  const profile = await teachingProfileCourses(admin);
  assert(
    profile.some((row) => row.course.id === c.id && row.lessons.some((lesson) => lesson.id === l)),
  );
  assert(profile.some((row) => row.course.id === draft.id));
  assert(!profile.some((row) => row.course.id === foreign.id));
  assert(!(await teachingProfileCourses(teacher)).some((row) => row.course.id === c.id));
  await assert.rejects(async () => await teachingProfileCourses(student), /forbidden/);
});
test('Audit presentation distinguishes editing a lesson from removing a document, hiding and permanent deletion', () => {
  assert.equal(auditPresentation('lesson.updated').kind, 'edit');
  assert.equal(auditPresentation('lesson.material_removed').kind, 'remove');
  assert.equal(auditPresentation('course.hide').kind, 'remove');
  assert(auditPresentation('course.purged').permanent);
  assert(!auditPresentation('course.trash').permanent);
  assert.equal(auditPresentation('lesson.material_restored').kind, 'restore');
  assert.equal(auditPresentation('profile.password.changed').kind, 'access');
  assert.notEqual(
    auditPresentation('lesson.updated').label,
    auditPresentation('lesson.material_removed').label,
  );
});
