import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
export default async function Groups() {
  const user = await requireUser();
  if (user.role === 'admin') redirect('/admin/groups');
  if (user.role === 'teacher') redirect('/teacher/groups');
  redirect('/profile#study-groups');
}
