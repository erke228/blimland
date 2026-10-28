import Link from 'next/link';
import { Plus, Clock3, Users, BookOpen } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { redirect } from 'next/navigation';
import { EmptyState, Notice, PageHeading, statusLabel } from '@/components/ui';
import { CourseControls } from '@/components/course-controls';
export default async function Teacher({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    view?: string;
  }>;
}) {
  const user = await requireUser();
  const notice = await searchParams;
  if (user.role === 'student') redirect('/profile');
  const view = notice.view === 'trash' ? 'trash' : notice.view === 'hidden' ? 'hidden' : 'active';
  const condition =
    view === 'trash'
      ? 't.course_id IS NOT NULL'
      : view === 'hidden'
        ? "c.status='archived' AND t.course_id IS NULL"
        : "c.status!='archived' AND t.course_id IS NULL";
  const courses = await all<{
    id: string;
    title: string;
    status: string;
    category: string;
    in_trash: number;
  }>(
    `SELECT c.id,c.title,c.status,c.category,(t.course_id IS NOT NULL) in_trash FROM courses c LEFT JOIN course_trash t ON t.course_id=c.id WHERE c.owner_id=? AND ${condition} ORDER BY c.created_at DESC`,
    user.id,
  );
  const groups = (await one<{
    n: number;
  }>("SELECT COUNT(*) n FROM academic_groups WHERE owner_id = ? AND status = 'active'", user.id))!
    .n;
  const students = (await one<{
    n: number;
  }>(
    'SELECT COUNT(DISTINCT m.user_id) n FROM group_members m JOIN academic_groups g ON g.id = m.group_id WHERE g.owner_id = ?',
    user.id,
  ))!.n;
  return (
    <>
      <PageHeading
        eyebrow="ОҚЫТУШЫ КАБИНЕТІ"
        title="Оқытушының жұмыс кеңістігі"
        description="Дәрістерді жариялаңыз, оқу топтарын басқарыңыз және студенттердің оқу барысын бақылаңыз."
      >
        <Link className="button primary" href="/teacher/new">
          <Plus size={17} />
          Курс жасау
        </Link>
      </PageHeading>
      <Notice {...notice} />
      <div className="stats-grid">
        <div className="stat-card">
          <BookOpen />
          <span>Менің курстарым</span>
          <strong>{courses.length}</strong>
        </div>
        <Link href="/teacher/groups" className="stat-card">
          <Users />
          <span>Белсенді топтар</span>
          <strong>{groups}</strong>
        </Link>
        <Link href="/teacher/groups" className="stat-card">
          <Users />
          <span>Топтардағы студенттер</span>
          <strong>{students}</strong>
        </Link>
      </div>
      <div className="workspace-tabs">
        <Link className="selected" href="/teacher">
          Курстар мен дәрістер
        </Link>
        <Link href="/teacher/groups">Оқу топтары</Link>
        <Link href="/profile">Профиль</Link>
      </div>
      <nav className="workspace-tabs">
        {[
          ['active', 'Белсенді'],
          ['hidden', 'Жасырылған'],
          ['trash', 'Себет'],
        ].map(([key, label]) => (
          <Link href={`/teacher?view=${key}`} className={view === key ? 'selected' : ''} key={key}>
            {label}
          </Link>
        ))}
      </nav>
      {courses.length ? (
        <div className="panel course-list">
          {courses.map((course) => (
            <div className="course-list-row" key={course.id}>
              <div>
                <span className="category-label">{course.category}</span>
                <h3>
                  <Link href={`/teacher/courses/${course.id}`}>{course.title}</Link>
                </h3>
              </div>
              <span className={`status-badge ${course.status}`}>
                {course.in_trash
                  ? 'Себетте'
                  : course.status === 'archived'
                    ? 'Жасырылған'
                    : statusLabel[course.status] || course.status}
              </span>
              <CourseControls
                id={course.id}
                title={course.title}
                status={course.status}
                inTrash={!!course.in_trash}
                admin={user.role === 'admin'}
              />
            </div>
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
