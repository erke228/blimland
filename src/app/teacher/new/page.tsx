import { requireRole } from '@/lib/auth';
import { createCourse } from '@/app/actions';
import { Notice, PageHeading } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
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
          <label>
            Курс атауы
            <input name="title" required minLength={5} maxLength={140} />
          </label>
          <label>
            Сипаттама
            <textarea name="description" required minLength={30} maxLength={5000} rows={5} />
          </label>
          <div className="form-row">
            <label>
              Санат
              <select name="category">
                {['Математика', 'Тілдер', 'Технология', 'Жаратылыстану', 'Басқа'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Бағасы, ₸
              <input type="number" name="price" min={0} max={10000000} defaultValue={0} required />
              <small>Тегін курс үшін 0. Төлем әзірге қосылмаған.</small>
            </label>
          </div>
          <SubmitButton>Курс жасап, сабақ қосу →</SubmitButton>
        </form>
      </div>
    </>
  );
}
