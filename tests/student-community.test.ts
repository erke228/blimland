import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrate, run } from '../src/lib/db';
import { saveGroup, removeMember, ManagementError, listGroups } from '../src/lib/management';
import { basicProfile, studentGroups } from '../src/lib/student-community';

process.env.DATABASE_PATH = ':memory:';
migrate();
function user(role = 'student', status = 'active') {
  const id = randomUUID();
  run(
    'INSERT INTO users (id, name, email, password_hash, role, status, department, academic_title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    'Әсел Қанатқызы',
    `${id}@private.invalid`,
    'SECRET-HASH',
    role,
    status,
    'PRIVATE-DEPARTMENT',
    'PRIVATE-TITLE',
    Date.now(),
  );
  return id;
}
function fixture() {
  const teacher = user('teacher');
  const student = user();
  const peer = user();
  const outsider = user();
  const group = saveGroup(teacher, {
    name: 'ИС-26',
    department: 'GROUP-PRIVATE-DEPARTMENT',
    description: 'PRIVATE-DESCRIPTION',
    academic_year: '2026–2027',
    semester: 1,
  });
  for (const id of [student, peer])
    run('INSERT INTO group_members VALUES (?, ?, ?)', group, id, Date.now());
  return { teacher, student, peer, outsider, group };
}
test('Student group DTO includes only own groups and explicitly minimal active profiles', () => {
  const f = fixture();
  const blocked = user('student', 'blocked');
  run('INSERT INTO group_members VALUES (?, ?, ?)', f.group, blocked, Date.now());
  const result = studentGroups(f.student);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, f.group);
  assert.equal(result[0].teacher?.id, f.teacher);
  assert.deepEqual(
    result[0].classmates.map((p) => p.id),
    [f.peer],
  );
  assert.deepEqual(Object.keys(result[0].classmates[0]).sort(), ['id', 'name', 'role']);
  assert.deepEqual(Object.keys(result[0].teacher!).sort(), ['id', 'name', 'role']);
  assert(!JSON.stringify(result).includes('PRIVATE'));
  assert(!JSON.stringify(result).includes('@private.invalid'));
  assert.deepEqual(studentGroups(f.outsider), []);
  assert.throws(() => listGroups(f.student), ManagementError);
});
test('Minimal profile authorizes a shared group or its teacher, with no directory for outsiders', () => {
  const f = fixture();
  assert.equal(basicProfile(f.student, f.peer)?.id, f.peer);
  assert.equal(basicProfile(f.student, f.teacher)?.id, f.teacher);
  assert.equal(basicProfile(f.teacher, f.student)?.id, f.student);
  assert.equal(basicProfile(f.student, f.outsider), undefined);
  assert.equal(basicProfile(f.outsider, f.student), undefined);
  assert.equal(basicProfile(user('teacher'), f.student), undefined);
  assert.equal(basicProfile(f.student, 'missing'), undefined);
  assert.deepEqual(Object.keys(basicProfile(f.student, f.peer)!).sort(), ['id', 'name', 'role']);
});
test('Blocked accounts and removal immediately revoke peer profile access', () => {
  const f = fixture();
  run("UPDATE users SET status = 'blocked' WHERE id = ?", f.peer);
  assert.equal(basicProfile(f.student, f.peer), undefined);
  assert.throws(() => basicProfile(f.peer, f.student), ManagementError);
  run("UPDATE users SET status = 'active' WHERE id = ?", f.peer);
  removeMember(f.teacher, f.group, f.peer);
  assert.equal(basicProfile(f.student, f.peer), undefined);
  assert.equal(basicProfile(f.peer, f.student), undefined);
  assert.equal(studentGroups(f.student)[0].classmates.length, 0);
});
test('Superadmin may inspect minimal profiles; student cannot call teacher or admin group DTOs', () => {
  const f = fixture();
  const admin = user('admin');
  assert.equal(basicProfile(admin, f.student)?.id, f.student);
  assert.throws(() => studentGroups(admin), ManagementError);
  assert.throws(() => studentGroups(f.teacher), ManagementError);
  assert.throws(() => studentGroups('missing'), ManagementError);
});
