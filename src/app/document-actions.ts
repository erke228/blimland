'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { lessonAccess, setMaterialRemoved } from '@/lib/materials';
import { ManagementError } from '@/lib/management';
export async function materialStatusAction(form: FormData) {
  const user = await requireRole('teacher', 'admin');
  let lessonId: string;
  try {
    lessonId = await setMaterialRemoved(
      user.id,
      String(form.get('materialId') || ''),
      form.get('restore') !== 'yes',
    );
  } catch (error) {
    if (error instanceof ManagementError) redirect(`/teacher?error=${error.code}`);
    throw error;
  }
  const course = (await lessonAccess(lessonId))!;
  revalidatePath(`/learn/${lessonId}`);
  redirect(
    `/teacher/courses/${course.course_id}?tab=materials&lesson=${lessonId}&success=saved#materials`,
  );
}
