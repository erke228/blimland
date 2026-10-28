import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { all, migrate, one, run } from '../src/lib/db';
import {
  saveCourseInformation,
  saveCoverPreset,
  reopenCourse,
  writeLesson,
  saveSectionInformation,
  assertCourseComplete,
  saveLectureCoverPreset,
  removeCourseSection,
  restoreCourseSection,
} from '../src/lib/course-editor';
import {
  readCourseCover,
  uploadCourseCover,
  MAX_COVER_BYTES,
  lectureCoverPresentation,
} from '../src/lib/course-covers';
import { getCourse, listCourses, courseLessons } from '../src/lib/courses';
import { ManagementError } from '../src/lib/management';
import { archiveDemoContent } from '../src/lib/demo-content';
import { addMaterial, listMaterials, setMaterialRemoved } from '../src/lib/materials';
import { pdfFixture } from './document-fixtures';
process.env.DATABASE_PATH = ':memory:';
process.env.UPLOAD_DIR = resolve('.test-data', `covers-${randomUUID()}`);
await migrate();
async function user(role = 'teacher', email = `${randomUUID()}@test.invalid`) {
  const id = randomUUID();
  await run(
    'INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',
    id,
    email,
    'Оқытушы',
    'unused',
    role,
    Date.now(),
  );
  return id;
}
const teacher = await user(),
  foreign = await user(),
  student = await user('student'),
  admin = await user('admin');
async function course(owner = teacher, id: string = randomUUID()) {
  await run(
    'INSERT INTO courses (id,owner_id,title,description,category,level,status,accent,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id,
    owner,
    'Нақты дәрістер курсы',
    'Университеттегі нақты дәрістердің толық сипаттамасы.',
    'Технология',
    'Орташа',
    'draft',
    'teal',
    Date.now(),
    Date.now(),
  );
  await run('INSERT INTO sections VALUES(?,?,?,?)', id, id, 'Бірінші бөлім', 0);
  return id;
}
async function lesson(id: string, extra: Partial<Parameters<typeof writeLesson>[2]> = {}) {
  return await writeLesson(teacher, id, {
    id: '',
    sectionId: id,
    title: 'Дәрістің атауы',
    body: 'Нақты оқу материалы',
    videoUrl: '',
    minutes: 45,
    preview: false,
    summary: '',
    objectives: '',
    ...extra,
  });
}
const code = (expected: string) => (e: unknown) =>
  e instanceof ManagementError && e.code === expected;
