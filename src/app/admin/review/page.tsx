import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { reviewTeacher, reviewCourse } from '@/app/actions';
import { Notice, PageHeading } from '@/components/ui';
import { AdminTabs } from '@/components/admin-tabs';
import { SubmitButton } from '@/components/submit-button';
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  await requireRole('admin');
  const applications = await all<{
    id: string;
    name: string;
    email: string;
    bio: string;
  }>(
    `SELECT a.id, u.name, u.email, a.bio FROM teacher_applications a JOIN users u ON u.id = a.user_id WHERE a.status = 'pending' ORDER BY a.created_at`,
  );
  const courses = await all<{
    id: string;
    title: string;
    teacher: string;
  }>(
    `SELECT c.id, c.title, u.name teacher FROM courses c JOIN users u ON u.id = c.owner_id WHERE c.status = 'submitted' ORDER BY c.updated_at`,
  );
  return (
    <>
      <PageHeading
        eyebrow="БАСҚАРУ"
        title="Тексеру кезегі"
        description="Оқытушы өтінімдері мен жариялауға жіберілген курстар."
      />
      <AdminTabs active="review" />
      <Notice {...await searchParams} />
      <div className="section-title">
        <h2>
          Оқытушы өтінімдері <span className="count-pill">{applications.length}</span>
        </h2>
      </div>
      {applications.length ? (
        <div className="review-list">
          {applications.map((application) => (
            <div className="panel" key={application.id}>
              <h3>{application.name}</h3>
              <p className="muted">{application.email}</p>
              <p className="preserve-whitespace">{application.bio}</p>
              <form action={reviewTeacher} className="form-stack">
                <input type="hidden" name="id" value={application.id} />
                <label>
                  Шешімге түсініктеме
                  <input name="note" maxLength={1000} />
                </label>
                <div className="button-row">
                  <SubmitButton name="decision" value="approved">
                    Мақұлдау
                  </SubmitButton>
                  <SubmitButton name="decision" value="rejected" className="button outline">
                    Қайтару
                  </SubmitButton>
                </div>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel muted">Қарастыруды күтетін өтінім жоқ.</div>
      )}
      <div className="section-title spaced">
        <h2>
          Курстарды тексеру <span className="count-pill">{courses.length}</span>
        </h2>
      </div>
      {courses.length ? (
        <div className="review-list">
          {courses.map((course) => (
            <div className="panel" key={course.id}>
              <h3>{course.title}</h3>
              <p className="muted">{course.teacher}</p>
              <Link className="text-link" href={`/courses/${course.id}`}>
                Бағдарлама мен сабақтарды қарау →
              </Link>
              <form action={reviewCourse} className="button-row spaced">
                <input type="hidden" name="courseId" value={course.id} />
                <SubmitButton name="decision" value="published">
                  Жариялау
                </SubmitButton>
                <SubmitButton name="decision" value="draft" className="button outline">
                  Өңдеуге қайтару
                </SubmitButton>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel muted">Тексерілетін курс жоқ.</div>
      )}
    </>
  );
}
