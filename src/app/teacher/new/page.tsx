import { requireRole } from '@/lib/auth';
import { Notice, PageHeading } from '@/components/ui';
import { CourseWizard } from '@/components/course-wizard';
export default async function NewCourse({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  await requireRole('teacher', 'admin');
  return (
    <>
      <PageHeading
        title="Жаңа курс"
        description="Курс — дәрістер жинағы. Алдымен атауы мен мұқабасын сақтайсыз, содан кейін бөлімдер мен жеке дәрістерді қосасыз."
      />
      <Notice {...await searchParams} />
      <CourseWizard />
    </>
  );
}
