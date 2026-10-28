import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  issueSession,
  rateLimit,
  safeVideoUrl,
  tokenHash,
} from '../src/lib/security';
import { migrate, one, run, transaction } from '../src/lib/db';
import { listCourses } from '../src/lib/courses';
process.env.DATABASE_PATH = ':memory:';
await migrate();
const userId = randomUUID();
await run(
  'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  userId,
  'test@example.invalid',
  'Тест',
  hashPassword('test-password-12345'),
  'student',
  Date.now(),
);
test('Passwords are salted, verified and never stored as plaintext', () => {
  const first = hashPassword('long-password-12345');
  const second = hashPassword('long-password-12345');
  assert.notEqual(first, second);
  assert.equal(verifyPassword('long-password-12345', first), true);
  assert.equal(verifyPassword('wrong-password', first), false);
  assert.equal(verifyPassword('anything', 'malformed'), false);
});
test('Sessions persist only a digest and have a bounded lifetime', async () => {
  const token = await issueSession(userId);
  const session = (await one<{
    token_hash: string;
    expires_at: number;
    user_id: string;
  }>('SELECT * FROM sessions WHERE token_hash = ?', tokenHash(token)))!;
  assert.notEqual(session.token_hash, token);
  assert.equal(session.user_id, userId);
  assert(session.expires_at > Date.now());
  assert(session.expires_at <= Date.now() + 7 * 86400000);
});
test('Rate limit stops excessive attempts and recovers after expiry', async () => {
  assert.equal(await rateLimit('test', 2, 60000), true);
  assert.equal(await rateLimit('test', 2, 60000), true);
  assert.equal(await rateLimit('test', 2, 60000), false);
  await run('UPDATE rate_limits SET reset_at = 0 WHERE key = ?', 'test');
  assert.equal(await rateLimit('test', 2, 60000), true);
});
test('A failed transaction does not leave half-written approval data', async () => {
  await assert.rejects(
    async () =>
      await transaction(async () => {
        await run("UPDATE users SET role = 'teacher' WHERE id = ?", userId);
        throw new Error('test rollback');
      }),
  );
  assert.equal(
    (await one<{
      role: string;
    }>('SELECT role FROM users WHERE id = ?', userId))!.role,
    'student',
  );
});
test('User role defaults to student and invalid roles are rejected by the database', async () => {
  await run(
    'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    randomUUID(),
    'default@example.invalid',
    'Default',
    'unused',
    Date.now(),
  );
  assert.equal(
    (await one<{
      role: string;
    }>('SELECT role FROM users WHERE email = ?', 'default@example.invalid'))!.role,
    'student',
  );
  await assert.rejects(
    async () => await run('UPDATE users SET role = ? WHERE id = ?', 'superadmin', userId),
  );
});
test('Catalog excludes drafts and treats SQL fragments as search data', async () => {
  await run(
    'INSERT INTO courses (id,owner_id,title,description,category,level,status,accent,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    'private-course',
    userId,
    'Private draft',
    'Private description',
    'Басқа',
    'Бастапқы',
    'draft',
    'teal',
    Date.now(),
    Date.now(),
  );
  assert.equal((await listCourses()).length, 0);
  assert.equal((await listCourses("' OR 1=1 --")).length, 0);
  await run("UPDATE courses SET status = 'published' WHERE id = 'private-course'");
  assert.equal((await listCourses()).length, 1);
  assert.equal((await listCourses("' OR 1=1 --")).length, 0);
});
test('Video URLs reject active protocols and embedded credentials', () => {
  assert.equal(safeVideoUrl('javascript:alert(1)'), null);
  assert.equal(safeVideoUrl('http://example.invalid/lesson.mp4'), null);
  assert.equal(safeVideoUrl('https://user:secret@example.invalid/video.mp4'), null);
  assert.equal(
    safeVideoUrl('https://example.invalid/lesson.mp4'),
    'https://example.invalid/lesson.mp4',
  );
  assert.equal(safeVideoUrl(''), '');
});
test('Kazakh search is case-insensitive and categories remain isolated', async () => {
  await run(
    'UPDATE courses SET title = ?, category = ? WHERE id = ?',
    'Қазақ тілі: Әңгімені түсіну',
    'Тілдер',
    'private-course',
  );
  assert.equal((await listCourses('қазақ')).length, 1);
  assert.equal((await listCourses('ӘҢГІМЕНІ')).length, 1);
  assert.equal((await listCourses('қазақ', 'Математика')).length, 0);
});
