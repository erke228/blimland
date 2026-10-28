import { ManagementHub } from '@/components/management-hub';
import { requireRole } from '@/lib/auth';
import { PageHeading } from '@/components/ui';
import { one } from '@/lib/db';
export default async function Admin() {
  const admin = await requireRole('admin');
  const totals = (await one<{
    students: number;
    teachers: number;
    groups: number;
    courses: number;
  }>(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active') students, (SELECT COUNT(*) FROM users WHERE role = 'teacher' AND status = 'active') teachers, (SELECT COUNT(*) FROM academic_groups WHERE status = 'active') groups, (SELECT COUNT(*) FROM courses WHERE status = 'published') courses`,
  ))!;
  return (
    <>
      <PageHeading
        eyebrow="БАСҚАРУ"
        title="Басқару тақтасы"
        description={`${admin.name} · Университеттің оқу үдерісін бір жерден басқарыңыз.`}
      />
      <ManagementHub totals={totals} />
    </>
  );
}
