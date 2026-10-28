import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { migrate, one, all, run } from '../src/lib/db';
import { hashPassword, verifyPassword, issueSession } from '../src/lib/security';
import { ManagementError } from '../src/lib/management';
import { createCourseWithBanner } from '../src/lib/course-creation';
import {
  changeCourseVisibility,
  courseInTrash,
  purgeCourse,
  flushFileDeletions,
} from '../src/lib/course-lifecycle';
import { writeLesson, removeCourseSection, restoreCourseSection } from '../src/lib/course-editor';
import { getCourse, courseLessons } from '../src/lib/courses';
import { addMaterial, canReadLesson, materialPath } from '../src/lib/materials';
import { uploadCourseCover, coverPath, readCourseCover } from '../src/lib/course-covers';
import {
  saveExtendedProfile,
  ownProfile,
  changeOwnEmail,
  changeOwnPassword,
  uploadAvatar,
  readOwnAvatar,
} from '../src/lib/profile';
import { pdfFixture, docxFixture } from './document-fixtures';
process.env.DATABASE_PATH = ':memory:';
process.env.UPLOAD_DIR = resolve('.test-data', `controls-${randomUUID()}`);
await migrate();
const password = 'Testing-current-password-123';
async function user(role = 'teacher') {
  const id = randomUUID();
  await run(
    'INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',
    id,
    `${id}@test.invalid`,
    'Оқытушы',
    hashPassword(password),
    role,
    Date.now(),
  );
  return id;
}
const teacher = await user(),
  foreign = await user(),
  admin = await user('admin'),
  student = await user('student');
const code = (expected: string) => (error: unknown) =>
  error instanceof ManagementError && error.code === expected;
const input = {
  title: 'Университеттің жаңа курсы',
  description: 'Бұл университет студенттеріне арналған толық оқу курсы.',
  category: 'Технология',
  level: 'Орташа',
};
async function course(bytes?: Buffer) {
  const id = await createCourseWithBanner(teacher, input, 'brain', bytes);
  const section = (await one<{
    id: string;
  }>('SELECT id FROM sections WHERE course_id=?', id))!.id;
  const lesson = await writeLesson(teacher, id, {
    id: '',
    sectionId: section,
    title: 'Нақты бірінші дәріс',
    body: 'Мәтін',
    videoUrl: '',
    minutes: 45,
    preview: true,
    summary: '',
    objectives: '',
  });
  return { id, section, lesson };
}
const image = () =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: '#96c7aa' } })
    .png()
    .toBuffer();
