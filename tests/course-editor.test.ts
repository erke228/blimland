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
migrate();
function user(role = 'teacher', email = `${randomUUID()}@test.invalid`) {
  const id = randomUUID();
  run(
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
const teacher = user(),
  foreign = user(),
  student = user('student'),
  admin = user('admin');
function course(owner = teacher, id: string = randomUUID()) {
  run(
    'INSERT INTO courses VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    id,
    owner,
    'Нақты дәрістер курсы',
    'Университеттегі нақты дәрістердің толық сипаттамасы.',
    'Технология',
    'Орташа',
    0,
    'draft',
    'teal',
    Date.now(),
    Date.now(),
  );
  run('INSERT INTO sections VALUES(?,?,?,?)', id, id, 'Бірінші бөлім', 0);
  return id;
}
function lesson(id: string, extra: Partial<Parameters<typeof writeLesson>[2]> = {}) {
  return writeLesson(teacher, id, {
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
test('Course metadata validates server-side and is writable only by an active owner or administrator in draft', () => {
  const id = course();
  const input = {
    title: 'Жаңартылған курс атауы',
    description: 'Жаңартылған дәрістер топтамасының толық сипаттамасы.',
    category: 'Тіл білімі',
    level: 'Жоғары',
    price: 0,
  };
  assert.throws(() => saveCourseInformation(student, id, input), code('forbidden'));
  assert.throws(() => saveCourseInformation(foreign, id, input), code('forbidden'));
  assert.throws(
    () => saveCourseInformation(teacher, id, { ...input, price: -1 }),
    code('courseform'),
  );
  saveCourseInformation(admin, id, input);
  assert.equal(getCourse(id)?.category, 'Тіл білімі');
  run("UPDATE courses SET status='published' WHERE id=?", id);
  assert.throws(() => saveCourseInformation(teacher, id, input), code('readonly'));
  assert.throws(() => reopenCourse(student, id), code('forbidden'));
  assert.throws(() => reopenCourse(foreign, id), code('forbidden'));
  reopenCourse(teacher, id);
  assert.equal(getCourse(id)?.status, 'draft');
});
test('Lessons can move and reorder without losing documents or recorded progress; foreign sections and IDs are rejected', async () => {
  const id = course(),
    other = course();
  const first = lesson(id),
    second = lesson(id, { title: 'Екінші дәріс' }),
    third = lesson(id, { title: 'Үшінші дәріс' });
  const material = await addMaterial(teacher, first, 'lecture.pdf', await pdfFixture());
  run('INSERT INTO enrollments VALUES(?,?,?)', student, id, Date.now());
  run(
    'INSERT INTO lesson_progress(user_id,lesson_id,completed_at) VALUES(?,?,?)',
    student,
    first,
    Date.now(),
  );
  const section = randomUUID();
  run('INSERT INTO sections VALUES(?,?,?,?)', section, id, 'Екінші бөлім', 1);
  lesson(id, {
    id: third,
    position: 1,
    summary: 'Қысқаша сипаттама',
    objectives: 'Бірінші мақсат\nЕкінші мақсат',
  });
  assert.deepEqual(
    courseLessons(id).map((l) => l.id),
    [third, first, second],
  );
  lesson(id, { id: first, sectionId: section });
  assert.equal(listMaterials(first, teacher)[0].id, material);
  assert.equal(
    one<{ n: number }>('SELECT COUNT(*) n FROM lesson_progress WHERE lesson_id=?', first)?.n,
    1,
  );
  assert.deepEqual(
    courseLessons(id).map((l) => [l.section_id, l.position]),
    [
      [id, 0],
      [id, 1],
      [section, 0],
    ],
  );
  assert.throws(() => lesson(id, { id: first, sectionId: other }), code('forbidden'));
  assert.throws(() => lesson(other, { id: first }), code('forbidden'));
  saveSectionInformation(teacher, id, section, 'Жаңа бөлім атауы', 1);
  assert.equal(courseLessons(id)[0].id, first);
});
test('Empty drafts support document-first creation but cannot be submitted; invalid input and published edits are rejected', async () => {
  const id = course();
  assert.throws(() => assertCourseComplete(id), code('emptycourse'));
  const l = lesson(id, { body: '' });
  assert.throws(() => assertCourseComplete(id), code('emptylesson'));
  const material = await addMaterial(teacher, l, 'lecture.pdf', await pdfFixture());
  assert.doesNotThrow(() => assertCourseComplete(id));
  setMaterialRemoved(teacher, material, true);
  assert.throws(() => assertCourseComplete(id), code('emptylesson'));
  lesson(id, { id: l, body: 'Толық мазмұн' });
  assert.doesNotThrow(() => assertCourseComplete(id));
  assert.throws(() => lesson(id, { videoUrl: 'javascript:alert(1)' }), code('lessonform'));
  assert.throws(() => lesson(id, { position: -1 }), code('lessonform'));
  assert.throws(() => lesson(id, { summary: 'x'.repeat(501) }), code('lessonform'));
  run("UPDATE courses SET status='published' WHERE id=?", id);
  assert.throws(() => lesson(id), code('readonly'));
});
test('Covers are decoded and re-encoded, private for drafts, public on publication, and replaceable with a validated preset', async () => {
  const id = course();
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
  assert(!Object.hasOwn(getCourse(id)!, 'cover_key'));
  run("UPDATE courses SET status='published' WHERE id=?", id);
  assert(await readCourseCover(id));
  await uploadCourseCover(teacher, id, bytes);
  saveCoverPreset(teacher, id, 'science');
  assert.equal(getCourse(id)?.has_cover, 0);
  assert.equal(getCourse(id)?.cover_preset, 'science');
  assert.equal(await readCourseCover(id), undefined);
  assert.throws(() => saveCoverPreset(teacher, id, '<svg>'), code('coverinvalid'));
  run("UPDATE courses SET status='archived' WHERE id=?", id);
  await assert.rejects(uploadCourseCover(teacher, id, bytes), code('readonly'));
});
test('Covers reject SVG, corrupt rasters, oversized files, excessive pixels and inactive owners', async () => {
  const id = course();
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
  const blocked = user();
  const blockedCourse = course(blocked);
  run("UPDATE users SET status='blocked' WHERE id=?", blocked);
  await assert.rejects(
    uploadCourseCover(blocked, blockedCourse, Buffer.from('x')),
    code('forbidden'),
  );
});
test('Catalog searches real lecture titles, exposes first lecture links, and never lists drafts or archived content', () => {
  const id = course();
  const l = lesson(id, { title: 'Byte Pair Encoding Ә Ғ Қ Ң Ө Ұ Ү Һ І', preview: true });
  assert(!listCourses('Byte Pair').some((c) => c.id === id));
  run("UPDATE courses SET status='published' WHERE id=?", id);
  const result = listCourses('byte pair encoding').find((c) => c.id === id)!;
  assert.equal(result.first_lesson_id, l);
  assert.equal(result.first_lesson_preview, 1);
  assert(listCourses('ә ғ қ ң ө ұ ү һ і').some((c) => c.id === id));
  run("UPDATE courses SET status='archived' WHERE id=?", id);
  assert(!listCourses().some((c) => c.id === id));
});
test('Retiring known seed courses is idempotent and preserves users, lessons, enrollment and progress', () => {
  const owner = user('teacher', 'demo-author@example.invalid');
  const id = course(owner, 'algebra-basics');
  run('INSERT INTO lessons VALUES(?,?,?,?,?,?,?,?)', id, id, 'Үлгі сабақ', 'Үлгі', '', 10, 0, 1);
  run('INSERT INTO enrollments VALUES(?,?,?)', student, id, Date.now());
  run(
    'INSERT INTO lesson_progress(user_id,lesson_id,completed_at) VALUES(?,?,?)',
    student,
    id,
    Date.now(),
  );
  run("UPDATE courses SET status='published' WHERE id=?", id);
  const real = course(teacher, 'digital-skills');
  assert.equal(archiveDemoContent(), 1);
  assert.equal(archiveDemoContent(), 0);
  assert.equal(getCourse(id)?.status, 'archived');
  assert.equal(getCourse(real)?.status, 'draft');
  for (const table of ['users', 'lessons', 'enrollments', 'lesson_progress'])
    assert(all(`SELECT * FROM ${table}`).length > 0);
  assert(one('SELECT lesson_id FROM lesson_progress WHERE user_id=? AND lesson_id=?', student, id));
  assert(one('SELECT id FROM users WHERE id=?', owner));
});
test('Each lecture can override or inherit its course cover; ownership and cross-course IDs are checked', async () => {
  const id = course(),
    other = course(),
    first = lesson(id),
    second = lesson(id);
  assert.equal(lectureCoverPresentation(first), undefined);
  saveCoverPreset(teacher, id, 'brain');
  saveLectureCoverPreset(teacher, id, first, 'science');
  assert.equal(lectureCoverPresentation(first)?.cover_preset, 'science');
  assert.equal(lectureCoverPresentation(second), undefined);
  assert.equal(getCourse(id)?.cover_preset, 'brain');
  assert.throws(() => saveLectureCoverPreset(student, id, first, 'books'), code('forbidden'));
  assert.throws(() => saveLectureCoverPreset(foreign, id, first, 'books'), code('forbidden'));
  assert.throws(() => saveLectureCoverPreset(teacher, other, first, 'books'), code('forbidden'));
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
  run("UPDATE courses SET status='published' WHERE id=?", id);
  assert(await readCourseCover(id, undefined, first));
  saveLectureCoverPreset(teacher, id, first, 'inherit');
  assert.equal(lectureCoverPresentation(first), undefined);
  assert.equal(getCourse(id)?.cover_preset, 'brain');
});
