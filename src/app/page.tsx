import { Catalog } from '@/components/catalog';
import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
export default async function Home() {
  const user = await currentUser();
  if (user)
    redirect(
      user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/dashboard',
    );
  return <Catalog />;
}
