import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { GroupList } from '@/components/group-list';
import { PageHeading } from '@/components/ui';
import { AdminTabs } from '@/components/admin-tabs';
export default async function AdminGroups() {
  const user = await requireRole('admin');
  return (
    <>
      <PageHeading
        eyebrow="БАС ӘКІМШІ"
        title="Барлық оқу топтары"
        description="Оқытушылар, топ құрамы және пәндер бойынша оқу барысы."
      >
        <Link href="/teacher/groups/new" className="button primary">
          Топ құру +
        </Link>
      </PageHeading>
      <AdminTabs active="groups" />
      <GroupList userId={user.id} />
    </>
  );
}
