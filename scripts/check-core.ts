import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { migrate, one, run } from '../src/lib/db';
import { hashPassword } from '../src/lib/security';

mkdirSync('.test-data', { recursive: true });
process.env.DATABASE_PATH = resolve('.test-data', `${randomUUID()}.sqlite`);
migrate();
const adminEmail = 'admin@integration.invalid';
const password = 'Integration-only-password-123';
run(
  'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)',
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
    const cookie = response.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    assert.equal(response.status, 303, `Action failed at ${path}: ${response.status}`);
    return response.headers.get('location')!;
  }
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
  await teacher.submit(editorPath, { courseId: id }, 'Тексеруге жіберу');
  await admin.submit('/admin', { courseId: id, decision: 'published' }, 'value="published"');
  const lessonId = one<{ id: string }>(
    'SELECT id FROM lessons WHERE section_id = ?',
    sectionId,
  )!.id;
  assert(!(await guest.html(`/learn/${lessonId}`)).includes('PRIVATE-LESSON-CONTENT'));
  assert(!(await student.html(`/learn/${lessonId}`)).includes('PRIVATE-LESSON-CONTENT'));
  const enrollmentForm = await student.html(`/courses/${id}`);
  await student.submit(`/courses/${id}`, { courseId: id }, 'name="courseId"', enrollmentForm);
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
  console.log(
    'PASS: real HTTP registration, login/logout, forged-role rejection, admin approval, forbidden actions, draft privacy, course moderation, enrollment, private lesson access, persisted progress, and paid-course unavailability.',
  );
} finally {
  server.kill();
}
