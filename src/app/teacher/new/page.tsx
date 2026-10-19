import { requireRole } from '@/lib/auth';
import { createCourse } from '@/app/actions';
import { Notice, PageHeading } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { CourseFields } from '@/components/course-fields';
import { CoverPicker } from '@/components/cover-picker';
export default async function NewCourse({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole('teacher', 'admin');
  return (
    <>
      <PageHeading
        title="Жаңа курс"
        description="Алдымен курс туралы негізгі ақпаратты толтырыңыз."
      />
      <Notice {...await searchParams} />
      <div className="panel narrow-panel">
        <form action={createCourse} className="form-stack">
          <CourseFields />
          <CoverPicker />
          <p className="help-text">Курс жасалғаннан кейін өз суретіңізді мұқабаға жүктей аласыз.</p>
          <SubmitButton>Курс жасап, сабақ қосу →</SubmitButton>
        </form>
      </div>
    </>
  );
}
