import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { all, one, run, transaction } from './db';
import { tokenHash } from './security';
export class ManagementError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export type Actor = {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  status: string;
};
export type Group = {
  id: string;
  owner_id: string;
  name: string;
  department: string;
  academic_year: string;
  semester: number;
  description: string;
  status: string;
  teacher: string;
  member_count: number;
  course_count: number;
};
export type Settings = {
  site_name: string;
  institution_name: string;
  announcement: string;
  registration_open: number;
};
export async function settings(): Promise<Settings> {
  return (
    (await one<Settings>(
      'SELECT site_name, institution_name, announcement, registration_open FROM platform_settings WHERE id = 1',
    )) || {
      site_name: 'BilimHub',
      institution_name: 'Университет',
      announcement: '',
      registration_open: 1,
    }
  );
}
export async function actor(id: string, roles: Actor['role'][] = ['student', 'teacher', 'admin']) {
  const user = await one<Actor>('SELECT id, name, email, role, status FROM users WHERE id = ?', id);
  if (!user || user.status !== 'active' || !roles.includes(user.role))
    throw new ManagementError('forbidden');
  return user;
}
export async function recordAudit(actorId: string, action: string, target: string) {
  await run(
    'INSERT INTO audit_log VALUES (?, ?, ?, ?, ?)',
    randomUUID(),
    actorId,
    action,
    target,
    Date.now(),
  );
}
export function safeReturnPath(input: string | undefined) {
  if (!input || !/^\/(?!\/)/.test(input) || /[\\\r\n]/.test(input) || !input.startsWith('/join/'))
    return '';
  return /^\/join\/[a-f0-9]{48}$/.test(input) ? input : '';
}
const groupSelect = `SELECT g.*, u.name teacher,
  (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) member_count,
  (SELECT COUNT(*) FROM group_courses c WHERE c.group_id = g.id) course_count
  FROM academic_groups g JOIN users u ON u.id = g.owner_id`;
