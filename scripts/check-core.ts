import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { migrate, one, run } from '../src/lib/db';
import { hashPassword } from '../src/lib/security';
import { pdfFixture, docxFixture } from '../tests/document-fixtures';
import sharp from 'sharp';

mkdirSync('.test-data', { recursive: true });
process.env.DATABASE_PATH = resolve('.test-data', `${randomUUID()}.sqlite`);
process.env.UPLOAD_DIR = resolve('.test-data', `http-materials-${randomUUID()}`);
migrate();
const adminEmail = 'admin@integration.invalid';
const password = 'Integration-only-password-123';
run(
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
const port = (socket.address() as { port: number }).port;
await new Promise<void>((done) => socket.close(() => done()));
const origin = `http://127.0.0.1:${port}`;
let logs = '';
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--port', String(port), '--hostname', '127.0.0.1'],
  {
    env: { ...process.env, APP_ORIGIN: origin, COOKIE_SECURE: 'false' },
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
    return fetch(`${origin}${path}`, {
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
    assert(action, 'Missing server action');
    const body = new FormData();
    body.set(action[1], '');
    for (const [key, value] of Object.entries(data)) body.set(key, value);
    const response = await fetch(`${origin}${path}`, {
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
    one<{ role: string }>('SELECT role FROM users WHERE email = ?', 'student@integration.invalid')!
      .role,
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
    one<{ role: string }>('SELECT role FROM users WHERE email = ?', 'teacher@integration.invalid')!
      .role,
    'student',
  );
  assert.equal((await teacher.get('/teacher/new')).status, 307);
  assert.equal(one<{ n: number }>('SELECT COUNT(*) n FROM teacher_applications')!.n, 0);
  assert(!(await student.html('/courses')).includes('Оқытушы болу'));
  assert(!(await guest.html('/register')).includes('name="teacher"'));
  await teacher.submit(
    '/profile',
    { bio: 'Университет кафедрасындағы тәжірибем және оқытатын пәндерім туралы өтінім.' },
    'name="bio"',
  );
  assert((await teacher.html('/profile')).includes('Өтінім бас әкімшінің қарауында'));
  await admin.submit('/login', { email: adminEmail, password }, 'name="password"');
  const pending = await admin.html('/admin');
  const application = one<{ id: string }>(
    "SELECT id FROM teacher_applications WHERE status = 'pending'",
  )!;
  await student.submit(
    '/admin',
    { id: application.id, decision: 'approved' },
    'value="approved"',
    pending,
  );
  assert.equal(
    one<{ status: string }>('SELECT status FROM teacher_applications WHERE id = ?', application.id)!
      .status,
    'pending',
  );
  await admin.submit('/admin', { id: application.id, decision: 'approved' }, 'value="approved"');
  assert.equal(
    one<{ role: string }>('SELECT role FROM users WHERE email = ?', 'teacher@integration.invalid')!
      .role,
    'teacher',
  );
  const createForm = await teacher.html('/teacher/new');
  await student.submit(
    '/teacher/new',
    {
      title: 'Forbidden course',
      description: 'This course must never be created by a student.',
      category: 'Басқа',
      price: '0',
    },
    'name="title"',
    createForm,
  );
  assert.equal(one<{ n: number }>('SELECT COUNT(*) n FROM courses')!.n, 0);
  const location = await teacher.submit(
    '/teacher/new',
    {
      title: 'Интеграциялық курс',
      description: 'Бұл курс нақты серверлік оқу сценарийін тексеруге арналған.',
      category: 'Математика',
      price: '0',
    },
    'name="title"',
  );
  const id = location.split('/').pop()!;
  const editorPath = `/teacher/courses/${id}`;
  const coverForm = await teacher.html(editorPath);
  await student.submit(
    editorPath,
    { courseId: id, coverPreset: 'brain' },
    'name="coverPreset"',
    coverForm,
  );
  assert.equal(
    one('SELECT course_id FROM course_presentation WHERE course_id=? AND preset=?', id, 'brain'),
    undefined,
  );
  await teacher.submit(editorPath, { courseId: id, coverPreset: 'brain' }, 'name="coverPreset"');
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
    editorPath,
    {
      courseId: id,
      title: 'Интеграциялық курс',
      description: 'Бұл курс нақты серверлік оқу сценарийін тексеруге арналған.',
      category: 'Технология',
      level: 'Орташа',
      price: '0',
    },
    'Курс параметрлерін сақтау',
  );
  const sectionId = one<{ id: string }>('SELECT id FROM sections WHERE course_id = ?', id)!.id;
  await teacher.submit(
    editorPath,
    {
      courseId: id,
      sectionId,
      title: 'Жабық сабақ',
      body: 'PRIVATE-LESSON-CONTENT',
      videoUrl: '',
      minutes: '12',
    },
    'name="lessonId"',
  );
  assert(!(await guest.html(`/courses/${id}`)).includes('Интеграциялық курс'));
  const lessonId = one<{ id: string }>(
    'SELECT id FROM lessons WHERE section_id = ?',
    sectionId,
  )!.id;
  const pdfBytes = await pdfFixture();
  await teacher.submit(
    `${editorPath}?lesson=${lessonId}`,
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
  const pdfId = one<{ id: string }>(
    "SELECT id FROM lesson_materials WHERE lesson_id = ? AND kind = 'pdf'",
    lessonId,
  )!.id;
  const wordUpload = await upload(teacher, lessonId, 'Word дәрісі.docx', await docxFixture(true));
  assert.equal(wordUpload.status, 303);
  assert(
    !wordUpload.headers.get('location')?.includes('error='),
    `Word upload failed: ${wordUpload.headers.get('location')}. ${logs}`,
  );
  const wordId = one<{ id: string }>(
    "SELECT id FROM lesson_materials WHERE lesson_id = ? AND kind = 'docx'",
    lessonId,
  )!.id;
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
  const materialEditor = await teacher.html(`${editorPath}?lesson=${lessonId}`);
  assert(materialEditor.includes('multipart/form-data'));
  await teacher.submit(
    `${editorPath}?lesson=${lessonId}`,
    { materialId: pdfId },
    'name="materialId"',
  );
  assert.equal((await teacher.get(filePath)).status, 404);
  await teacher.submit(
    `${editorPath}?lesson=${lessonId}`,
    { materialId: pdfId, restore: 'yes' },
    'value="yes"',
  );
  assert.equal((await teacher.get(filePath)).status, 200);
  await teacher.submit(editorPath, { courseId: id }, 'Тексеруге жіберу');
  await admin.submit('/admin', { courseId: id, decision: 'published' }, 'value="published"');
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
  run('UPDATE lessons SET is_preview = 1 WHERE id = ?', lessonId);
  assert.equal((await guest.get(filePath)).status, 200);
  run('UPDATE lessons SET is_preview = 0 WHERE id = ?', lessonId);
  assert.equal((await guest.get(filePath)).status, 404);
  assert((await student.html(`/learn/${lessonId}`)).includes('PRIVATE-LESSON-CONTENT'));
  await student.submit(`/learn/${lessonId}`, { lessonId }, 'name="lessonId"');
  assert.match(await student.html('/dashboard'), /<progress[^>]*value="100"/);
  assert.equal(
    one<{ n: number }>('SELECT COUNT(*) n FROM lesson_progress WHERE completed_at IS NOT NULL')!.n,
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
  run('UPDATE courses SET price_kzt = 5000 WHERE id = ?', id);
  const stranger = new Browser();
  await stranger.submit(
    '/register',
    { name: 'Басқа оқушы', email: 'other@integration.invalid', password },
    'name="password"',
  );
  assert((await stranger.html(`/courses/${id}`)).includes('Төлем қызметі'));
  const deniedPurchase = await stranger.submit(
    `/courses/${id}`,
    { courseId: id },
    'name="courseId"',
    enrollmentForm,
  );
  assert(deniedPurchase.includes('error=payment'));
  assert.equal(
    one<{ n: number }>(
      `SELECT COUNT(*) n FROM enrollments e JOIN users u ON u.id = e.user_id WHERE u.email = ?`,
      'other@integration.invalid',
    )!.n,
    0,
  );
  run('UPDATE courses SET price_kzt = 0 WHERE id = ?', id);
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
  const peerRow = one<{ id: string }>(
    'SELECT id FROM users WHERE email = ?',
    'peer-private@integration.invalid',
  )!;
  run(
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
  const studentRow = one<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE email = ?',
    'student@integration.invalid',
  )!;
  assert.equal(studentRow.role, 'student');
  const otherRow = one<{ id: string }>(
    'SELECT id FROM users WHERE email = ?',
    'other@integration.invalid',
  )!;
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
    one<{ role: string }>('SELECT role FROM users WHERE id = ?', otherRow.id)!.role,
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
  assert.equal((await stranger.get(`${groupPath}/export`)).status, 403);
  await stranger.submit(groupPath, { groupId, days: '7', maxUses: '5' }, 'name="maxUses"', report);
  assert.equal(
    one<{ n: number }>('SELECT COUNT(*) n FROM group_invites WHERE group_id = ?', groupId)!.n,
    1,
  );
  const inviteId = one<{ id: string }>(
    'SELECT id FROM group_invites WHERE group_id = ?',
    groupId,
  )!.id;
  await teacher.submit(groupPath, { groupId, inviteId }, 'name="inviteId"');
  assert((await guest.html(`/join/${token}`)).includes('Шақыру қолжетімсіз'));
  await teacher.submit(groupPath, { groupId, status: 'archived' }, 'name="status"');
  assert.equal(
    one<{ status: string }>('SELECT status FROM academic_groups WHERE id = ?', groupId)!.status,
    'archived',
  );
  assert(
    one(
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
    one<{ semester: number }>('SELECT semester FROM academic_groups WHERE id = ?', groupId)!
      .semester,
    2,
  );
  await student.submit(
    groupPath,
    { groupId, userId: studentRow.id, self: 'yes' },
    'name="userId"',
    report,
  );
  assert(
    one(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
      groupId,
      studentRow.id,
    ),
  );
  await teacher.submit(groupPath, { groupId, userId: studentRow.id }, 'name="userId"');
  assert(
    !one(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
      groupId,
      studentRow.id,
    ),
  );
  assert(
    one('SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?', studentRow.id, id),
  );
  assert.equal((await student.get(peerPath)).status, 404);
  assert(!(await student.html('/profile')).includes('ИС-24-1 жаңартылған'));
  await admin.submit('/admin/courses', { courseId: id, status: 'archived' }, 'value="archived"');
  assert.equal((await guest.get(coverPath)).status, 404);
  assert.equal((await guest.get(lectureCoverPath)).status, 404);
  assert(!(await student.html(`/learn/${lessonId}`)).includes('PRIVATE-LESSON-CONTENT'));
  await admin.submit(
    '/admin/courses?archive=1',
    { courseId: id, status: 'draft' },
    'value="draft"',
  );
  await teacher.submit(editorPath, { courseId: id, title: 'Екінші бөлім' }, 'Бөлім қосу');
  assert.equal(one<{ n: number }>('SELECT COUNT(*) n FROM sections WHERE course_id = ?', id)!.n, 2);
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
    'name="lessonId"',
  );
  await teacher.submit(editorPath, { courseId: id }, 'Тексеруге жіберу');
  await admin.submit('/admin', { courseId: id, decision: 'published' }, 'value="published"');
  assert((await student.html(`/learn/${lessonId}`)).includes('UPDATED-PRIVATE-LESSON'));
  assert.equal(
    one<{ n: number }>('SELECT COUNT(*) n FROM lesson_progress WHERE user_id = ?', studentRow.id)!
      .n,
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
  const candidateId = one<{ id: string }>(
    "SELECT id FROM teacher_applications WHERE status = 'pending'",
  )!.id;
  await admin.submit(
    '/admin',
    { id: candidateId, decision: 'rejected', note: 'Тәжірибені нақтылаңыз' },
    'value="rejected"',
  );
  assert((await candidate.html('/profile')).includes('Тәжірибені нақтылаңыз'));
  await candidate.submit(
    '/profile',
    { bio: 'Тәжірибемді және кафедрадағы пәндерімді нақтылап қайта ұсынып отырмын.' },
    'name="bio"',
  );
  await admin.submit('/admin', { id: candidateId, decision: 'approved' }, 'value="approved"');
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
  assert(!one('SELECT id FROM users WHERE email = ?', 'closed@integration.invalid'));
  console.log(
    'PASS: learning, super-admin controls, profile-only groups and peer privacy, PDF/DOCX upload and preview, Range, document access and restoration, teacher isolation, invitations, CSV, blocking, and registration settings.',
  );
} finally {
  server.kill();
}
