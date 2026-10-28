import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { retryCourseCleanup } from '@/app/course-lifecycle-actions';
import { adminCourseStatusAction } from '@/app/management-actions';
import { PageHeading, Notice, statusLabel } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { AdminTabs } from '@/components/admin-tabs';
import { CourseControls } from '@/components/course-controls';
export default async function AllCourses({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    view?: string;
    archive?: string;
  }>;
}) {
  await requireRole('admin');
  const query = await searchParams;
  const view =
    query.view === 'trash'
      ? 'trash'
      : query.view === 'hidden' || query.archive === '1'
        ? 'hidden'
        : 'active';
  const condition =
    view === 'trash'
      ? 't.course_id IS NOT NULL'
      : view === 'hidden'
        ? "c.status='archived' AND t.course_id IS NULL"
        : "c.status!='archived' AND t.course_id IS NULL";
  const pending = (await one<{
    n: number;
  }>('SELECT COUNT(*) n FROM file_deletions'))!.n;
  const courses = await all<{
    id: string;
    title: string;
    teacher: string;
    status: string;
    students: number;
    lessons: number;
    in_trash: number;
  }>(
    `SELECT c.id,c.title,c.status,u.name teacher,(t.course_id IS NOT NULL) in_trash,(SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id) students,(SELECT COUNT(*) FROM lessons l JOIN sections s ON s.id=l.section_id WHERE s.course_id=c.id) lessons FROM courses c JOIN users u ON u.id=c.owner_id LEFT JOIN course_trash t ON t.course_id=c.id WHERE ${condition} ORDER BY c.updated_at DESC`,
  );
  return (
    <>
      <PageHeading
        eyebrow="БАС ӘКІМШІ"
        title="Курстарды басқару"
        description="Өзіңіздің және басқа оқытушылардың курстарын өңдеу, жасыру немесе толық жою."
      >
        <Link className="button primary" href="/teacher/new">
          Жаңа курс +
        </Link>
      </PageHeading>
      <AdminTabs active="courses" />
      <Notice {...query} />
      {pending > 0 && (
        <div className="notice">
          <p>{pending} файлды тазалау кезекте.</p>
          <form action={retryCourseCleanup}>
            <SubmitButton className="button outline small">
              Файлдарды тазалауды қайталау
            </SubmitButton>
          </form>
        </div>
      )}
      <nav className="workspace-tabs">
        {[
          ['active', 'Белсенді'],
          ['hidden', 'Жасырылған'],
          ['trash', 'Себет'],
        ].map(([key, label]) => (
          <Link
            className={view === key ? 'selected' : ''}
            href={`/admin/courses?view=${key}`}
            key={key}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="admin-course-grid">
        {courses.map((c) => (
          <article className="panel managed-course" key={c.id}>
            <div className="between">
              <span className={`status-badge ${c.status}`}>
                {c.in_trash
                  ? 'Себетте'
                  : c.status === 'archived'
                    ? 'Жасырылған'
                    : statusLabel[c.status]}
              </span>
              <span className="help-text">
                {c.lessons} дәріс · {c.students} студент
              </span>
            </div>
            <h2>{c.title}</h2>
            <p className="help-text">Оқытушы: {c.teacher}</p>
            <div className="managed-course-links">
              <Link className="text-link" href={`/teacher/courses/${c.id}`}>
                Редакторды ашу →
              </Link>
              <Link className="text-link" href={`/courses/${c.id}`}>
                Курсты көру
              </Link>
            </div>
            {!c.in_trash && ['published', 'submitted'].includes(c.status) && (
              <form action={adminCourseStatusAction}>
                <input type="hidden" name="courseId" value={c.id} />
                <input type="hidden" name="status" value="draft" />
                <SubmitButton className="button outline tiny">Өңдеуге қайтару</SubmitButton>
              </form>
            )}
            <CourseControls
              id={c.id}
              title={c.title}
              status={c.status}
              inTrash={!!c.in_trash}
              admin
              returnTo="/admin/courses"
            />
          </article>
        ))}
      </div>
      {!courses.length && (
        <div className="panel">
          <p className="help-text">Бұл бөлімде курс жоқ.</p>
        </div>
      )}
      <p className="help-text spaced">
        Жасыру оқу тарихын сақтайды. «Жою» курсты себетке көшіреді. Себеттегі курсты тек бас әкімші
        толық әрі қайтарымсыз жоя алады.
      </p>
    </>
  );
}