export async function listGroups(actorId: string) {
  const user = await actor(actorId, ['teacher', 'admin']);
  return user.role === 'admin'
    ? await all<Group>(`${groupSelect} ORDER BY g.created_at DESC`)
    : await all<Group>(`${groupSelect} WHERE g.owner_id = ? ORDER BY g.created_at DESC`, user.id);
}
export async function managedGroup(actorId: string, groupId: string) {
  const user = await actor(actorId, ['teacher', 'admin']);
  const group = await one<Group>(`${groupSelect} WHERE g.id = ?`, groupId);
  if (!group || (user.role !== 'admin' && group.owner_id !== user.id))
    throw new ManagementError('forbidden');
  return group;
}
export const groupInput = z.object({
  name: z.string().trim().min(2).max(100),
  department: z.string().trim().max(180),
  academic_year: z
    .string()
    .regex(/^20\d{2}–20\d{2}$/)
    .refine((v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1),
  semester: z.coerce.number().int().min(1).max(3),
  description: z.string().trim().max(2000),
});
export async function saveGroup(actorId: string, input: unknown, groupId?: string) {
  const user = await actor(actorId, ['teacher', 'admin']);
  const parsed = groupInput.safeParse(input);
  if (!parsed.success) throw new ManagementError('groupform');
  const data = parsed.data;
  const id = groupId || randomUUID();
  await transaction(async () => {
    if (groupId) {
      await managedGroup(actorId, groupId);
      await run(
        'UPDATE academic_groups SET name = ?, department = ?, academic_year = ?, semester = ?, description = ? WHERE id = ?',
        data.name,
        data.department,
        data.academic_year,
        data.semester,
        data.description,
        id,
      );
    } else
      await run(
        'INSERT INTO academic_groups VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        user.id,
        data.name,
        data.department,
        data.academic_year,
        data.semester,
        data.description,
        'active',
        Date.now(),
      );
    await recordAudit(user.id, groupId ? 'group.updated' : 'group.created', id);
  });
  return id;
}
export async function groupStatus(actorId: string, groupId: string, status: string) {
  await managedGroup(actorId, groupId);
  if (!['active', 'archived'].includes(status)) throw new ManagementError('invalid');
  await transaction(async () => {
    await run('UPDATE academic_groups SET status = ? WHERE id = ?', status, groupId);
    if (status === 'archived')
      await run(
        'UPDATE group_invites SET revoked_at = ? WHERE group_id = ? AND revoked_at IS NULL',
        Date.now(),
        groupId,
      );
    await recordAudit(actorId, `group.${status}`, groupId);
  });
}
export async function assignCourse(
  actorId: string,
  groupId: string,
  courseId: string,
  remove = false,
) {
  const group = await managedGroup(actorId, groupId);
  const user = await actor(actorId);
  if (group.status !== 'active') throw new ManagementError('archivedgroup');
  await transaction(async () => {
    if (remove)
      await run(
        'DELETE FROM group_courses WHERE group_id = ? AND course_id = ?',
        groupId,
        courseId,
      );
    else {
      const course = await one<{
        owner_id: string;
        status: string;
      }>('SELECT owner_id, status FROM courses WHERE id = ?', courseId);
      if (
        !course ||
        course.status !== 'published' ||
        (user.role !== 'admin' && course.owner_id !== actorId)
      )
        throw new ManagementError('forbidden');
      await run(
        'INSERT OR IGNORE INTO group_courses VALUES (?, ?, ?)',
        groupId,
        courseId,
        Date.now(),
      );
      await run(
        `INSERT OR IGNORE INTO enrollments (user_id, course_id, created_at) SELECT m.user_id, ?, ? FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? AND u.status = 'active'`,
        courseId,
        Date.now(),
        groupId,
      );
    }
    await recordAudit(actorId, remove ? 'group.course_removed' : 'group.course_assigned', groupId);
  });
}
export async function newInvite(actorId: string, groupId: string, days: number, maxUses: number) {
  const group = await managedGroup(actorId, groupId);
  if (group.status !== 'active') throw new ManagementError('archivedgroup');
  if (![1, 7, 30].includes(days) || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 5000)
    throw new ManagementError('invalid');
  const token = randomBytes(24).toString('hex');
  await transaction(async () => {
    await run(
      'INSERT INTO group_invites VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      groupId,
      tokenHash(token),
      Date.now() + days * 86400000,
      maxUses,
      0,
      Date.now(),
      null,
    );
    await recordAudit(actorId, 'group.invite_created', groupId);
  });
  return token;
}
export async function revokeInvite(actorId: string, groupId: string, inviteId: string) {
  await managedGroup(actorId, groupId);
  await transaction(async () => {
    await run(
      'UPDATE group_invites SET revoked_at = ? WHERE id = ? AND group_id = ?',
      Date.now(),
      inviteId,
      groupId,
    );
    await recordAudit(actorId, 'group.invite_revoked', groupId);
  });
}
export async function invitation(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return undefined;
  return await one<{
    id: string;
    group_id: string;
    name: string;
    teacher: string;
    academic_year: string;
    department: string;
    semester: number;
  }>(
    `SELECT i.id, i.group_id, g.name, g.academic_year, g.department, g.semester, u.name teacher
    FROM group_invites i JOIN academic_groups g ON g.id = i.group_id JOIN users u ON u.id = g.owner_id
    WHERE i.token_hash = ? AND i.revoked_at IS NULL AND i.expires_at > ? AND i.uses < i.max_uses AND g.status = 'active' AND u.status = 'active' AND u.role IN ('teacher','admin')`,
    tokenHash(token),
    Date.now(),
  );
}
export async function acceptInvitation(actorId: string, token: string) {
  const user = await actor(actorId);
  if (user.role !== 'student') throw new ManagementError('studentonly');
  return await transaction(async () => {
    // Check existing membership before capacity so a repeated click never consumes a use.
    const raw = /^[a-f0-9]{48}$/.test(token)
      ? await one<{
          group_id: string;
        }>('SELECT group_id FROM group_invites WHERE token_hash = ?', tokenHash(token))
      : undefined;
    if (
      raw &&
      (await one(
        'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
        raw.group_id,
        user.id,
      ))
    )
      return raw.group_id;
    const invite = await invitation(token);
    if (!invite) throw new ManagementError('invite');
    await run('INSERT INTO group_members VALUES (?, ?, ?)', invite.group_id, user.id, Date.now());
    await run('UPDATE group_invites SET uses = uses + 1 WHERE id = ?', invite.id);
    await run(
      `INSERT OR IGNORE INTO enrollments (user_id, course_id, created_at) SELECT ?, c.id, ? FROM group_courses gc JOIN courses c ON c.id = gc.course_id WHERE gc.group_id = ? AND c.status = 'published'`,
      user.id,
      Date.now(),
      invite.group_id,
    );
    await recordAudit(user.id, 'group.joined', invite.group_id);
    return invite.group_id;
  });
}
export async function removeMember(actorId: string, groupId: string, userId: string) {
  await managedGroup(actorId, groupId);
  await transaction(async () => {
    await run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId);
    await recordAudit(actorId, 'group.member_removed', groupId);
  });
}
export async function groupReport(actorId: string, groupId: string) {
  await managedGroup(actorId, groupId);
  return await all<{
    user_id: string;
    name: string;
    email: string;
    status: string;
    last_active_at: number;
    course_id: string | null;
    course_title: string | null;
    course_status: string | null;
    completed: number;
    total: number;
  }>(
    `SELECT u.id user_id, u.name, u.email, u.status, u.last_active_at, c.id course_id, c.title course_title, c.status course_status,
    (SELECT COUNT(*) FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN sections s ON s.id = l.section_id WHERE p.user_id = u.id AND s.course_id = c.id AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id) AND p.completed_at IS NOT NULL) completed,
    (SELECT COUNT(*) FROM lessons l JOIN sections s ON s.id = l.section_id WHERE s.course_id = c.id AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id)) total
    FROM group_members m JOIN users u ON u.id = m.user_id LEFT JOIN group_courses gc ON gc.group_id = m.group_id LEFT JOIN courses c ON c.id = gc.course_id WHERE m.group_id = ? ORDER BY u.name, c.title`,
    groupId,
  );
}
export async function updateUser(actorId: string, targetId: string, input: unknown) {
  await actor(actorId, ['admin']);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      role: z.enum(['student', 'teacher', 'admin']),
      status: z.enum(['active', 'blocked']),
      department: z.string().trim().max(180),
      academic_title: z.string().trim().max(120),
    })
    .safeParse(input);
  if (!parsed.success) throw new ManagementError('userform');
  const data = parsed.data;
  await transaction(async () => {
    const target = await one<Actor>(
      'SELECT id, role, status, email FROM users WHERE id = ?',
      targetId,
    );
    if (!target) throw new ManagementError('invalid');
    if (target.role === 'admin' && (data.role !== 'admin' || data.status !== 'active'))
      throw new ManagementError('ownerprotected');
    if (target.role !== 'admin' && data.role === 'admin')
      throw new ManagementError('ownerprotected');
    if (await one('SELECT id FROM users WHERE email = ? AND id != ?', data.email, targetId))
      throw new ManagementError('email');
    if (
      target.role === 'teacher' &&
      data.role === 'student' &&
      ((await one(
        "SELECT id FROM courses WHERE owner_id = ? AND status != 'archived' LIMIT 1",
        targetId,
      )) ||
        (await one(
          "SELECT id FROM academic_groups WHERE owner_id = ? AND status = 'active' LIMIT 1",
          targetId,
        )))
    )
      throw new ManagementError('ownership');
    await run(
      'UPDATE users SET name = ?, email = ?, role = ?, status = ?, department = ?, academic_title = ?, updated_at = ? WHERE id = ?',
      data.name,
      data.email,
      data.role,
      data.status,
      data.department,
      data.academic_title,
      Date.now(),
      targetId,
    );
    if (target.role !== data.role || target.status !== data.status || target.email !== data.email)
      await run('DELETE FROM sessions WHERE user_id = ?', targetId);
    if (data.role === 'teacher')
      await run(
        "UPDATE teacher_applications SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE user_id = ?",
        actorId,
        Date.now(),
        targetId,
      );
    if (target.role === 'teacher' && data.role === 'student')
      await run(
        "UPDATE teacher_applications SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE user_id = ?",
        'Оқытушы мәртебесі әкімші тарапынан өзгертілді.',
        actorId,
        Date.now(),
        targetId,
      );
    await recordAudit(actorId, 'user.updated', targetId);
  });
}
export async function updateOwnProfile(actorId: string, input: unknown) {
  const user = await actor(actorId);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      department: z.string().trim().max(180),
      academic_title: z.string().trim().max(120),
    })
    .safeParse(input);
  if (!parsed.success) throw new ManagementError('userform');
  const data = parsed.data;
  await run(
    'UPDATE users SET name = ?, department = ?, academic_title = ?, updated_at = ? WHERE id = ?',
    data.name,
    data.department,
    data.academic_title,
    Date.now(),
    user.id,
  );
  await recordAudit(actorId, 'profile.updated', actorId);
}
export async function revokeUserSessions(actorId: string, targetId: string) {
  await actor(actorId, ['admin']);
  if (!(await one('SELECT id FROM users WHERE id = ?', targetId)))
    throw new ManagementError('invalid');
  await transaction(async () => {
    await run('DELETE FROM sessions WHERE user_id = ?', targetId);
    await recordAudit(actorId, 'user.sessions_revoked', targetId);
  });
}
export async function saveSettings(actorId: string, input: unknown) {
  await actor(actorId, ['admin']);
  const parsed = z
    .object({
      site_name: z.string().trim().min(2).max(40),
      institution_name: z.string().trim().min(2).max(150),
      announcement: z.string().trim().max(1000),
      registration_open: z.number().int().min(0).max(1),
    })
    .safeParse(input);
  if (!parsed.success) throw new ManagementError('invalid');
  const d = parsed.data;
  await transaction(async () => {
    await run(
      `INSERT INTO platform_settings VALUES (1, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET site_name = excluded.site_name, institution_name = excluded.institution_name, announcement = excluded.announcement, registration_open = excluded.registration_open, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      d.site_name,
      d.institution_name,
      d.announcement,
      d.registration_open,
      Date.now(),
      actorId,
    );
    await recordAudit(actorId, 'site.settings_updated', 'platform');
  });
}
