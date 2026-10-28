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
await migrate();
async function user(role = 'student') {
  const id = randomUUID();
  await run(
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
const admin = await user('admin');
const teacher = await user('teacher');
const otherTeacher = await user('teacher');
const student = await user();
const otherStudent = await user();
const input = {
  name: 'ИС-24-1',
  department: 'Ақпараттық жүйелер',
  academic_year: '2026–2027',
  semester: 1,
  description: 'Тексеру тобы',
};
async function group() {
  return await saveGroup(teacher, input);
}
async function course(owner = teacher) {
  const id = randomUUID();
  await run(
    'INSERT INTO courses (id,owner_id,title,description,category,level,status,accent,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id,
    owner,
    'Университет дәрісі',
    'Курс сипаттамасы',
    'Басқа',
    'Бастапқы',
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
test('Only one super administrator can exist, including direct SQL writes', async () => {
  await assert.rejects(async () => await user('admin'));
  assert.equal(
    (await one<{
      n: number;
    }>("SELECT COUNT(*) n FROM users WHERE role = 'admin'"))!.n,
    1,
  );
});
test('Groups are isolated by teacher; students cannot manage any group', async () => {
  const id = await group();
  assert.equal((await managedGroup(teacher, id)).id, id);
  assert.equal((await managedGroup(admin, id)).id, id);
  await assert.rejects(async () => await managedGroup(otherTeacher, id), code('forbidden'));
  await assert.rejects(async () => await managedGroup(student, id), code('forbidden'));
  await assert.rejects(async () => await saveGroup(student, input), code('forbidden'));
  assert(!(await listGroups(otherTeacher)).some((g) => g.id === id));
});
test('Academic year must be consecutive and group data is bounded', async () => {
  await assert.rejects(
    async () => await saveGroup(teacher, { ...input, academic_year: '2026–2029' }),
    code('groupform'),
  );
  await assert.rejects(
    async () => await saveGroup(teacher, { ...input, name: '' }),
    code('groupform'),
  );
});
test('Invite tokens are hashed; accepting grants all assigned published courses but no drafts or unassigned courses', async () => {
  const id = await group();
  const first = await course();
  const second = await course();
  const unassigned = await course();
  const draft = await course();
  await run("UPDATE courses SET status='draft' WHERE id=?", draft);
  await assignCourse(teacher, id, first);
  await assignCourse(teacher, id, second);
  await assert.rejects(async () => await assignCourse(teacher, id, draft), code('forbidden'));
  const token = await newInvite(teacher, id, 7, 10);
  const row = (await one<{
    token_hash: string;
  }>('SELECT token_hash FROM group_invites WHERE group_id = ?', id))!;
  assert.equal(row.token_hash, tokenHash(token));
  assert.notEqual(row.token_hash, token);
  await acceptInvitation(student, token);
  assert(
    await one(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?',
      student,
      first,
    ),
  );
  assert(
    await one(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?',
      student,
      second,
    ),
  );
  assert(
    !(await one(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?',
      student,
      unassigned,
    )),
  );
});
test('Repeated acceptance is idempotent, while a full invite rejects a new student', async () => {
  const id = await group();
  const token = await newInvite(teacher, id, 7, 1);
  await acceptInvitation(student, token);
  await acceptInvitation(student, token);
  assert.equal(
    (await one<{
      uses: number;
    }>('SELECT uses FROM group_invites WHERE token_hash = ?', tokenHash(token)))!.uses,
    1,
  );
  await assert.rejects(async () => await acceptInvitation(otherStudent, token), code('invite'));
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM group_members WHERE group_id = ?', id))!.n,
    1,
  );
});
test('Expired, revoked, malformed and teacher-account invitations are rejected', async () => {
  const id = await group();
  const token = await newInvite(teacher, id, 1, 10);
  await assert.rejects(async () => await acceptInvitation(teacher, token), code('studentonly'));
  await run('UPDATE group_invites SET expires_at = 0 WHERE token_hash = ?', tokenHash(token));
  assert.equal(await invitation(token), undefined);
  await assert.rejects(async () => await acceptInvitation(student, token), code('invite'));
  const next = await newInvite(teacher, id, 7, 10);
  const invite = (await one<{
    id: string;
  }>('SELECT id FROM group_invites WHERE token_hash = ?', tokenHash(next)))!;
  await revokeInvite(teacher, id, invite.id);
  assert.equal(await invitation(next), undefined);
  await assert.rejects(async () => await acceptInvitation(student, '../../admin'), code('invite'));
});
test('Archiving revokes invitations without deleting members or their learning history', async () => {
  const id = await group();
  const token = await newInvite(teacher, id, 7, 10);
  await acceptInvitation(student, token);
  await groupStatus(teacher, id, 'archived');
  assert.equal(await invitation(token), undefined);
  await assert.rejects(async () => await newInvite(teacher, id, 7, 10), code('archivedgroup'));
  assert(
    await one('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', id, student),
  );
  await groupStatus(teacher, id, 'active');
  assert.equal(await invitation(token), undefined);
});
test('Course assignment enrolls existing members and refuses another teacher’s course', async () => {
  const id = await group();
  await acceptInvitation(student, await newInvite(teacher, id, 7, 10));
  const own = await course();
  const foreign = await course(otherTeacher);
  await assignCourse(teacher, id, own);
  assert(
    await one('SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?', student, own),
  );
  await assert.rejects(async () => await assignCourse(teacher, id, foreign), code('forbidden'));
  await assignCourse(admin, id, foreign);
  assert(
    await one(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?',
      student,
      foreign,
    ),
  );
});
test('Only group managers can remove members; removal preserves enrollment', async () => {
  const id = await group();
  const c = await course();
  await assignCourse(teacher, id, c);
  await acceptInvitation(student, await newInvite(teacher, id, 7, 10));
  await assert.rejects(
    async () => await removeMember(otherStudent, id, student),
    code('forbidden'),
  );
  await assert.rejects(async () => await removeMember(student, id, student), code('forbidden'));
  await assert.rejects(
    async () => await removeMember(otherTeacher, id, student),
    code('forbidden'),
  );
  await removeMember(teacher, id, student);
  assert(
    !(await one(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
      id,
      student,
    )),
  );
  assert(
    await one('SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?', student, c),
  );
});
test('Group report counts only assigned course lessons and is unavailable to other teachers', async () => {
  const id = await group();
  const c = await course();
  await assignCourse(teacher, id, c);
  await acceptInvitation(student, await newInvite(teacher, id, 7, 10));
  const section = randomUUID();
  const lesson = randomUUID();
  await run('INSERT INTO sections VALUES (?, ?, ?, ?)', section, c, 'Бөлім', 0);
  await run(
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
  await run(
    'INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)',
    student,
    lesson,
    Date.now(),
  );
  const report = await groupReport(teacher, id);
  assert.equal(report[0].completed, 1);
  assert.equal(report[0].total, 1);
  await assert.rejects(async () => await groupReport(otherTeacher, id), code('forbidden'));
  await assert.rejects(async () => await groupReport(student, id), code('forbidden'));
});
test('Blocking a user revokes sessions and prevents all service operations', async () => {
  const id = await user();
  await issueSession(id);
  const target = (await one<{
    email: string;
  }>('SELECT email FROM users WHERE id = ?', id))!;
  await updateUser(admin, id, {
    name: 'Бұғатталған студент',
    email: target.email,
    role: 'student',
    status: 'blocked',
    department: '',
    academic_title: '',
  });
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', id))!.n,
    0,
  );
  await assert.rejects(async () => await actor(id), code('forbidden'));
});
test('Super administrator cannot be demoted or blocked; ordinary users cannot edit roles', async () => {
  const email = (await one<{
    email: string;
  }>('SELECT email FROM users WHERE id = ?', admin))!.email;
  const data = {
    name: 'Бас әкімші',
    email,
    role: 'admin',
    status: 'active',
    department: '',
    academic_title: '',
  };
  await assert.rejects(
    async () => await updateUser(admin, admin, { ...data, role: 'student' }),
    code('ownerprotected'),
  );
  await assert.rejects(
    async () => await updateUser(admin, admin, { ...data, status: 'blocked' }),
    code('ownerprotected'),
  );
  await assert.rejects(async () => await updateUser(student, admin, data), code('forbidden'));
  await assert.rejects(async () => await updateUser(admin, student, data), code('ownerprotected'));
});
test('Profile input cannot elevate a student or change their email', async () => {
  const email = (await one<{
    email: string;
  }>('SELECT email FROM users WHERE id = ?', student))!.email;
  await updateOwnProfile(student, {
    name: 'Өзгерген студент',
    department: 'Қазақ тілі',
    academic_title: 'Студент',
    role: 'admin',
    email: 'evil@example.invalid',
  });
  const saved = (await one<{
    role: string;
    email: string;
  }>('SELECT role, email FROM users WHERE id = ?', student))!;
  assert.equal(saved.role, 'student');
  assert.equal(saved.email, email);
});
test('Only owner can change site settings or revoke another user’s sessions', async () => {
  const input = {
    site_name: 'Тексеру университеті',
    institution_name: 'Университет',
    announcement: 'Ғылым апталығы',
    registration_open: 0,
  };
  await assert.rejects(async () => await saveSettings(teacher, input), code('forbidden'));
  await saveSettings(admin, input);
  assert.equal((await settings()).registration_open, 0);
  assert.equal((await settings()).announcement, input.announcement);
  await issueSession(student);
  await assert.rejects(async () => await revokeUserSessions(teacher, student), code('forbidden'));
  await revokeUserSessions(admin, student);
  assert.equal(
    (await one<{
      n: number;
    }>('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', student))!.n,
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
test('Demoting an inactive teacher also resets their old approved application', async () => {
  const id = await user('teacher');
  const email = (await one<{
    email: string;
  }>('SELECT email FROM users WHERE id = ?', id))!.email;
  await run(
    'INSERT INTO teacher_applications (id, user_id, bio, status, created_at) VALUES (?, ?, ?, ?, ?)',
    randomUUID(),
    id,
    'Old approved application',
    'approved',
    Date.now(),
  );
  await updateUser(admin, id, {
    name: 'Студент',
    email,
    role: 'student',
    status: 'active',
    department: '',
    academic_title: '',
  });
  assert.equal(
    (await one<{
      status: string;
    }>('SELECT status FROM teacher_applications WHERE user_id = ?', id))!.status,
    'rejected',
  );
});