test('Teachers control only their own courses; hiding and trash preserve learning data and restoring never republishes', async () => {
  const c = await course();
  await run('INSERT INTO enrollments VALUES (?,?,?)', student, c.id, Date.now());
  await run(
    'INSERT INTO lesson_progress(user_id,lesson_id,completed_at) VALUES (?,?,?)',
    student,
    c.lesson,
    Date.now(),
  );
  await run("UPDATE courses SET status='published' WHERE id=?", c.id);
  await assert.rejects(
    async () => await changeCourseVisibility(student, c.id, 'trash'),
    code('forbidden'),
  );
  await assert.rejects(
    async () => await changeCourseVisibility(foreign, c.id, 'hide'),
    code('forbidden'),
  );
  await changeCourseVisibility(teacher, c.id, 'hide');
  assert.equal((await getCourse(c.id))?.status, 'archived');
  assert(!(await canReadLesson(c.lesson, student)));
  assert(!(await courseInTrash(c.id)));
  await changeCourseVisibility(admin, c.id, 'trash');
  assert(await courseInTrash(c.id));
  assert(await one('SELECT lesson_id FROM lesson_progress WHERE lesson_id=?', c.lesson));
  assert(await one('SELECT user_id FROM enrollments WHERE course_id=?', c.id));
  await changeCourseVisibility(admin, c.id, 'restore');
  assert(!(await courseInTrash(c.id)));
  assert.equal((await getCourse(c.id))?.status, 'draft');
});
test('Permanent deletion requires admin, trash, exact title and confirmation; removes course data and associated files only', async () => {
  const c = await course(await image());
  const other = await course();
  const pdf = await addMaterial(teacher, c.lesson, 'lecture.pdf', await pdfFixture());
  await addMaterial(teacher, c.lesson, 'lecture.docx', await docxFixture());
  await uploadCourseCover(teacher, c.id, await image());
  await uploadCourseCover(teacher, c.id, await image(), c.lesson);
  const materialKeys = await all<{
    storage_key: string;
    kind: string;
  }>('SELECT storage_key,kind FROM lesson_materials WHERE lesson_id=?', c.lesson);
  const covers = await all<{
    storage_key: string;
  }>('SELECT storage_key FROM course_cover_files WHERE course_id=?', c.id);
  assert.equal(covers.length, 3);
  await run('INSERT INTO enrollments VALUES (?,?,?)', student, c.id, Date.now());
  await run(
    'INSERT INTO lesson_progress(user_id,lesson_id,completed_at) VALUES (?,?,?)',
    student,
    c.lesson,
    Date.now(),
  );
  await assert.rejects(purgeCourse(admin, c.id, input.title, true), code('purgeconfirmation'));
  await changeCourseVisibility(teacher, c.id, 'trash');
  await assert.rejects(purgeCourse(teacher, c.id, input.title, true), code('forbidden'));
  await assert.rejects(purgeCourse(admin, c.id, 'incorrect', true), code('purgeconfirmation'));
  await assert.rejects(purgeCourse(admin, c.id, input.title, false), code('purgeconfirmation'));
  assert.equal(await purgeCourse(admin, c.id, input.title, true), 0);
  assert.equal(await getCourse(c.id), undefined);
  assert(await getCourse(other.id));
  assert(!(await one('SELECT id FROM lesson_materials WHERE id=?', pdf)));
  assert(!(await one('SELECT lesson_id FROM lesson_progress WHERE lesson_id=?', c.lesson)));
  assert(!(await one('SELECT user_id FROM enrollments WHERE course_id=?', c.id)));
  for (const f of materialKeys) {
    await assert.rejects(readFile(materialPath(f.storage_key)));
    if (f.kind === 'docx') await assert.rejects(readFile(materialPath(f.storage_key, true)));
  }
  for (const f of covers) await assert.rejects(readFile(coverPath(f.storage_key)));
  assert(await one("SELECT id FROM audit_log WHERE action='course.purged' AND target_id=?", c.id));
});
test('Custom banner is validated before course creation and is available immediately in a private draft', async () => {
  const count = (await one<{
    n: number;
  }>('SELECT COUNT(*) n FROM courses'))!.n;
  await assert.rejects(createCourseWithBanner(student, input), code('forbidden'));
  await assert.rejects(
    createCourseWithBanner(teacher, input, 'books', Buffer.from('<svg/>')),
    code('coverinvalid'),
  );
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM courses'))!.n,
    count,
  );
  const c = await course(await image());
  assert.equal((await getCourse(c.id))?.has_cover, 1);
  assert.equal(await readCourseCover(c.id, student), undefined);
  const file = await readCourseCover(c.id, teacher);
  assert(file);
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 900);
});
test('An entire section can be removed and restored with its lectures and history intact, including a published course', async () => {
  const c = await course();
  await addMaterial(teacher, c.lesson, 'lecture.pdf', await pdfFixture());
  await run(
    'INSERT INTO lesson_progress(user_id,lesson_id,completed_at) VALUES (?,?,?)',
    student,
    c.lesson,
    Date.now(),
  );
  await run("UPDATE courses SET status='published' WHERE id=?", c.id);
  await removeCourseSection(admin, c.id, c.section, '', true);
  assert.equal((await getCourse(c.id))?.status, 'draft');
  assert.equal((await courseLessons(c.id)).length, 0);
  assert.equal((await getCourse(c.id))?.lesson_count, 0);
  await run("UPDATE courses SET status='published' WHERE id=?", c.id);
  assert(!(await canReadLesson(c.lesson, student)));
  assert(await one('SELECT lesson_id FROM lesson_progress WHERE lesson_id=?', c.lesson));
  await run("UPDATE courses SET status='draft' WHERE id=?", c.id);
  await restoreCourseSection(teacher, c.id, c.section);
  assert.equal((await courseLessons(c.id))[0].id, c.lesson);
});
test('Profile editing persists private fields without accepting a forged role or email and validates web links', async () => {
  const id = await user('student');
  const email = (await one<{
    email: string;
  }>('SELECT email FROM users WHERE id=?', id))!.email;
  const data = {
    name: 'Жаңа аты',
    department: 'Кафедра',
    academic_title: 'Студент',
    university: 'Университет',
    bio: 'Өзі туралы',
    phone: '+7 700 123 45 67',
    city: 'Алматы',
    website: 'https://example.kz',
    role: 'admin',
    email: 'forged@test.invalid',
  };
  await saveExtendedProfile(id, data);
  assert.equal((await ownProfile(id)).phone, data.phone);
  assert.equal(
    (await one<{
      role: string;
    }>('SELECT role FROM users WHERE id=?', id))!.role,
    'student',
  );
  assert.equal(
    (await one<{
      email: string;
    }>('SELECT email FROM users WHERE id=?', id))!.email,
    email,
  );
  assert(!Object.hasOwn(await ownProfile(id), 'avatar_key'));
  await assert.rejects(
    async () => await saveExtendedProfile(id, { ...data, website: 'javascript:alert(1)' }),
    code('profilewebsite'),
  );
  assert.equal((await ownProfile(id)).website, data.website);
});
test('Password and email changes require the current password and revoke every existing session', async () => {
  const id = await user('student');
  await issueSession(id);
  await issueSession(id);
  await assert.rejects(
    async () =>
      await changeOwnPassword(id, 'wrong', 'New-password-testing-123', 'New-password-testing-123'),
    code('currentpassword'),
  );
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM sessions WHERE user_id=?', id))!.n,
    2,
  );
  await assert.rejects(
    async () => await changeOwnPassword(id, password, 'New-password-testing-123', 'different'),
    code('newpassword'),
  );
  await changeOwnPassword(id, password, 'New-password-testing-123', 'New-password-testing-123');
  const hash = (await one<{
    password_hash: string;
  }>('SELECT password_hash FROM users WHERE id=?', id))!.password_hash;
  assert(verifyPassword('New-password-testing-123', hash));
  assert(!verifyPassword(password, hash));
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM sessions WHERE user_id=?', id))!.n,
    0,
  );
  await issueSession(id);
  await assert.rejects(
    async () => await changeOwnEmail(id, password, 'new@test.invalid'),
    code('currentpassword'),
  );
  await changeOwnEmail(id, 'New-password-testing-123', 'new@test.invalid');
  assert.equal(
    (await one<{
      email: string;
    }>('SELECT email FROM users WHERE id=?', id))!.email,
    'new@test.invalid',
  );
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM sessions WHERE user_id=?', id))!.n,
    0,
  );
});
test('Avatar uploads are real raster images, converted to a square and inaccessible to blocked accounts', async () => {
  const id = await user('student');
  await uploadAvatar(id, await image());
  assert.equal((await ownProfile(id)).has_avatar, 1);
  const file = await readOwnAvatar(id);
  assert(file);
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  await assert.rejects(uploadAvatar(id, Buffer.from('<svg/>')), code('coverinvalid'));
  await run("UPDATE users SET status='blocked' WHERE id=?", id);
  await assert.rejects(readOwnAvatar(id), code('forbidden'));
});
test('Invalid cleanup jobs stay queued and cannot address arbitrary filesystem paths', async () => {
  const id = randomUUID();
  await run(
    'INSERT INTO file_deletions VALUES (?,?,?,?)',
    id,
    '../../outside',
    'cover',
    Date.now(),
  );
  assert.equal(await flushFileDeletions(), 1);
  assert(await one('SELECT id FROM file_deletions WHERE id=?', id));
  await run('DELETE FROM file_deletions WHERE id=?', id);
});
