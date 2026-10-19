import Link from 'next/link';
import { Plus, Clock3 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { applyTeacher } from '@/app/actions';
import { EmptyState, Notice, PageHeading, statusLabel } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
export default async function Teacher({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await requireUser();
  const notice = await searchParams;
  if (user.role === 'student') {
    const application = one<{ status: string; review_note: string }>(
      'SELECT status, review_note FROM teacher_applications WHERE user_id = ?',
      user.id,
    );
    return (
      <>
        <PageHeading
          eyebrow="ОҚЫТУШЫЛАРҒА"
          title="Біліміңізбен бөлісіңіз"
          description="Курс жариялау құқығын әкімші өтінімді қарастырғаннан кейін береді."
        />
        <Notice {...notice} />
        {application?.status === 'pending' ? (
          <div className="panel application-status">
            <Clock3 size={32} />
            <h2>Өтініміңіз қарастырылуда</h2>
            <p>Әкімші шешімінен кейін осы бетте оқытушы кабинеті ашылады.</p>
            <Link className="button outline" href="/dashboard">
              Оқуды жалғастыру
            </Link>
          </div>
        ) : (
          <div className="panel narrow-panel">
            {application?.status === 'rejected' && (
              <div className="notice error">
                Өтінім қайтарылды.{' '}
                {application.review_note || 'Ақпаратты толықтырып, қайта жіберіңіз.'}
              </div>
            )}
            <h2>Оқытушы болуға өтінім</h2>
            <form action={applyTeacher} className="form-stack">
              <label>
                Тәжірибеңіз және оқытатын тақырыптарыңыз
                <textarea
                  name="bio"
                  required
                  minLength={20}
                  maxLength={3000}
                  rows={7}
                  placeholder="Біліміңіз, тәжірибеңіз және курсыңыз туралы жазыңыз…"
                />
              </label>
              <SubmitButton>Өтінім жіберу →</SubmitButton>
            </form>
          </div>
        )}
      </>
    );
  }
  const courses = all<{ id: string; title: string; status: string; category: string }>(
    'SELECT id, title, status, category FROM courses WHERE owner_id = ? ORDER BY created_at DESC',
    user.id,
  );
  return (
    <>
      <PageHeading
        eyebrow="ОҚЫТУШЫ КАБИНЕТІ"
        title="Менің курстарым"
        description="Оқу материалдарын жасаңыз және курстарды тексеруге жіберіңіз."
      >
        <Link className="button primary" href="/teacher/new">
          <Plus size={17} />
          Курс жасау
        </Link>
      </PageHeading>
      <Notice {...notice} />
      {courses.length ? (
        <div className="panel course-list">
          {courses.map((course) => (
            <Link
              className="course-list-row"
              key={course.id}
              href={`/teacher/courses/${course.id}`}
            >
              <div>
                <span className="category-label">{course.category}</span>
                <h3>{course.title}</h3>
              </div>
              <span className={`status-badge ${course.status}`}>
                {statusLabel[course.status] || course.status}
              </span>
              <span>Ашу →</span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Алғашқы курсыңызды жасаңыз"
          description="Курс атауын енгізіп, бөлімдер мен сабақтарды қосыңыз."
          href="/teacher/new"
          label="Курс жасау"
        />
      )}
    </>
  );
}
