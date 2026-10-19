import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrate, one, run } from '../src/lib/db';
import { issueSession, tokenHash } from '../src/lib/security';
import {
  actor,
  saveGroup,
  managedGroup,
  listGroups,
  assignCourse,
  newInvite,
  invitation,
  acceptInvitation,
  revokeInvite,
  groupStatus,
  removeMember,
  groupReport,
  updateUser,
  updateOwnProfile,
  revokeUserSessions,
  saveSettings,
  settings,
  safeReturnPath,
  ManagementError,
} from '../src/lib/management';

process.env.DATABASE_PATH = ':memory:';
migrate();
function user(role = 'student') {
  const id = randomUUID();
  run(
    'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    `${id}@test.invalid`,
    role === 'teacher' ? 'Үлгі оқытушы' : 'Үлгі студент',
    'unused-test-password',
    role,
    Date.now(),
  );
  return id;
}
const admin = user('admin');
const teacher = user('teacher');
const otherTeacher = user('teacher');
const student = user();
const otherStudent = user();
const input = {
  name: 'ИС-24-1',
  department: 'Ақпараттық жүйелер',
  academic_year: '2026–2027',
  semester: 1,
  description: 'Тексеру тобы',
};
function group() {
  return saveGroup(teacher, input);
}
function course(price = 0, owner = teacher) {
  const id = randomUUID();
  run(
    'INSERT INTO courses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    owner,
    'Университет дәрісі',
    'Курс сипаттамасы',
    'Басқа',
    'Бастапқы',
    price,
    'published',
    'teal',
    Date.now(),
    Date.now(),
  );
  return id;
}
function code(expected: string) {
  return (error: unknown) => error instanceof ManagementError && error.code === expected;
}

