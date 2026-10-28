'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole, requireUser } from '@/lib/auth';
import { getCourse } from '@/lib/courses';
import { saveExtendedProfile } from '@/lib/profile';
import { courseInTrash } from '@/lib/course-lifecycle';
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
async function perform<T>(path: string, work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ManagementError)
      redirect(`${path}?error=${encodeURIComponent(error.code)}`);
    throw error;
  }
}
export async function saveGroupAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  const result = await perform(
    id ? `/teacher/groups/${id}` : '/teacher/groups/new',
    async () =>
      await saveGroup(
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
  await perform(
    `/teacher/groups/${id}`,
    async () => await groupStatus(user.id, id, v(form, 'status')),
  );
  revalidatePath('/teacher/groups');
  redirect(`/teacher/groups/${id}?success=saved`);
}
export async function assignCourseAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  await perform(
    `/teacher/groups/${id}`,
    async () => await assignCourse(user.id, id, v(form, 'courseId'), form.get('remove') === 'yes'),
  );
  revalidatePath('/dashboard');
  redirect(`/teacher/groups/${id}?success=saved`);
}
export async function createInviteAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  const token = await perform(
    `/teacher/groups/${id}`,
    async () => await newInvite(user.id, id, Number(v(form, 'days')), Number(v(form, 'maxUses'))),
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
  await perform(
    `/teacher/groups/${id}`,
    async () => await revokeInvite(user.id, id, v(form, 'inviteId')),
  );
  redirect(`/teacher/groups/${id}?success=revoked`);
}
export async function acceptInviteAction(form: FormData) {
  const user = await requireUser();
  const token = v(form, 'token');
  await perform(
    `/join/${/^[a-f0-9]{48}$/.test(token) ? token : 'invalid'}`,
    async () => await acceptInvitation(user.id, token),
  );
  revalidatePath('/dashboard');
  revalidatePath('/profile');
  redirect('/profile?success=joined#study-groups');
}
export async function removeMemberAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const id = v(form, 'groupId');
  const path = `/teacher/groups/${id}`;
  await perform(path, async () => await removeMember(user.id, id, v(form, 'userId')));
  revalidatePath('/profile');
  redirect(`${path}?success=removed`);
}
export async function updateUserAction(form: FormData) {
  const user = await requireRole('admin');
  const id = v(form, 'userId');
  await perform(
    `/admin/users/${id}`,
    async () =>
      await updateUser(user.id, id, {
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
  await perform(`/admin/users/${id}`, async () => await revokeUserSessions(user.id, id));
  redirect(`/admin/users/${id}?success=sessionsrevoked`);
}
export async function saveProfileAction(form: FormData) {
  const user = await requireUser();
  await perform(
    '/profile',
    async () =>
      await saveExtendedProfile(user.id, {
        name: v(form, 'name'),
        department: v(form, 'department'),
        academic_title: v(form, 'academicTitle'),
        university: v(form, 'university'),
        bio: v(form, 'about'),
        phone: v(form, 'phone'),
        city: v(form, 'city'),
        website: v(form, 'website'),
      }),
  );
  revalidatePath('/', 'layout');
  redirect('/profile?success=saved');
}
export async function saveSettingsAction(form: FormData) {
  const user = await requireRole('admin');
  await perform(
    '/admin/settings',
    async () =>
      await saveSettings(user.id, {
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
  const course = await getCourse(id);
  if (!course || !['draft', 'archived'].includes(status)) redirect('/admin/courses?error=invalid');
  if (await courseInTrash(id)) redirect('/admin/courses?error=coursetrashed');
  await transaction(async () => {
    await run('UPDATE courses SET status = ?, updated_at = ? WHERE id = ?', status, Date.now(), id);
    await recordAudit(user.id, `course.${status}`, id);
  });
  revalidatePath('/courses');
  redirect('/admin/courses?success=saved');
}
