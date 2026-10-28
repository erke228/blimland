'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { changeCourseVisibility, purgeCourse, flushFileDeletions } from '@/lib/course-lifecycle';
import { ManagementError } from '@/lib/management';
function returnPath(form: FormData, admin: boolean) {
  const input = String(form.get('returnTo') || '');
  return admin && input.startsWith('/admin/courses') ? '/admin/courses' : '/teacher';
}
export async function courseLifecycleAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  const path = returnPath(form, user.role === 'admin');
  const id = String(form.get('courseId') || '');
  const operation = String(form.get('operation') || '');
  if (!['hide', 'trash', 'restore', 'purge'].includes(operation)) redirect(`${path}?error=invalid`);
  let pending = 0;
  try {
    if (operation === 'purge')
      pending = await purgeCourse(
        user.id,
        id,
        String(form.get('confirmTitle') || ''),
        form.get('confirm') === 'on',
      );
    else await changeCourseVisibility(user.id, id, operation as 'hide' | 'trash' | 'restore');
  } catch (error) {
    if (error instanceof ManagementError) redirect(`${path}?error=${error.code}`);
    throw error;
  }
  revalidatePath('/', 'layout');
  const view = operation === 'trash' ? '&view=trash' : operation === 'hide' ? '&view=hidden' : '';
  redirect(
    `${path}?success=${pending ? 'cleanupqueued' : operation === 'purge' ? 'coursepurged' : 'saved'}${view}`,
  );
}
export async function retryCourseCleanup() {
  await requireRole('admin');
  const pending = await flushFileDeletions();
  redirect(`/admin/courses?view=trash&success=${pending ? 'cleanupqueued' : 'saved'}`);
}
