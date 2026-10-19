import { requireRole } from '@/lib/auth';
import { PageHeading, Notice } from '@/components/ui';
import { GroupForm } from '@/components/group-form';
export default async function NewGroup({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole('teacher', 'admin');
  return (
    <>
      <PageHeading
        eyebrow="ОҚУ ТОПТАРЫ"
        title="Жаңа топ құру"
        description="Пәнге, академиялық топқа немесе жеке оқу ағынына арналған кеңістік."
      />
      <Notice {...await searchParams} />
      <div className="panel narrow-panel">
        <GroupForm />
      </div>
    </>
  );
}
