'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser, SESSION_COOKIE } from '@/lib/auth';
import { changeOwnEmail, changeOwnPassword } from '@/lib/profile';
import { ManagementError } from '@/lib/management';
export async function credentialAction(form: FormData) {
  const user = await requireUser();
  const operation = String(form.get('operation') || '');
  try {
    if (operation === 'password')
      await changeOwnPassword(
        user.id,
        String(form.get('currentPassword') || ''),
        String(form.get('newPassword') || ''),
        String(form.get('confirmation') || ''),
      );
    else if (operation === 'email')
      await changeOwnEmail(
        user.id,
        String(form.get('currentPassword') || ''),
        String(form.get('email') || ''),
      );
    else throw new ManagementError('invalid');
  } catch (error) {
    if (error instanceof ManagementError) redirect(`/profile?tab=security&error=${error.code}`);
    throw error;
  }
  (await cookies()).delete(SESSION_COOKIE);
  revalidatePath('/', 'layout');
  redirect(`/login?success=${operation === 'email' ? 'emailchanged' : 'passwordchanged'}`);
}
