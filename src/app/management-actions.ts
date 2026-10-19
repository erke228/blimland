'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole, requireUser } from '@/lib/auth';
import { getCourse } from '@/lib/courses';
import { run, transaction } from '@/lib/db';
import {
  ManagementError,
  saveGroup,
  groupStatus,
  assignCourse,
  newInvite,
  revokeInvite,
  acceptInvitation,
  removeMember,
  updateUser,
  updateOwnProfile,
  revokeUserSessions,
  saveSettings,
  recordAudit,
} from '@/lib/management';

const v = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
function perform<T>(path: string, work: () => T) {
  try {
    return work();
  } catch (error) {
    if (error instanceof ManagementError)
      redirect(`${path}?error=${encodeURIComponent(error.code)}`);
    throw error;
  }
}
export async function saveGroupAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  const result = perform(id ? `/teacher/groups/${id}` : '/teacher/groups/new', () =>
    saveGroup(
      user.id,
      {
        name: v(form, 'name'),
        department: v(form, 'department'),
        academic_year: v(form, 'academicYear'),
        semester: v(form, 'semester'),
        description: v(form, 'description'),
      },
      id || undefined,
    ),
  );
  revalidatePath('/teacher/groups');
  redirect(`/teacher/groups/${result}?success=saved`);
}
export async function groupStatusAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  perform(`/teacher/groups/${id}`, () => groupStatus(user.id, id, v(form, 'status')));
  revalidatePath('/teacher/groups');
  redirect(`/teacher/groups/${id}?success=saved`);
}
export async function assignCourseAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  perform(`/teacher/groups/${id}`, () =>
    assignCourse(user.id, id, v(form, 'courseId'), form.get('remove') === 'yes'),
  );
  revalidatePath('/dashboard');
  redirect(`/teacher/groups/${id}?success=saved`);
}
export async function createInviteAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  const token = perform(`/teacher/groups/${id}`, () =>
    newInvite(user.id, id, Number(v(form, 'days')), Number(v(form, 'maxUses'))),
  );
  (await cookies()).set(`group_invite_${id}`, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: `/teacher/groups/${id}`,
    maxAge: 600,
  });
  redirect(`/teacher/groups/${id}?success=invitecreated`);
}
export async function revokeInviteAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  perform(`/teacher/groups/${id}`, () => revokeInvite(user.id, id, v(form, 'inviteId')));
  redirect(`/teacher/groups/${id}?success=revoked`);
}
export async function acceptInviteAction(form: FormData) {
  const user = await requireUser();
  const token = v(form, 'token');
  perform(`/join/${/^[a-f0-9]{48}$/.test(token) ? token : 'invalid'}`, () =>
    acceptInvitation(user.id, token),
  );
  revalidatePath('/dashboard');
  revalidatePath('/profile');
  redirect('/profile?success=joined#study-groups');
}
export async function removeMemberAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  const path = `/teacher/groups/${id}`;
  perform(path, () => removeMember(user.id, id, v(form, 'userId')));
  revalidatePath('/profile');
  redirect(`${path}?success=removed`);
}
export async function updateUserAction(form: FormData) {
  const user = await requireRole('admin');
  const id = v(form, 'userId');
  perform(`/admin/users/${id}`, () =>
    updateUser(user.id, id, {
      name: v(form, 'name'),
      email: v(form, 'email'),
      role: v(form, 'role'),
      status: v(form, 'status'),
      department: v(form, 'department'),
      academic_title: v(form, 'academicTitle'),
    }),
  );
  revalidatePath('/', 'layout');
  redirect(`/admin/users/${id}?success=saved`);
}
export async function revokeSessionsAction(form: FormData) {
  const user = await requireRole('admin');
  const id = v(form, 'userId');
  perform(`/admin/users/${id}`, () => revokeUserSessions(user.id, id));
  redirect(`/admin/users/${id}?success=sessionsrevoked`);
}
export async function saveProfileAction(form: FormData) {
  const user = await requireUser();
  perform('/profile', () =>
    updateOwnProfile(user.id, {
      name: v(form, 'name'),
      department: v(form, 'department'),
      academic_title: v(form, 'academicTitle'),
    }),
  );
  revalidatePath('/', 'layout');
  redirect('/profile?success=saved');
}
export async function saveSettingsAction(form: FormData) {
  const user = await requireRole('admin');
  perform('/admin/settings', () =>
    saveSettings(user.id, {
      site_name: v(form, 'siteName'),
      institution_name: v(form, 'institutionName'),
      announcement: v(form, 'announcement'),
      registration_open: form.get('registrationOpen') === 'on' ? 1 : 0,
    }),
  );
  revalidatePath('/', 'layout');
  redirect('/admin/settings?success=saved');
}
export async function adminCourseStatusAction(form: FormData) {
  const user = await requireRole('admin');
  const id = v(form, 'courseId');
  const status = v(form, 'status');
  const course = getCourse(id);
  if (!course || !['draft', 'archived'].includes(status)) redirect('/admin/courses?error=invalid');
  transaction(() => {
    run('UPDATE courses SET status = ?, updated_at = ? WHERE id = ?', status, Date.now(), id);
    recordAudit(user.id, `course.${status}`, id);
  });
  revalidatePath('/courses');
  redirect('/admin/courses?success=saved');
}
