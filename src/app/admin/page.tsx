import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { reviewTeacher, reviewCourse } from '@/app/actions';
import { Notice, PageHeading } from '@/components/ui';
import { AdminTabs } from '@/components/admin-tabs';
import { one } from '@/lib/db';
import { Users, BookOpen, GraduationCap, ArrowUpRight } from 'lucide-react';
import { SubmitButton } from '@/components/submit-button';
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await requireRole('admin');
  const totals = one<{ students: number; teachers: number; groups: number; courses: number }>(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active') students, (SELECT COUNT(*) FROM users WHERE role = 'teacher' AND status = 'active') teachers, (SELECT COUNT(*) FROM academic_groups WHERE status = 'active') groups, (SELECT COUNT(*) FROM courses WHERE status = 'published') courses`,
  )!;
  const applications = all<{ id: string; name: string; email: string; bio: string }>(
    `SELECT a.id, u.name, u.email, a.bio FROM teacher_applications a JOIN users u ON u.id = a.user_id WHERE a.status = 'pending' ORDER BY a.created_at`,
  );
  const courses = all<{ id: string; title: string; teacher: string }>(
    `SELECT c.id, c.title, u.name teacher FROM courses c JOIN users u ON u.id = c.owner_id WHERE c.status = 'submitted' ORDER BY c.updated_at`,
  );
  return (
    <>
      <PageHeading
        eyebrow="БАСҚАРУ"
        title="Бас әкімші кабинеті"
        description={`Сәлем, ${admin.name}. Университеттің оқу үдерісін бір жерден басқарыңыз.`}
      >
        <Link className="button primary" href="/teacher/new">
          Дәрістерге курс жасау +
        </Link>
      </PageHeading>
      <AdminTabs active="overview" />
      <div className="stats-grid admin-stats">
        <Link href="/admin/users?role=student" className="stat-card">
          <Users />
          <span>Белсенді студенттер</span>
          <strong>{totals.students}</strong>
        </Link>
        <Link href="/admin/users?role=teacher" className="stat-card">
          <GraduationCap />
          <span>Оқытушылар</span>
          <strong>{totals.teachers}</strong>
        </Link>
        <Link href="/admin/groups" className="stat-card">
          <Users />
          <span>Оқу топтары</span>
          <strong>{totals.groups}</strong>
        </Link>
        <Link href="/admin/courses" className="stat-card">
          <BookOpen />
          <span>Жарияланған курстар</span>
          <strong>{totals.courses}</strong>
        </Link>
      </div>
      <div className="admin-quicklinks">
        <Link href="/admin/users">
          <Users size={21} />
          <div>
            <strong>Пайдаланушыларды басқару</strong>
            <small>Профильдер, рөлдер, бұғаттау және сессиялар</small>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link href="/admin/groups">
          <GraduationCap size={21} />
          <div>
            <strong>Топтар мен үлгерім</strong>
            <small>Оқытушылар, шақырулар және оқу барысы</small>
          </div>
          <ArrowUpRight size={18} />
        </Link>
      </div>
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
