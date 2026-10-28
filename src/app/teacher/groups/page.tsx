import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { PageHeading, Notice } from '@/components/ui';
import { GroupList } from '@/components/group-list';
export default async function Groups({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const user = await requireRole('teacher', 'admin');
  return (
    <>
      <PageHeading
        eyebrow="ОҚЫТУШЫ КАБИНЕТІ"
        title="Оқу топтары"
        description="Әр топқа курстар тағайындаңыз, студенттерді шақырыңыз және оқу барысын бақылаңыз."
      >
        <Link className="button primary" href="/teacher/groups/new">
          Топ құру +
        </Link>
      </PageHeading>
      <Notice {...await searchParams} />
      <GroupList userId={user.id} />
    </>
  );
}