test('Course metadata validates server-side and is writable only by an active owner or administrator in draft', async () => {
  const id = await course();
  const input = {
    title: 'Жаңартылған курс атауы',
    description: 'Жаңартылған дәрістер топтамасының толық сипаттамасы.',
    category: 'Тіл білімі',
    level: 'Жоғары',
  };
  await assert.rejects(
    async () => await saveCourseInformation(student, id, input),
    code('forbidden'),
  );
  await assert.rejects(
    async () => await saveCourseInformation(foreign, id, input),
    code('forbidden'),
  );
  await assert.rejects(
    async () => await saveCourseInformation(teacher, id, { ...input, title: '' }),
    code('courseform'),
  );
  await saveCourseInformation(admin, id, input);
  assert.equal((await getCourse(id))?.category, 'Тіл білімі');
  await run("UPDATE courses SET status='published' WHERE id=?", id);
  await assert.rejects(
    async () => await saveCourseInformation(teacher, id, input),
    code('readonly'),
  );
  await assert.rejects(async () => await reopenCourse(student, id), code('forbidden'));
  await assert.rejects(async () => await reopenCourse(foreign, id), code('forbidden'));
  await reopenCourse(teacher, id);
  assert.equal((await getCourse(id))?.status, 'draft');
});
test('Lessons can move and reorder without losing documents or recorded progress; foreign sections and IDs are rejected', async () => {
  const id = await course(),
    other = await course();
  const first = await lesson(id),
    second = await lesson(id, { title: 'Екінші дәріс' }),
    third = await lesson(id, { title: 'Үшінші дәріс' });
  const material = await addMaterial(teacher, first, 'lecture.pdf', await pdfFixture());
  await run('INSERT INTO enrollments VALUES(?,?,?)', student, id, Date.now());
  await run(
    'INSERT INTO lesson_progress(user_id,lesson_id,completed_at) VALUES(?,?,?)',
    student,
    first,
    Date.now(),
  );
  const section = randomUUID();
  await run('INSERT INTO sections VALUES(?,?,?,?)', section, id, 'Екінші бөлім', 1);
  await lesson(id, {
    id: third,
    position: 1,
    summary: 'Қысқаша сипаттама',
    objectives: 'Бірінші мақсат\nЕкінші мақсат',
  });
  assert.deepEqual(
    (await courseLessons(id)).map((l) => l.id),
    [third, first, second],
  );
  await lesson(id, { id: first, sectionId: section });
  assert.equal((await listMaterials(first, teacher))[0].id, material);
  assert.equal(
    (
      await one<{
        n: number;
      }>('SELECT COUNT(*) n FROM lesson_progress WHERE lesson_id=?', first)
    )?.n,
    1,
  );
  assert.deepEqual(
    (await courseLessons(id)).map((l) => [l.section_id, l.position]),
    [
      [id, 0],
      [id, 1],
      [section, 0],
    ],
  );
  await assert.rejects(
    async () => await lesson(id, { id: first, sectionId: other }),
    code('forbidden'),
  );
  await assert.rejects(async () => await lesson(other, { id: first }), code('forbidden'));
  await saveSectionInformation(teacher, id, section, 'Жаңа бөлім атауы', 1);
  assert.equal((await courseLessons(id))[0].id, first);
});
test('Empty drafts support document-first creation but cannot be submitted; invalid input and published edits are rejected', async () => {
  const id = await course();
  await assert.rejects(async () => await assertCourseComplete(id), code('emptycourse'));
  const l = await lesson(id, { body: '' });
  await assert.rejects(async () => await assertCourseComplete(id), code('emptylesson'));
  const material = await addMaterial(teacher, l, 'lecture.pdf', await pdfFixture());
  await assert.doesNotReject(async () => await assertCourseComplete(id));
  await setMaterialRemoved(teacher, material, true);
  await assert.rejects(async () => await assertCourseComplete(id), code('emptylesson'));
  await lesson(id, { id: l, body: 'Толық мазмұн' });
  await assert.doesNotReject(async () => await assertCourseComplete(id));
  await assert.rejects(
    async () => await lesson(id, { videoUrl: 'javascript:alert(1)' }),
    code('lessonform'),
  );
  await assert.rejects(async () => await lesson(id, { position: -1 }), code('lessonform'));
  await assert.rejects(
    async () => await lesson(id, { summary: 'x'.repeat(501) }),
    code('lessonform'),
  );
  await run("UPDATE courses SET status='published' WHERE id=?", id);
  await assert.rejects(async () => await lesson(id), code('readonly'));
});
test('Covers are decoded and re-encoded, private for drafts, public on publication, and replaceable with a validated preset', async () => {
  const id = await course();
  const bytes = await sharp({
    create: { width: 500, height: 300, channels: 3, background: '#aad4bc' },
  })
    .png()
    .toBuffer();
  await assert.rejects(uploadCourseCover(student, id, bytes), code('forbidden'));
  await assert.rejects(uploadCourseCover(foreign, id, bytes), code('forbidden'));
  await uploadCourseCover(teacher, id, bytes);
  assert.equal(await readCourseCover(id), undefined);
  assert.equal(await readCourseCover(id, foreign), undefined);
  const output = await readCourseCover(id, admin);
  assert(output);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 900);
  assert(!Object.hasOwn((await getCourse(id))!, 'cover_key'));
  await run("UPDATE courses SET status='published' WHERE id=?", id);
  assert(await readCourseCover(id));
  await uploadCourseCover(teacher, id, bytes);
  await saveCoverPreset(teacher, id, 'science');
  assert.equal((await getCourse(id))?.has_cover, 0);
  assert.equal((await getCourse(id))?.cover_preset, 'science');
  assert.equal(await readCourseCover(id), undefined);
  await assert.rejects(
    async () => await saveCoverPreset(teacher, id, '<svg>'),
    code('coverinvalid'),
  );
  await run("UPDATE courses SET status='archived' WHERE id=?", id);
  await assert.rejects(uploadCourseCover(teacher, id, bytes), code('readonly'));
});
test('Covers reject SVG, corrupt rasters, oversized files, excessive pixels and inactive owners', async () => {
  const id = await course();
  await assert.rejects(
    uploadCourseCover(teacher, id, Buffer.from('<svg></svg>')),
    code('coverinvalid'),
  );
  await assert.rejects(
    uploadCourseCover(teacher, id, Buffer.from([255, 216, 255, 0])),
    code('coverinvalid'),
  );
  await assert.rejects(
    uploadCourseCover(teacher, id, Buffer.alloc(MAX_COVER_BYTES + 1)),
    code('coversize'),
  );
  const huge = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  await assert.rejects(uploadCourseCover(teacher, id, huge), code('coverinvalid'));
  const blocked = await user();
  const blockedCourse = await course(blocked);
  await run("UPDATE users SET status='blocked' WHERE id=?", blocked);
  await assert.rejects(
    uploadCourseCover(blocked, blockedCourse, Buffer.from('x')),
    code('forbidden'),
  );
});
test('Catalog searches real lecture titles, exposes first lecture links, and never lists drafts or archived content', async () => {
  const id = await course();
  const l = await lesson(id, { title: 'Byte Pair Encoding Ә Ғ Қ Ң Ө Ұ Ү Һ І', preview: true });
  assert(!(await listCourses('Byte Pair')).some((c) => c.id === id));
  await run("UPDATE courses SET status='published' WHERE id=?", id);
  const result = (await listCourses('byte pair encoding')).find((c) => c.id === id)!;
  assert.equal(result.first_lesson_id, l);
  assert.equal(result.first_lesson_preview, 1);
  assert((await listCourses('ә ғ қ ң ө ұ ү һ і')).some((c) => c.id === id));
  await run("UPDATE courses SET status='archived' WHERE id=?", id);
  assert(!(await listCourses()).some((c) => c.id === id));
});
test('Retiring known seed courses is idempotent and preserves users, lessons, enrollment and progress', async () => {
  const owner = await user('teacher', 'demo-author@example.invalid');
  const id = await course(owner, 'algebra-basics');
  await run(
    'INSERT INTO lessons VALUES(?,?,?,?,?,?,?,?)',
    id,
    id,
    'Үлгі сабақ',
    'Үлгі',
    '',
    10,
    0,
    1,
  );
  await run('INSERT INTO enrollments VALUES(?,?,?)', student, id, Date.now());
  await run(
    'INSERT INTO lesson_progress(user_id,lesson_id,completed_at) VALUES(?,?,?)',
    student,
    id,
    Date.now(),
  );
  await run("UPDATE courses SET status='published' WHERE id=?", id);
  const real = await course(teacher, 'digital-skills');
  assert.equal(await archiveDemoContent(), 1);
  assert.equal(await archiveDemoContent(), 0);
  assert.equal((await getCourse(id))?.status, 'archived');
  assert.equal((await getCourse(real))?.status, 'draft');
  for (const table of ['users', 'lessons', 'enrollments', 'lesson_progress'])
    assert((await all(`SELECT * FROM ${table}`)).length > 0);
  assert(
    await one('SELECT lesson_id FROM lesson_progress WHERE user_id=? AND lesson_id=?', student, id),
  );
  assert(await one('SELECT id FROM users WHERE id=?', owner));
});
test('Each lecture can override or inherit its course cover; ownership and cross-course IDs are checked', async () => {
  const id = await course(),
    other = await course(),
    first = await lesson(id),
    second = await lesson(id);
  assert.equal(await lectureCoverPresentation(first), undefined);
  await saveCoverPreset(teacher, id, 'brain');
  await saveLectureCoverPreset(teacher, id, first, 'science');
  assert.equal((await lectureCoverPresentation(first))?.cover_preset, 'science');
  assert.equal(await lectureCoverPresentation(second), undefined);
  assert.equal((await getCourse(id))?.cover_preset, 'brain');
  await assert.rejects(
    async () => await saveLectureCoverPreset(student, id, first, 'books'),
    code('forbidden'),
  );
  await assert.rejects(
    async () => await saveLectureCoverPreset(foreign, id, first, 'books'),
    code('forbidden'),
  );
  await assert.rejects(
    async () => await saveLectureCoverPreset(teacher, other, first, 'books'),
    code('forbidden'),
  );
  const bytes = await sharp({
    create: { width: 400, height: 300, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  await assert.rejects(uploadCourseCover(teacher, other, bytes, first), code('forbidden'));
  await uploadCourseCover(teacher, id, bytes, first);
  assert.equal(await readCourseCover(id, undefined, first), undefined);
  assert(await readCourseCover(id, admin, first));
  assert.equal(await readCourseCover(other, admin, first), undefined);
  await run("UPDATE courses SET status='published' WHERE id=?", id);
  assert(await readCourseCover(id, undefined, first));
  await saveLectureCoverPreset(teacher, id, first, 'inherit');
  assert.equal(await lectureCoverPresentation(first), undefined);
  assert.equal((await getCourse(id))?.cover_preset, 'brain');
});
test('Removing a populated section moves lectures and preserves files and progress; restoration returns an empty section', async () => {
  const id = await course(),
    first = await lesson(id),
    second = await lesson(id);
  const target = randomUUID();
  await run('INSERT INTO sections VALUES(?,?,?,?)', target, id, 'Қабылдайтын бөлім', 1);
  const file = await addMaterial(teacher, first, 'lecture.pdf', await pdfFixture());
  await run(
    'INSERT INTO lesson_progress(user_id,lesson_id,completed_at) VALUES(?,?,?)',
    student,
    first,
    Date.now(),
  );
  await removeCourseSection(teacher, id, id, target);
  assert(await one('SELECT section_id FROM section_trash WHERE section_id=?', id));
  assert.deepEqual(
    (await courseLessons(id)).map((l) => [l.id, l.section_id, l.position]),
    [
      [first, target, 0],
      [second, target, 1],
    ],
  );
  assert.equal((await listMaterials(first, teacher))[0].id, file);
  assert(await one('SELECT lesson_id FROM lesson_progress WHERE lesson_id=?', first));
  await assert.rejects(async () => await lesson(id), code('forbidden'));
  await restoreCourseSection(teacher, id, id);
  assert(!(await one('SELECT section_id FROM section_trash WHERE section_id=?', id)));
  assert.equal((await courseLessons(id)).filter((l) => l.section_id === id).length, 0);
  assert.equal((await courseLessons(id)).length, 2);
});
test('Section removal and restoration reject other users, published courses and invalid destinations without partial changes', async () => {
  const id = await course(),
    other = await course();
  await lesson(id);
  await assert.rejects(async () => await removeCourseSection(student, id, id), code('forbidden'));
  await assert.rejects(async () => await removeCourseSection(foreign, id, id), code('forbidden'));
  await assert.rejects(
    async () => await removeCourseSection(teacher, id, id, other),
    code('sectiondestination'),
  );
  await assert.rejects(
    async () => await removeCourseSection(teacher, id, id, id),
    code('sectiondestination'),
  );
  assert(!(await one('SELECT section_id FROM section_trash WHERE section_id=?', id)));
  await run("UPDATE courses SET status='published' WHERE id=?", id);
  await assert.rejects(async () => await removeCourseSection(admin, id, id), code('readonly'));
  const empty = await course();
  await removeCourseSection(admin, empty, empty);
  await assert.rejects(
    async () => await restoreCourseSection(foreign, empty, empty),
    code('forbidden'),
  );
  await assert.rejects(
    async () => await restoreCourseSection(student, empty, empty),
    code('forbidden'),
  );
  await restoreCourseSection(admin, empty, empty);
  assert(!(await one('SELECT section_id FROM section_trash WHERE section_id=?', empty)));
});
