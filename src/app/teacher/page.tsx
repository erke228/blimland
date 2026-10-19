import Link from 'next/link';
import { Plus, Clock3, Users, BookOpen } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { redirect } from 'next/navigation';
import { EmptyState, Notice, PageHeading, statusLabel } from '@/components/ui';

export default async function Teacher({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await requireUser();
  const notice = await searchParams;
  if (user.role === 'student') redirect('/profile');
  const courses = all<{ id: string; title: string; status: string; category: string }>(
    "SELECT id, title, status, category FROM courses WHERE owner_id = ? AND status != 'archived' ORDER BY created_at DESC",
    user.id,
  );
  const groups = one<{ n: number }>(
    "SELECT COUNT(*) n FROM academic_groups WHERE owner_id = ? AND status = 'active'",
    user.id,
  )!.n;
  const students = one<{ n: number }>(
    'SELECT COUNT(DISTINCT m.user_id) n FROM group_members m JOIN academic_groups g ON g.id = m.group_id WHERE g.owner_id = ?',
    user.id,
  )!.n;
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