test('Only one super administrator can exist, including direct SQL writes', () => {
  assert.throws(() => user('admin'));
  assert.equal(one<{ n: number }>("SELECT COUNT(*) n FROM users WHERE role = 'admin'")!.n, 1);
});
test('Groups are isolated by teacher; students cannot manage any group', () => {
  const id = group();
  assert.equal(managedGroup(teacher, id).id, id);
  assert.equal(managedGroup(admin, id).id, id);
  assert.throws(() => managedGroup(otherTeacher, id), code('forbidden'));
  assert.throws(() => managedGroup(student, id), code('forbidden'));
  assert.throws(() => saveGroup(student, input), code('forbidden'));
  assert(!listGroups(otherTeacher).some((g) => g.id === id));
});
test('Academic year must be consecutive and group data is bounded', () => {
  assert.throws(
    () => saveGroup(teacher, { ...input, academic_year: '2026–2029' }),
    code('groupform'),
  );
  assert.throws(() => saveGroup(teacher, { ...input, name: '' }), code('groupform'));
});
test('Invite tokens are hashed; accepting grants only assigned free published courses', () => {
  const id = group();
  const free = course();
  const paid = course(1000);
  assignCourse(teacher, id, free);
  assert.throws(() => assignCourse(teacher, id, paid), code('payment'));
  const token = newInvite(teacher, id, 7, 10);
  const row = one<{ token_hash: string }>(
    'SELECT token_hash FROM group_invites WHERE group_id = ?',
    id,
  )!;
  assert.equal(row.token_hash, tokenHash(token));
  assert.notEqual(row.token_hash, token);
  acceptInvitation(student, token);
  assert(one('SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?', student, free));
  assert(
    !one('SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?', student, paid),
  );
});
test('Repeated acceptance is idempotent, while a full invite rejects a new student', () => {
  const id = group();
  const token = newInvite(teacher, id, 7, 1);
  acceptInvitation(student, token);
  acceptInvitation(student, token);
  assert.equal(
    one<{ uses: number }>('SELECT uses FROM group_invites WHERE token_hash = ?', tokenHash(token))!
      .uses,
    1,
  );
  assert.throws(() => acceptInvitation(otherStudent, token), code('invite'));
  assert.equal(
    one<{ n: number }>('SELECT COUNT(*) n FROM group_members WHERE group_id = ?', id)!.n,
    1,
  );
});
test('Expired, revoked, malformed and teacher-account invitations are rejected', () => {
  const id = group();
  const token = newInvite(teacher, id, 1, 10);
  assert.throws(() => acceptInvitation(teacher, token), code('studentonly'));
  run('UPDATE group_invites SET expires_at = 0 WHERE token_hash = ?', tokenHash(token));
  assert.equal(invitation(token), undefined);
  assert.throws(() => acceptInvitation(student, token), code('invite'));
  const next = newInvite(teacher, id, 7, 10);
  const invite = one<{ id: string }>(
    'SELECT id FROM group_invites WHERE token_hash = ?',
    tokenHash(next),
  )!;
  revokeInvite(teacher, id, invite.id);
  assert.equal(invitation(next), undefined);
  assert.throws(() => acceptInvitation(student, '../../admin'), code('invite'));
});
test('Archiving revokes invitations without deleting members or their learning history', () => {
  const id = group();
  const token = newInvite(teacher, id, 7, 10);
  acceptInvitation(student, token);
  groupStatus(teacher, id, 'archived');
  assert.equal(invitation(token), undefined);
  assert.throws(() => newInvite(teacher, id, 7, 10), code('archivedgroup'));
  assert(one('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', id, student));
  groupStatus(teacher, id, 'active');
  assert.equal(invitation(token), undefined);
});
test('Course assignment enrolls existing members and refuses another teacher’s course', () => {
  const id = group();
  acceptInvitation(student, newInvite(teacher, id, 7, 10));
  const own = course();
  const foreign = course(0, otherTeacher);
  assignCourse(teacher, id, own);
  assert(one('SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?', student, own));
  assert.throws(() => assignCourse(teacher, id, foreign), code('forbidden'));
  assignCourse(admin, id, foreign);
  assert(
    one('SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?', student, foreign),
  );
});
test('Leaving a group preserves enrollment; removing someone else as self is forbidden', () => {
  const id = group();
  const c = course();
  assignCourse(teacher, id, c);
  acceptInvitation(student, newInvite(teacher, id, 7, 10));
  assert.throws(() => removeMember(otherStudent, id, student, true), code('forbidden'));
  removeMember(student, id, student, true);
  assert(!one('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', id, student));
  assert(one('SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?', student, c));
});
test('Group report counts only assigned course lessons and is unavailable to other teachers', () => {
  const id = group();
  const c = course();
  assignCourse(teacher, id, c);
  acceptInvitation(student, newInvite(teacher, id, 7, 10));
  const section = randomUUID();
  const lesson = randomUUID();
  run('INSERT INTO sections VALUES (?, ?, ?, ?)', section, c, 'Бөлім', 0);
  run(
    'INSERT INTO lessons VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    lesson,
    section,
    'Дәріс',
    'Мәтін',
    '',
    10,
    0,
    0,
  );
  run(
    'INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)',
    student,
    lesson,
    Date.now(),
  );
  const report = groupReport(teacher, id);
  assert.equal(report[0].completed, 1);
  assert.equal(report[0].total, 1);
  assert.throws(() => groupReport(otherTeacher, id), code('forbidden'));
  assert.throws(() => groupReport(student, id), code('forbidden'));
});
test('Blocking a user revokes sessions and prevents all service operations', () => {
  const id = user();
  issueSession(id);
  const target = one<{ email: string }>('SELECT email FROM users WHERE id = ?', id)!;
  updateUser(admin, id, {
    name: 'Бұғатталған студент',
    email: target.email,
    role: 'student',
    status: 'blocked',
    department: '',
    academic_title: '',
  });
  assert.equal(one<{ n: number }>('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', id)!.n, 0);
  assert.throws(() => actor(id), code('forbidden'));
});
test('Super administrator cannot be demoted or blocked; ordinary users cannot edit roles', () => {
  const email = one<{ email: string }>('SELECT email FROM users WHERE id = ?', admin)!.email;
  const data = {
    name: 'Бас әкімші',
    email,
    role: 'admin',
    status: 'active',
    department: '',
    academic_title: '',
  };
  assert.throws(
    () => updateUser(admin, admin, { ...data, role: 'student' }),
    code('ownerprotected'),
  );
  assert.throws(
    () => updateUser(admin, admin, { ...data, status: 'blocked' }),
    code('ownerprotected'),
  );
  assert.throws(() => updateUser(student, admin, data), code('forbidden'));
  assert.throws(() => updateUser(admin, student, data), code('ownerprotected'));
});
test('Profile input cannot elevate a student or change their email', () => {
  const email = one<{ email: string }>('SELECT email FROM users WHERE id = ?', student)!.email;
  updateOwnProfile(student, {
    name: 'Өзгерген студент',
    department: 'Қазақ тілі',
    academic_title: 'Студент',
    role: 'admin',
    email: 'evil@example.invalid',
  });
  const saved = one<{ role: string; email: string }>(
    'SELECT role, email FROM users WHERE id = ?',
    student,
  )!;
  assert.equal(saved.role, 'student');
  assert.equal(saved.email, email);
});
test('Only owner can change site settings or revoke another user’s sessions', () => {
  const input = {
    site_name: 'Тексеру университеті',
    institution_name: 'Университет',
    announcement: 'Ғылым апталығы',
    registration_open: 0,
  };
  assert.throws(() => saveSettings(teacher, input), code('forbidden'));
  saveSettings(admin, input);
  assert.equal(settings().registration_open, 0);
  assert.equal(settings().announcement, input.announcement);
  issueSession(student);
  assert.throws(() => revokeUserSessions(teacher, student), code('forbidden'));
  revokeUserSessions(admin, student);
  assert.equal(
    one<{ n: number }>('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', student)!.n,
    0,
  );
});
test('Login return paths allow only local invitation URLs', () => {
  const path = `/join/${'a'.repeat(48)}`;
  assert.equal(safeReturnPath(path), path);
  for (const input of [
    '//evil.example',
    'https://evil.example',
    '/\\evil.example',
    '/admin',
    '/join/a?next=https://evil.example',
  ])
    assert.equal(safeReturnPath(input), '');
});
test('Demoting an inactive teacher also resets their old approved application', () => {
  const id = user('teacher');
  const email = one<{ email: string }>('SELECT email FROM users WHERE id = ?', id)!.email;
  run(
    'INSERT INTO teacher_applications (id, user_id, bio, status, created_at) VALUES (?, ?, ?, ?, ?)',
    randomUUID(),
    id,
    'Old approved application',
    'approved',
    Date.now(),
  );
  updateUser(admin, id, {
    name: 'Студент',
    email,
    role: 'student',
    status: 'active',
    department: '',
    academic_title: '',
  });
  assert.equal(
    one<{ status: string }>('SELECT status FROM teacher_applications WHERE user_id = ?', id)!
      .status,
    'rejected',
  );
});
