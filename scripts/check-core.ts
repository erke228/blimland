import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { migrate, one, run } from '../src/lib/db';
import { hashPassword } from '../src/lib/security';
import { pdfFixture, docxFixture } from '../tests/document-fixtures';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { loadEnvironment } from './postgres-environment';
const postgresTest = process.env.BILIMHUB_POSTGRES_TEST === '1';
if (postgresTest) {
  if (!process.env.APP_ENV_FILE) throw new Error('An explicit test branch env file is required.');
  loadEnvironment();
  if (!process.env.NEON_BRANCH?.startsWith('codex-bilimhub-verify'))
    throw new Error('Refusing integration fixtures outside the isolated verification branch.');
  process.env.DATABASE_DRIVER = 'postgres';
  process.env.STORAGE_DRIVER = 'neon';
  if ((await one<{ n: number }>('SELECT COUNT(*) n FROM users'))!.n)
    throw new Error('The test branch must be empty.');
}
mkdirSync('.test-data', { recursive: true });
process.env.DATABASE_PATH = resolve('.test-data', `${randomUUID()}.sqlite`);
process.env.UPLOAD_DIR = resolve('.test-data', `http-materials-${randomUUID()}`);
if (!postgresTest) {
  process.env.DATABASE_DRIVER = 'sqlite';
  process.env.STORAGE_DRIVER = 'local';
  await migrate();
}
const adminEmail = 'admin@integration.invalid';
const password = 'Integration-only-password-123';
await run(
  'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  randomUUID(),
  adminEmail,
  'Test Admin',
  hashPassword(password),
  'admin',
  Date.now(),
);
const socket = createServer();
await new Promise<void>((done) => socket.listen(0, '127.0.0.1', done));
const port = (
  socket.address() as {
    port: number;
  }
).port;
await new Promise<void>((done) => socket.close(() => done()));
const origin = `http://127.0.0.1:${port}`;
let logs = '';
const server = spawn(
  process.execPath,
  [
    ...(process.argv.includes('--strict-cjs') ? ['--no-experimental-require-module'] : []),
    'node_modules/next/dist/bin/next',
    'start',
    '--port',
    String(port),
    '--hostname',
    '127.0.0.1',
  ],
  {
    env: { ...process.env, APP_ORIGIN: '', COOKIE_SECURE: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
server.stdout.on('data', (chunk) => {
  logs = (logs + chunk).slice(-16000);
});
server.stderr.on('data', (chunk) => {
  logs = (logs + chunk).slice(-16000);
});
class Browser {
  cookie = '';
  async get(path: string) {
    const target = new URL(path, origin);
    return fetch(`${origin}${target.pathname}${target.search}`, {
      headers: this.cookie ? { cookie: this.cookie } : {},
      redirect: 'manual',
    });
  }
  async html(path: string) {
    return (await this.get(path)).text();
  }
  async submit(path: string, data: Record<string, string>, match?: string, explicitForm?: string) {
    const html = explicitForm || (await this.html(path));
    const forms = html.match(/<form\b[\s\S]*?<\/form>/g) || [];
    const form = forms.find((item) =>
      match ? item.includes(match) : !!item.match(/name="\$ACTION_ID_/),
    );
    assert(form, `Missing form ${match || ''} at ${path}`);
    const action = form.match(/name="(\$ACTION_ID_[^"]+)"/);
    const nativeAction = form.match(/action="(\/api\/(?:lessons|courses))"/);
    assert(action || nativeAction, 'Missing form action');
    const body = new FormData();
    if (action) body.set(action[1], '');
    for (const [key, value] of Object.entries(data)) body.set(key, value);
    const response = await fetch(`${origin}${nativeAction ? nativeAction[1] : path}`, {
      method: 'POST',
      body,
      headers: { origin, ...(this.cookie ? { cookie: this.cookie } : {}) },
      redirect: 'manual',
    });
    const jar = new Map(
      this.cookie
        .split('; ')
        .filter(Boolean)
        .map((part) => {
          const split = part.indexOf('=');
          return [part.slice(0, split), part.slice(split + 1)];
        }),
    );
    for (const header of response.headers.getSetCookie()) {
      const item = header.split(';')[0];
      const split = item.indexOf('=');
      const key = item.slice(0, split);
      const value = item.slice(split + 1);
      if (/max-age=0/i.test(header) || !value) jar.delete(key);
      else jar.set(key, value);
    }
    this.cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
    assert.equal(response.status, 303, `Action failed at ${path}: ${response.status}`);
    return response.headers.get('location')!;
  }
}
async function upload(
  browser: Browser,
  lessonId: string,
  filename: string,
  bytes: Buffer,
  requestOrigin = origin,
) {
  const body = new FormData();
  body.set('lessonId', lessonId);
  body.set('file', new Blob([new Uint8Array(bytes)]), filename);
  return fetch(`${origin}/api/lesson-materials`, {
    method: 'POST',
    body,
    redirect: 'manual',
    headers: { origin: requestOrigin, ...(browser.cookie ? { cookie: browser.cookie } : {}) },
  });
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await delay(500);
  }
  assert(ready, `Server did not start. ${logs}`);
  const guest = new Browser();
  const student = new Browser();
  const teacher = new Browser();
  const admin = new Browser();
  assert.equal((await guest.get('/dashboard')).status, 307);
  await student.submit(
    '/register',
    { name: 'Тест оқушы', email: 'student@integration.invalid', password, role: 'admin' },
    'name="password"',
  );
  assert.equal(
    (await one<{
      role: string;
    }>('SELECT role FROM users WHERE email = ?', 'student@integration.invalid'))!.role,
    'student',
  );
  await teacher.submit(
    '/register',
    {
      name: 'Тест оқытушы',
      email: 'teacher@integration.invalid',
      password,
      teacher: 'on',
      role: 'teacher',
    },
    'name="password"',
  );
  assert.equal(
    (await one<{
      role: string;
    }>('SELECT role FROM users WHERE email = ?', 'teacher@integration.invalid'))!.role,
    'student',
  );
  assert.equal((await teacher.get('/teacher/new')).status, 307);
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM teacher_applications'))!.n,
    0,
  );
  assert(!(await student.html('/courses')).includes('Оқытушы болу'));
  assert(!(await guest.html('/register')).includes('name="teacher"'));
  await teacher.submit(
    '/profile',
    { bio: 'Университет кафедрасындағы тәжірибем және оқытатын пәндерім туралы өтінім.' },
    'name="bio"',
  );
  assert((await teacher.html('/profile')).includes('Өтінім бас әкімшінің қарауында'));
  await admin.submit('/login', { email: adminEmail, password }, 'name="password"');
  const pending = await admin.html('/admin/review');
  const application = (await one<{
    id: string;
  }>("SELECT id FROM teacher_applications WHERE status = 'pending'"))!;
  await student.submit(
    '/admin/review',
    { id: application.id, decision: 'approved' },
    'value="approved"',
    pending,
  );
  assert.equal(
    (await one<{
      status: string;
    }>('SELECT status FROM teacher_applications WHERE id = ?', application.id))!.status,
    'pending',
  );
  await admin.submit(
    '/admin/review',
    { id: application.id, decision: 'approved' },
    'value="approved"',
  );
  assert.equal(
    (await one<{
      role: string;
    }>('SELECT role FROM users WHERE email = ?', 'teacher@integration.invalid'))!.role,
    'teacher',
  );
  const createForm = await teacher.html('/teacher/new');
  const forbiddenCourse = new FormData();
  for (const [key, value] of Object.entries({
    title: 'Forbidden course',
    description: 'This course must never be created by a student.',
    category: 'Басқа',
  }))
    forbiddenCourse.set(key, value);
  assert(createForm.includes('course-wizard'));
  assert(!createForm.includes('name="price"') && !createForm.includes('₸'));
  assert.equal(
    (
      await fetch(`${origin}/api/courses`, {
        method: 'POST',
        body: forbiddenCourse,
        headers: { origin, cookie: student.cookie },
        redirect: 'manual',
      })
    ).status,
    403,
  );
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM courses'))!.n,
    0,
  );
  const location = await teacher.submit(
    '/teacher/new',
    {
      title: 'Интеграциялық курс',
      description: 'Бұл курс нақты серверлік оқу сценарийін тексеруге арналған.',
      category: 'Математика',
      price: '999999', // Old or forged fields cannot restore a paid course.
    },
    'name="title"',
  );
  const id = location.split('/').pop()!;
  assert(
    !Object.hasOwn(
      (await one<Record<string, unknown>>('SELECT * FROM courses WHERE id=?', id))!,
      'price_kzt',
    ),
  );
  const editorPath = `/teacher/courses/${id}`;
  const coverEditorPath = `${editorPath}?tab=cover`;
  const coverForm = await teacher.html(coverEditorPath);
  await student.submit(
    coverEditorPath,
    { courseId: id, coverPreset: 'brain' },
    'name="coverPreset"',
    coverForm,
  );
  assert.equal(
    await one(
      'SELECT course_id FROM course_presentation WHERE course_id=? AND preset=?',
      id,
      'brain',
    ),
    undefined,
  );
  await teacher.submit(
    coverEditorPath,
    { courseId: id, coverPreset: 'brain' },
    'name="coverPreset"',
  );
  assert((await teacher.html(`/courses/${id}`)).includes('illustration-brain'));
  const coverBody = new FormData();
  coverBody.set('courseId', id);
  const coverBytes = await sharp({
    create: { width: 480, height: 270, channels: 3, background: '#88c4a8' },
  })
    .png()
    .toBuffer();
  coverBody.set('file', new Blob([new Uint8Array(coverBytes)]), 'cover.png');
  const coverUpload = await fetch(`${origin}/api/course-covers`, {
    method: 'POST',
    body: coverBody,
    headers: { origin, cookie: teacher.cookie },
    redirect: 'manual',
  });
  assert.equal(coverUpload.status, 303);
  assert(!coverUpload.headers.get('location')?.includes('error='));
  const coverPath = `/courses/${id}/cover`;
  assert.equal((await guest.get(coverPath)).status, 404);
  assert.equal((await teacher.get(coverPath)).status, 200);
  await teacher.submit(
    `${editorPath}?tab=settings`,
    {
      courseId: id,
      title: 'Интеграциялық курс',
      description: 'Бұл курс нақты серверлік оқу сценарийін тексеруге арналған.',
      category: 'Технология',
      level: 'Орташа',
    },
    'Курс параметрлерін сақтау',
  );
  const sectionId = (await one<{
    id: string;
  }>('SELECT id FROM sections WHERE course_id = ?', id))!.id;
  await teacher.submit(
    `${editorPath}?tab=lecture&lesson=new`,
    {
      courseId: id,
      sectionId,
      title: 'Жабық сабақ',
      body: 'PRIVATE-LESSON-CONTENT',
      videoUrl: '',
      minutes: '12',
    },
    'action="/api/lessons"',
  );
  assert(!(await guest.html(`/courses/${id}`)).includes('Интеграциялық курс'));
  const lessonId = (await one<{
    id: string;
  }>('SELECT id FROM lessons WHERE section_id = ?', sectionId))!.id;
  const pdfBytes = await pdfFixture();
  // The visible creation form saves a lecture and its PDF/DOCX in one request.
  const documentLocation = await teacher.submit(
    '/teacher/new',
    {
      title: 'Құжат жүктеу тексерісі',
      description: 'PDF және Word құжаттарын жаңа дәріспен бірге сақтауды тексереміз.',
      category: 'Технология',
    },
    'name="title"',
  );
  const documentCourse = documentLocation.split('/').pop()!;
  const documentSection = (await one<{
    id: string;
  }>('SELECT id FROM sections WHERE course_id=?', documentCourse))!.id;
  const saveWithDocument = async (
    browser: Browser,
    name: string,
    bytes: Buffer,
    requestOrigin = origin,
  ) => {
    const body = new FormData();
    body.set('courseId', documentCourse);
    body.set('sectionId', documentSection);
    body.set('title', `Жаңа ${name} дәрісі`);
    body.set('minutes', '45');
    body.set('file', new Blob([new Uint8Array(bytes)]), name);
    return fetch(`${origin}/api/lessons`, {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: { origin: requestOrigin, ...(browser.cookie ? { cookie: browser.cookie } : {}) },
    });
  };
  const newDocumentForm = await teacher.html(`${documentLocation}?tab=lecture&lesson=new`);
  assert(newDocumentForm.includes('PDF немесе Word қосу'));
  assert(newDocumentForm.includes('type="file"'));
  assert.equal((await saveWithDocument(guest, 'lecture.pdf', pdfBytes)).status, 401);
  assert.equal((await saveWithDocument(student, 'lecture.pdf', pdfBytes)).status, 403);
  assert.equal(
    (await saveWithDocument(teacher, 'lecture.pdf', pdfBytes, 'https://foreign.invalid')).status,
    403,
  );
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM lessons WHERE section_id=?', documentSection))!.n,
    0,
  );
  const largePDF = await PDFDocument.load(pdfBytes);
  largePDF.context.register(largePDF.context.stream(Buffer.alloc(3 * 1024 * 1024, 90)));
  const largePDFBytes = Buffer.from(await largePDF.save({ useObjectStreams: false }));
  assert(largePDFBytes.length > 2 * 1024 * 1024);
  for (const [name, bytes] of [
    ['lecture.pdf', largePDFBytes],
    ['lecture.docx', await docxFixture(true)],
  ] as const) {
    const response = await saveWithDocument(teacher, name, bytes);
    assert.equal(response.status, 303);
    assert(response.headers.get('location')?.includes('success=documentuploaded'));
    const createdLesson = new URL(response.headers.get('location')!, origin).searchParams.get(
      'lesson',
    )!;
    const material = (await one<{
      id: string;
      kind: string;
    }>('SELECT id,kind FROM lesson_materials WHERE lesson_id=?', createdLesson))!;
    assert(material);
    assert.equal(
      (
        await teacher.get(
          `/materials/${material.id}/${material.kind === 'pdf' ? 'file' : 'preview'}`,
        )
      ).status,
      200,
    );
    const editor = await teacher.html(
      `/teacher/courses/${documentCourse}?tab=materials&lesson=${createdLesson}`,
    );
    assert(editor.includes('PDF / Word жүктеу'));
    assert(editor.includes('id="materials"'));
    assert(!editor.includes('name="videoUrl"'));
  }
  const invalidDocument = await saveWithDocument(teacher, 'broken.pdf', Buffer.from('invalid'));
  assert(invalidDocument.headers.get('location')?.includes('error=documentinvalid'));
  const retainedLesson = new URL(invalidDocument.headers.get('location')!, origin).searchParams.get(
    'lesson',
  )!;
  assert(await one('SELECT id FROM lessons WHERE id=?', retainedLesson));
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM lesson_materials WHERE lesson_id=?', retainedLesson))!.n,
    0,
  );
  await teacher.submit(
    `${editorPath}?tab=cover&lesson=${lessonId}`,
    { courseId: id, lessonId, coverPreset: 'science' },
    'Дәріс иллюстрациясын сақтау',
  );
  assert((await teacher.html(`/learn/${lessonId}`)).includes('illustration-science'));
  const lectureCoverBody = new FormData();
  lectureCoverBody.set('courseId', id);
  lectureCoverBody.set('lessonId', lessonId);
  lectureCoverBody.set('file', new Blob([new Uint8Array(coverBytes)]), 'lecture.png');
  const lectureCoverUpload = await fetch(`${origin}/api/course-covers`, {
    method: 'POST',
    body: lectureCoverBody,
    headers: { origin, cookie: teacher.cookie },
    redirect: 'manual',
  });
  assert.equal(lectureCoverUpload.status, 303);
  assert(!lectureCoverUpload.headers.get('location')?.includes('error='));
  const lectureCoverPath = `/learn/${lessonId}/cover`;
  assert.equal((await guest.get(lectureCoverPath)).status, 404);
  assert.equal((await teacher.get(lectureCoverPath)).status, 200);
  assert.equal((await upload(guest, lessonId, 'lecture.pdf', pdfBytes)).status, 401);
  assert.equal((await upload(student, lessonId, 'lecture.pdf', pdfBytes)).status, 403);
  assert.equal(
    (await upload(teacher, lessonId, 'lecture.pdf', pdfBytes, 'https://foreign.invalid')).status,
    403,
  );
  assert.equal((await upload(teacher, lessonId, 'Қазақша дәріс.pdf', pdfBytes)).status, 303);
  const pdfId = (await one<{
    id: string;
  }>("SELECT id FROM lesson_materials WHERE lesson_id = ? AND kind = 'pdf'", lessonId))!.id;
  const wordUpload = await upload(teacher, lessonId, 'Word дәрісі.docx', await docxFixture(true));
  assert.equal(wordUpload.status, 303);
  assert(
    !wordUpload.headers.get('location')?.includes('error='),
    `Word upload failed: ${wordUpload.headers.get('location')}. ${logs}`,
  );
  const wordId = (await one<{
    id: string;
  }>("SELECT id FROM lesson_materials WHERE lesson_id = ? AND kind = 'docx'", lessonId))!.id;
  const filePath = `/materials/${pdfId}/file`;
  const wordPath = `/materials/${wordId}/preview`;
  assert.equal((await student.get(filePath)).status, 404);
  assert.equal((await guest.get(wordPath)).status, 404);
  const wordPreview = await teacher.get(wordPath);
  assert.equal(wordPreview.status, 200);
  assert.equal(wordPreview.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert(wordPreview.headers.get('content-security-policy')?.includes("default-src 'none'"));
  assert((await wordPreview.text()).includes('Ә Ғ Қ Ң Ө Ұ Ү Һ І'));
  assert(!(await teacher.html(wordPath)).includes('javascript:'));
  const materialEditor = await teacher.html(`${editorPath}?tab=materials&lesson=${lessonId}`);
  assert(materialEditor.includes('multipart/form-data'));
  await teacher.submit(
    `${editorPath}?tab=materials&lesson=${lessonId}`,
    { materialId: pdfId },
    'name="materialId"',
  );
  assert.equal((await teacher.get(filePath)).status, 404);
  await teacher.submit(
    `${editorPath}?tab=materials&lesson=${lessonId}`,
    { materialId: pdfId, restore: 'yes' },
    'value="yes"',
  );
  assert.equal((await teacher.get(filePath)).status, 200);
  await teacher.submit(editorPath, { courseId: id }, 'Тексеруге жіберу');
  await admin.submit('/admin/review', { courseId: id, decision: 'published' }, 'value="published"');
  const managementHome = await admin.html('/admin');
  assert(managementHome.includes('management-hub'));
  assert(!managementHome.includes('name="decision"'));
  const adminNav =
    managementHome.match(/<nav aria-label="Негізгі мәзір">[\s\S]*?<\/nav>/)?.[0] || '';
  assert(adminNav.includes('href="/courses"') && adminNav.includes('href="/admin"'));
  assert(!adminNav.includes('href="/admin/users"') && !adminNav.includes('href="/admin/settings"'));
  assert(!(await admin.html('/admin/settings')).includes('Қазақша мәтіннің көрінісі'));
  const authorProfile = await teacher.html('/profile');
  assert(
    authorProfile.includes('profile-teaching') && authorProfile.includes(`/learn/${lessonId}`),
  );
  assert(authorProfile.includes('file-picker-target'));
  assert(!(await student.html('/profile')).includes('profile-teaching-course'));
  const log = await admin.html('/admin/activity?kind=edit');
  assert(log.includes('audit-event edit') && log.includes('Курс мәліметтері өңделді'));
  const publishedEditor = await teacher.html(`${editorPath}?tab=materials&lesson=${lessonId}`);
  assert(publishedEditor.includes('PDF және Word материалдары'));
  assert(publishedEditor.includes('Құжат қосу үшін өңдеуді ашу'));
  for (const [role, browser] of [
    ['guest', guest],
    ['student', student],
    ['teacher', teacher],
    ['admin', admin],
  ] as const) {
    const home = await browser.get('/');
    assert.equal(home.status, 200, `Home remains available to ${role}`);
    const html = await home.text();
    assert(html.includes('hero-art'), `Home illustration for ${role}`);
    assert(html.includes('class="course-card"'), `Home course cards for ${role}`);
    assert(html.includes('Басты бет'), `Home navigation for ${role}`);
    assert(!html.includes('Оқытушы болу'), `No teacher promotion for ${role}`);
    assert(html.includes('Жабық сабақ'), `First lecture title is visible for ${role}`);
    assert(
      !html.includes('PRIVATE-LESSON-CONTENT'),
      `Lesson body is not leaked into catalog for ${role}`,
    );
    const catalog = await browser.html('/courses?format=pdf');
    assert(catalog.includes('library-filters') && catalog.includes('lecture-list-card'));
    assert(!catalog.includes('hero-art') && !catalog.includes('PRIVATE-LESSON-CONTENT'));
    assert(catalog.includes('Пәндер мен курстар'), `Catalog available to ${role}`);
  }
  assert.equal((await guest.get(coverPath)).status, 200);
  assert.equal((await guest.get(lectureCoverPath)).status, 200);
  assert(!(await guest.html(`/learn/${lessonId}`)).includes('PRIVATE-LESSON-CONTENT'));
  assert(!(await student.html(`/learn/${lessonId}`)).includes('PRIVATE-LESSON-CONTENT'));
  const enrollmentForm = await student.html(`/courses/${id}`);
  await student.submit(`/courses/${id}`, { courseId: id }, 'name="courseId"', enrollmentForm);
  assert.equal((await student.get(`/learn/${lessonId}`)).status, 200);
  const enrolledFile = await student.get(filePath);
  assert.equal(enrolledFile.status, 200);
  assert.equal(enrolledFile.headers.get('content-type'), 'application/pdf');
  assert.equal(enrolledFile.headers.get('cache-control'), 'private, no-store');
  assert(Buffer.from(await enrolledFile.arrayBuffer()).equals(pdfBytes));
  const ranged = await fetch(`${origin}${filePath}`, {
    headers: { cookie: student.cookie, range: 'bytes=0-9' },
  });
  assert.equal(ranged.status, 206);
  assert.equal((await ranged.arrayBuffer()).byteLength, 10);
  assert.equal(
    (
      await fetch(`${origin}${filePath}`, {
        headers: { cookie: student.cookie, range: 'bytes=9999999-' },
      })
    ).status,
    416,
  );
  assert.equal((await student.get(wordPath)).status, 200);
  await run('UPDATE lessons SET is_preview = 1 WHERE id = ?', lessonId);
  assert.equal((await guest.get(filePath)).status, 200);
  await run('UPDATE lessons SET is_preview = 0 WHERE id = ?', lessonId);
  assert.equal((await guest.get(filePath)).status, 404);
  assert((await student.html(`/learn/${lessonId}`)).includes('PRIVATE-LESSON-CONTENT'));
  await student.submit(`/learn/${lessonId}`, { lessonId }, 'name="lessonId"');
  assert.match(await student.html('/dashboard'), /<progress[^>]*value="100"/);
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM lesson_progress WHERE completed_at IS NOT NULL'))!.n,
    1,
  );
  assert(!(await guest.html(`/learn/${lessonId}`)).includes('PRIVATE-LESSON-CONTENT'));
  const oldCookie = student.cookie;
  await student.submit('/dashboard', {}, 'Шығу');
  student.cookie = oldCookie;
  assert.equal((await student.get('/dashboard')).status, 307);
  await student.submit(
    '/login',
    { email: 'student@integration.invalid', password },
    'name="password"',
  );
  assert.match(await student.html('/dashboard'), /<progress[^>]*value="100"/);
  const stranger = new Browser();
  await stranger.submit(
    '/register',
    { name: 'Басқа оқушы', email: 'other@integration.invalid', password },
    'name="password"',
  );
  const openEnrollment = await stranger.html(`/courses/${id}`);
  assert(openEnrollment.includes('Курсқа жазылу'));
  assert(!openEnrollment.includes('Төлем') && !openEnrollment.includes('₸'));
  const enrollment = await stranger.submit(
    `/courses/${id}`,
    { courseId: id },
    'name="courseId"',
    enrollmentForm,
  );
  assert(!enrollment.includes('error='));
  assert.equal(
    (await one<{
      n: number;
    }>(
      `SELECT COUNT(*) n FROM enrollments e JOIN users u ON u.id = e.user_id WHERE u.email = ?`,
      'other@integration.invalid',
    ))!.n,
    1,
  );
  const createdGroup = await teacher.submit(
    '/teacher/groups/new',
    {
      name: 'ИС-24-1',
      department: 'Қазақша кафедра',
      academicYear: '2026–2027',
      semester: '1',
      description: 'HTTP топ тексеруі',
    },
    'name="academicYear"',
  );
  const groupId = new URL(createdGroup, origin).pathname.split('/').pop()!;
  const groupPath = `/teacher/groups/${groupId}`;
  await teacher.submit(groupPath, { groupId, courseId: id }, 'name="courseId"');
  await teacher.submit(groupPath, { groupId, days: '7', maxUses: '3' }, 'name="maxUses"');
  const token = teacher.cookie.match(new RegExp(`group_invite_${groupId}=([a-f0-9]{48})`))?.[1];
  assert(token, 'Generated invitation not found in the owner-only cookie');
  const inviteHtml = await guest.html(`/join/${token}`);
  assert(inviteHtml.includes('ИС-24-1'));
  assert(!inviteHtml.includes('student@integration.invalid'));
  assert.equal(
    await student.submit(`/join/${token}`, { token }, 'name="token"'),
    '/profile?success=joined#study-groups',
  );
  assert.equal((await student.get('/groups')).headers.get('location'), '/profile#study-groups');
  const classmate = new Browser();
  await classmate.submit(
    '/register',
    { name: 'Әсем Қанатқызы', email: 'peer-private@integration.invalid', password },
    'name="password"',
  );
  await classmate.submit(`/join/${token}`, { token }, 'name="token"');
  const peerRow = (await one<{
    id: string;
  }>('SELECT id FROM users WHERE email = ?', 'peer-private@integration.invalid'))!;
  await run(
    'UPDATE users SET department = ?, academic_title = ? WHERE id = ?',
    'PRIVATE-PEER-DEPARTMENT',
    'PRIVATE-PEER-TITLE',
    peerRow.id,
  );
  const profile = await student.html('/profile');
  assert(profile.includes('ИС-24-1'));
  assert(profile.includes('Әсем Қанатқызы'));
  assert(profile.includes(`/profile/people/${peerRow.id}`));
  for (const hidden of [
    'peer-private@integration.invalid',
    'PRIVATE-PEER',
    'href="/groups"',
    'href="/teacher/groups',
    'name="groupId"',
    'name="maxUses"',
    '/export',
  ])
    assert(!profile.includes(hidden), `Student profile leaked ${hidden}`);
  const peerPath = `/profile/people/${peerRow.id}`;
  const peerHtml = await student.html(peerPath);
  assert(peerHtml.includes('Әсем Қанатқызы'));
  for (const hidden of ['peer-private@integration.invalid', 'PRIVATE-PEER', 'name="academicTitle"'])
    assert(!peerHtml.includes(hidden), `Minimal profile leaked ${hidden}`);
  assert.equal((await guest.get(peerPath)).status, 307);
  const outsider = new Browser();
  await outsider.submit(
    '/register',
    { name: 'Бөтен студент', email: 'outsider@integration.invalid', password },
    'name="password"',
  );
  assert.equal((await outsider.get(peerPath)).status, 404);
  assert.equal((await student.get('/profile/people/missing')).status, 404);
  assert.equal((await student.get(`/teacher/groups/${groupId}`)).status, 307);
  const report = await teacher.html(groupPath);
  assert(report.includes('student@integration.invalid'));
  assert.match(report, /<progress[^>]*value="1"[^>]*max="1"/);
  assert.equal((await teacher.get(`${groupPath}/export`)).status, 200);
  assert.equal((await student.get(`${groupPath}/export`)).status, 403);
  assert.equal((await guest.get(`${groupPath}/export`)).status, 401);
  assert(
    (await (await teacher.get(`${groupPath}/export`)).text()).includes(
      'student@integration.invalid',
    ),
  );
  await student.submit(
    '/profile',
    {
      name: 'Қазақша студент',
      department: 'Ғылым кафедрасы',
      academicTitle: 'Студент',
      role: 'admin',
    },
    'name="academicTitle"',
  );
  const studentRow = (await one<{
    id: string;
    role: string;
  }>('SELECT id, role FROM users WHERE email = ?', 'student@integration.invalid'))!;
  assert.equal(studentRow.role, 'student');
  const otherRow = (await one<{
    id: string;
  }>('SELECT id FROM users WHERE email = ?', 'other@integration.invalid'))!;
  const otherPath = `/admin/users/${otherRow.id}`;
  const userForm = await admin.html(otherPath);
  await student.submit(
    otherPath,
    {
      userId: otherRow.id,
      name: 'Басқа оқытушы',
      email: 'other@integration.invalid',
      role: 'teacher',
      status: 'active',
      department: '',
      academicTitle: '',
    },
    'name="role"',
    userForm,
  );
  assert.equal(
    (await one<{
      role: string;
    }>('SELECT role FROM users WHERE id = ?', otherRow.id))!.role,
    'student',
  );
  await admin.submit(
    otherPath,
    {
      userId: otherRow.id,
      name: 'Басқа оқытушы',
      email: 'other@integration.invalid',
      role: 'teacher',
      status: 'active',
      department: '',
      academicTitle: '',
    },
    'name="role"',
  );
  await stranger.submit(
    '/login',
    { email: 'other@integration.invalid', password },
    'name="password"',
  );
  assert.equal((await stranger.get(groupPath)).status, 404);
  assert.equal((await saveWithDocument(stranger, 'foreign.pdf', pdfBytes)).status, 403);
  assert.equal((await stranger.get(`${groupPath}/export`)).status, 403);
  await stranger.submit(groupPath, { groupId, days: '7', maxUses: '5' }, 'name="maxUses"', report);
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM group_invites WHERE group_id = ?', groupId))!.n,
    1,
  );
  const inviteId = (await one<{
    id: string;
  }>('SELECT id FROM group_invites WHERE group_id = ?', groupId))!.id;
  await teacher.submit(groupPath, { groupId, inviteId }, 'name="inviteId"');
  assert((await guest.html(`/join/${token}`)).includes('Шақыру қолжетімсіз'));
  await teacher.submit(groupPath, { groupId, status: 'archived' }, 'name="status"');
  assert.equal(
    (await one<{
      status: string;
    }>('SELECT status FROM academic_groups WHERE id = ?', groupId))!.status,
    'archived',
  );
  assert(
    await one(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
      groupId,
      studentRow.id,
    ),
  );
  await admin.submit(
    otherPath,
    {
      userId: otherRow.id,
      name: 'Басқа оқытушы',
      email: 'other@integration.invalid',
      role: 'teacher',
      status: 'blocked',
      department: '',
      academicTitle: '',
    },
    'name="role"',
  );
  assert.equal((await stranger.get('/teacher')).status, 307);
  const blockedLogin = await stranger.submit(
    '/login',
    { email: 'other@integration.invalid', password },
    'name="password"',
  );
  assert(blockedLogin.includes('error=credentials'));
  for (const path of [
    '/admin',
    '/admin/users',
    `/admin/users/${studentRow.id}`,
    '/admin/groups',
    '/admin/courses',
    '/admin/settings',
    '/admin/activity',
    '/admin/review',
    '/teacher',
    '/teacher/groups',
    '/teacher/groups/new',
    '/profile',
  ])
    assert.equal((await admin.get(path)).status, 200, `Admin page ${path}`);
  assert.equal((await guest.get('/admin')).status, 307);
  assert.equal((await student.get('/admin/users')).status, 307);
  await teacher.submit(
    groupPath,
    {
      groupId,
      name: 'ИС-24-1 жаңартылған',
      department: 'Кафедра',
      academicYear: '2026–2027',
      semester: '2',
      description: 'Өңделген топ',
    },
    'name="academicYear"',
  );
  assert.equal(
    (await one<{
      semester: number;
    }>('SELECT semester FROM academic_groups WHERE id = ?', groupId))!.semester,
    2,
  );
  await student.submit(
    groupPath,
    { groupId, userId: studentRow.id, self: 'yes' },
    'name="userId"',
    report,
  );
  assert(
    await one(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
      groupId,
      studentRow.id,
    ),
  );
  await teacher.submit(groupPath, { groupId, userId: studentRow.id }, 'name="userId"');
  assert(
    !(await one(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
      groupId,
      studentRow.id,
    )),
  );
  assert(
    await one(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?',
      studentRow.id,
      id,
    ),
  );
  assert.equal((await student.get(peerPath)).status, 404);
  assert(!(await student.html('/profile')).includes('ИС-24-1 жаңартылған'));
  await admin.submit(
    '/admin/courses',
    { courseId: id, operation: 'hide', returnTo: '/admin/courses' },
    'value="hide"',
  );
  assert.equal((await guest.get(coverPath)).status, 404);
  assert.equal((await guest.get(lectureCoverPath)).status, 404);
  assert(!(await student.html(`/learn/${lessonId}`)).includes('PRIVATE-LESSON-CONTENT'));
  await admin.submit(
    '/admin/courses?archive=1',
    { courseId: id, operation: 'restore', returnTo: '/admin/courses' },
    'value="restore"',
  );
  await teacher.submit(editorPath, { courseId: id, title: 'Екінші бөлім' }, 'Бөлім қосу');
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM sections WHERE course_id = ?', id))!.n,
    2,
  );
  const emptySection = (await one<{
    id: string;
  }>('SELECT id FROM sections WHERE course_id=? AND id!=?', id, sectionId))!.id;
  const sectionForm = await teacher.html(editorPath);
  await student.submit(
    editorPath,
    { courseId: id, sectionId: emptySection },
    'Бөлімді жоюды растау',
    sectionForm,
  );
  assert(!(await one('SELECT section_id FROM section_trash WHERE section_id=?', emptySection)));
  await teacher.submit(
    editorPath,
    { courseId: id, sectionId: emptySection },
    'Бөлімді жоюды растау',
  );
  assert(await one('SELECT section_id FROM section_trash WHERE section_id=?', emptySection));
  await teacher.submit(
    editorPath,
    { courseId: id, sectionId: emptySection },
    'restore-section-row',
  );
  assert(!(await one('SELECT section_id FROM section_trash WHERE section_id=?', emptySection)));
  await teacher.submit(
    `${editorPath}?lesson=${lessonId}`,
    {
      courseId: id,
      lessonId,
      sectionId,
      title: 'Жаңартылған дәріс',
      body: 'UPDATED-PRIVATE-LESSON',
      videoUrl: '',
      minutes: '15',
    },
    'action="/api/lessons"',
  );
  await teacher.submit(editorPath, { courseId: id }, 'Тексеруге жіберу');
  await admin.submit('/admin/review', { courseId: id, decision: 'published' }, 'value="published"');
  assert((await student.html(`/learn/${lessonId}`)).includes('UPDATED-PRIVATE-LESSON'));
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM lesson_progress WHERE user_id = ?', studentRow.id))!.n,
    1,
  );
  const candidate = new Browser();
  await candidate.submit(
    '/register',
    { name: 'Өтінім иесі', email: 'candidate@integration.invalid', password },
    'name="password"',
  );
  await candidate.submit(
    '/profile',
    { bio: 'Мен университетте оқытатын пәндерім туралы толық ақпарат ұсынамын.' },
    'name="bio"',
  );
  const candidateId = (await one<{
    id: string;
  }>("SELECT id FROM teacher_applications WHERE status = 'pending'"))!.id;
  await admin.submit(
    '/admin/review',
    { id: candidateId, decision: 'rejected', note: 'Тәжірибені нақтылаңыз' },
    'value="rejected"',
  );
  assert((await candidate.html('/profile')).includes('Тәжірибені нақтылаңыз'));
  await candidate.submit(
    '/profile',
    { bio: 'Тәжірибемді және кафедрадағы пәндерімді нақтылап қайта ұсынып отырмын.' },
    'name="bio"',
  );
  await admin.submit(
    '/admin/review',
    { id: candidateId, decision: 'approved' },
    'value="approved"',
  );
  assert.equal((await candidate.get('/teacher/new')).status, 200);
  const signupForm = await guest.html('/register');
  await admin.submit(
    '/admin/settings',
    {
      siteName: 'Университет',
      institutionName: 'Тексеру университеті',
      announcement: 'Ғылым апталығы',
    },
    'name="siteName"',
  );
  assert((await guest.html('/courses')).includes('Ғылым апталығы'));
  assert(!(await guest.html('/register')).includes('name="password"'));
  const closed = await guest.submit(
    '/register',
    { name: 'Closed signup', email: 'closed@integration.invalid', password },
    'name="password"',
    signupForm,
  );
  assert(closed.includes('registrationclosed'));
  assert(!(await one('SELECT id FROM users WHERE email = ?', 'closed@integration.invalid')));
  // Every new control is exercised through HTTP on the isolated database.
  const bannerForm = new FormData();
  for (const [key, value] of Object.entries({
    title: 'Баннері бар курс',
    description: 'Жеке мұқабамен бірден жасалатын сынақ курсы.',
    category: 'Информатика',
    level: 'Бастапқы',
    coverMode: 'upload',
  }))
    bannerForm.set(key, value);
  bannerForm.set('file', new Blob([new Uint8Array(coverBytes)]), 'banner.png');
  const bannerResponse = await fetch(`${origin}/api/courses`, {
    method: 'POST',
    body: bannerForm,
    headers: { origin, cookie: teacher.cookie, accept: 'application/json' },
  });
  assert.equal(bannerResponse.status, 200, await bannerResponse.clone().text());
  const bannerPath = (await bannerResponse.json()).redirect as string;
  const bannerId = bannerPath.split('/').pop()!;
  assert(
    await one(
      'SELECT course_id FROM course_presentation WHERE course_id=? AND cover_key IS NOT NULL',
      bannerId,
    ),
  );
  assert.equal((await teacher.get(`/courses/${bannerId}/cover`)).status, 200);
  assert.equal((await guest.get(`/courses/${bannerId}/cover`)).status, 404);
  const otherCourseControls = await admin.html('/admin/courses');
  const forgedHide = await candidate.submit(
    '/admin/courses',
    {
      courseId: bannerId,
      operation: 'hide',
      returnTo: '/admin/courses',
    },
    'value="hide"',
    otherCourseControls,
  );
  assert(forgedHide.includes('forbidden'));
  assert.equal(
    (await one<{
      status: string;
    }>('SELECT status FROM courses WHERE id=?', bannerId))!.status,
    'draft',
  );
  await admin.submit(
    '/admin/courses',
    { courseId: bannerId, operation: 'hide', returnTo: '/admin/courses' },
    'value="hide"',
  );
  assert((await admin.html('/admin/courses?view=hidden')).includes('Баннері бар курс'));
  await admin.submit(
    '/admin/courses?view=hidden',
    { courseId: bannerId, operation: 'trash', returnTo: '/admin/courses' },
    'value="trash"',
  );
  assert(await one('SELECT course_id FROM course_trash WHERE course_id=?', bannerId));
  await admin.submit(
    '/admin/courses?view=trash',
    { courseId: bannerId, operation: 'restore', returnTo: '/admin/courses' },
    'value="restore"',
  );
  assert(!(await one('SELECT course_id FROM course_trash WHERE course_id=?', bannerId)));
  assert.equal(
    (await one<{
      status: string;
    }>('SELECT status FROM courses WHERE id=?', bannerId))!.status,
    'draft',
  );
  await teacher.submit('/teacher', { courseId: bannerId, operation: 'trash' }, 'value="trash"');
  const purgeForm = await admin.html('/admin/courses?view=trash');
  const purgeData = {
    courseId: bannerId,
    operation: 'purge',
    confirmTitle: 'Баннері бар курс',
    confirm: 'on',
    returnTo: '/admin/courses',
  };
  await teacher.submit('/admin/courses?view=trash', purgeData, 'value="purge"', purgeForm);
  assert(await one('SELECT id FROM courses WHERE id=?', bannerId));
  const wrongPurge = await admin.submit(
    '/admin/courses?view=trash',
    { ...purgeData, confirmTitle: 'wrong' },
    'value="purge"',
  );
  assert(wrongPurge.includes('purgeconfirmation'));
  assert(await one('SELECT id FROM courses WHERE id=?', bannerId));
  await admin.submit('/admin/courses?view=trash', purgeData, 'value="purge"');
  assert(!(await one('SELECT id FROM courses WHERE id=?', bannerId)));
  assert.equal((await teacher.get(`/courses/${bannerId}/cover`)).status, 404);
  assert(await one('SELECT id FROM courses WHERE id=?', id));
  const candidateUserId = (await one<{
    id: string;
  }>('SELECT id FROM users WHERE email=?', 'candidate@integration.invalid'))!.id;
  await candidate.submit(
    '/profile',
    {
      name: 'Өтінім иесі жаңартылған',
      department: 'Тест кафедрасы',
      academicTitle: 'Оқытушы',
      university: 'Сынақ университеті',
      about: 'PRIVATE-PROFILE-BIO',
      phone: '+70000000000',
      city: 'Қызылорда',
      website: 'https://example.invalid',
      role: 'admin',
      email: adminEmail,
      userId: studentRow.id,
    },
    'name="academicTitle"',
  );
  assert.equal(
    (await one<{
      role: string;
    }>('SELECT role FROM users WHERE id=?', candidateUserId))!.role,
    'teacher',
  );
  assert.equal(
    (await one<{
      email: string;
    }>('SELECT email FROM users WHERE id=?', candidateUserId))!.email,
    'candidate@integration.invalid',
  );
  assert.equal(
    (await one<{
      city: string;
    }>('SELECT city FROM user_profiles WHERE user_id=?', candidateUserId))!.city,
    'Қызылорда',
  );
  assert((await candidate.html('/profile?tab=contacts')).includes('+70000000000'));
  const avatarForm = new FormData();
  avatarForm.set('file', new Blob([new Uint8Array(coverBytes)]), 'avatar.png');
  avatarForm.set('userId', studentRow.id);
  const avatarResponse = await fetch(`${origin}/api/profile/avatar`, {
    method: 'POST',
    body: avatarForm,
    headers: { origin, cookie: candidate.cookie },
    redirect: 'manual',
  });
  assert.equal(avatarResponse.status, 303);
  assert.equal((await candidate.get('/api/profile/avatar')).status, 200);
  assert.equal((await guest.get('/api/profile/avatar')).status, 404);
  assert.equal((await admin.get(`/api/profile/avatar?userId=${candidateUserId}`)).status, 404);
  assert(
    !(await one(
      'SELECT user_id FROM user_profiles WHERE user_id=? AND avatar_key IS NOT NULL',
      studentRow.id,
    )),
  );
  assert.equal(
    (
      await fetch(`${origin}/api/profile/avatar`, {
        method: 'POST',
        body: avatarForm,
        headers: { origin: 'https://evil.invalid', cookie: candidate.cookie },
        redirect: 'manual',
      })
    ).status,
    403,
  );
  const securityPath = '/profile?tab=security';
  const newPassword = 'Updated-integration-password-123';
  const badPassword = await candidate.submit(
    securityPath,
    { operation: 'password', currentPassword: 'wrong', newPassword, confirmation: newPassword },
    'value="password"',
  );
  assert(badPassword.includes('currentpassword'));
  const staleSession = new Browser();
  staleSession.cookie = candidate.cookie;
  const changedPassword = await candidate.submit(
    securityPath,
    { operation: 'password', currentPassword: password, newPassword, confirmation: newPassword },
    'value="password"',
  );
  assert(changedPassword.includes('passwordchanged'));
  assert.equal((await staleSession.get('/profile')).status, 307);
  const oldLogin = await candidate.submit(
    '/login',
    { email: 'candidate@integration.invalid', password },
    'name="password"',
  );
  assert(oldLogin.includes('error='));
  await candidate.submit(
    '/login',
    { email: 'candidate@integration.invalid', password: newPassword },
    'name="password"',
  );
  assert.equal((await candidate.get('/profile')).status, 200);
  const changedEmail = await candidate.submit(
    securityPath,
    {
      operation: 'email',
      currentPassword: newPassword,
      email: 'updated-candidate@integration.invalid',
    },
    'value="email"',
  );
  assert(changedEmail.includes('emailchanged'));
  await candidate.submit(
    '/login',
    { email: 'updated-candidate@integration.invalid', password: newPassword },
    'name="password"',
  );
  assert.equal((await candidate.get('/profile')).status, 200);
  console.log(
    'PASS: no course prices or paid restrictions, open enrollment, immediate custom course banner, admin hide/trash/restore/permanent deletion, owner isolation, extended profile/avatar privacy, password/email and session revocation, PDF >2MB/DOCX, section restoration, learning, group privacy, invitations, CSV, blocking and registration settings.',
  );
} catch (error) {
  mkdirSync('.local', { recursive: true });
  writeFileSync(
    '.local/neon-http-server.log',
    logs.replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[DATABASE_URL redacted]'),
  );
  throw error;
} finally {
  server.kill();
}
