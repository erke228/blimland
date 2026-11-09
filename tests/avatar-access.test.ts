import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrate, run } from '../src/lib/db';
import { saveGroup, removeMember } from '../src/lib/management';
import { canReadAvatar } from '../src/lib/avatar-access';
process.env.DATABASE_DRIVER = 'sqlite';
process.env.DATABASE_PATH = ':memory:';
await migrate();
async function user(role = 'student') {
  const id = randomUUID();
  await run(
    'INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)',
    id,
    `${id}@avatar.invalid`,
    'Fixture',
    'unused',
    role,
    Date.now(),
  );
  return id;
}
test('private student photos require own/admin or current shared-group access', async () => {
  const teacher = await user('teacher'),
    student = await user(),
    peer = await user(),
    outsider = await user(),
    admin = await user('admin');
  const group = await saveGroup(teacher, {
    name: 'Avatar fixture',
    department: 'Private',
    description: 'Private',
    academic_year: '2026–2027',
    semester: 1,
  });
  for (const id of [student, peer])
    await run('INSERT INTO group_members VALUES(?,?,?)', group, id, Date.now());
  assert.equal(await canReadAvatar(student), false);
  assert.equal(await canReadAvatar(student, outsider), false);
  assert.equal(await canReadAvatar(student, student), true);
  assert.equal(await canReadAvatar(student, admin), true);
  assert.equal(await canReadAvatar(student, peer), true);
  assert.equal(await canReadAvatar(student, teacher), true);
  assert.equal(await canReadAvatar(teacher, student), true);
  await removeMember(teacher, group, peer);
  assert.equal(await canReadAvatar(student, peer), false);
  await run("UPDATE users SET status='blocked' WHERE id=?", student);
  assert.equal(await canReadAvatar(student, admin), false);
  assert.equal(await canReadAvatar(peer, student), false);
  assert.equal(await canReadAvatar('../private', admin), false);
});
test('only active published authors have public identity photos; hiding revokes public access', async () => {
  const teacher = await user('teacher'),
    id = randomUUID(),
    student = await user();
  await run(
    'INSERT INTO courses(id,owner_id,title,description,category,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    id,
    teacher,
    'Photo fixture',
    'Fixture',
    'STEM',
    'draft',
    Date.now(),
    Date.now(),
  );
  assert.equal(await canReadAvatar(teacher), false);
  await run("UPDATE courses SET status='published' WHERE id=?", id);
  assert.equal(await canReadAvatar(teacher), true);
  await run('UPDATE courses SET owner_id=? WHERE id=?', student, id);
  assert.equal(await canReadAvatar(student), false);
  await run('UPDATE courses SET owner_id=? WHERE id=?', teacher, id);
  await run("UPDATE users SET status='blocked' WHERE id=?", teacher);
  assert.equal(await canReadAvatar(teacher), false);
  await run("UPDATE users SET status='active' WHERE id=?", teacher);
  await run("UPDATE courses SET status='archived' WHERE id=?", id);
  assert.equal(await canReadAvatar(teacher), false);
});
