import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { adminCourseStatusAction } from '@/app/management-actions';
import { PageHeading, Notice, statusLabel } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { AdminTabs } from '@/components/admin-tabs';
export default async function AllCourses({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; archive?: string }>;
}) {
  await requireRole('admin');
  const query = await searchParams;
  const courses = all<{
    id: string;
    title: string;
    teacher: string;
    status: string;
    students: number;
  }>(
    `SELECT c.id, c.title, c.status, u.name teacher, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) students FROM courses c JOIN users u ON u.id = c.owner_id WHERE c.status ${query.archive === '1' ? '=' : '!='} 'archived' ORDER BY c.updated_at DESC`,
  );
  return (
    <>
      <PageHeading
        eyebrow="БАС ӘКІМШІ"
        title="Барлық курстар мен дәрістер"
        description="Авторына қарамастан материалдарды қарау, өңдеуге қайтару және архивтеу."
      >
        <Link className="button primary" href="/teacher/new">
          Жаңа курс +
        </Link>
      </PageHeading>
      <AdminTabs active="courses" />
      <Notice {...query} />
      <div className="workspace-tabs">
        <Link href="/admin/courses" className={query.archive !== '1' ? 'selected' : ''}>
          Белсенді курстар
        </Link>
        <Link href="/admin/courses?archive=1" className={query.archive === '1' ? 'selected' : ''}>
          Архив
        </Link>
      </div>
      <div className="table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Курс</th>
              <th>Күйі</th>
              <th>Студенттер</th>
              <th>Басқару</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link className="text-link" href={`/courses/${c.id}`}>
                    {c.title}
                  </Link>
                  <small>{c.teacher}</small>
                </td>
                <td>
                  <span className={`status-badge ${c.status}`}>{statusLabel[c.status]}</span>
                </td>
                <td>{c.students}</td>
                <td>
                  <div className="table-actions">
                    <Link className="text-link" href={`/teacher/courses/${c.id}`}>
                      Редактор
                    </Link>
                    {c.status !== 'draft' && (
                      <form action={adminCourseStatusAction}>
                        <input type="hidden" name="courseId" value={c.id} />
                        <input type="hidden" name="status" value="draft" />
                        <SubmitButton className="button outline tiny">Өңдеуге қайтару</SubmitButton>
                      </form>
                    )}
                    {c.status !== 'archived' && (
                      <form action={adminCourseStatusAction}>
                        <input type="hidden" name="courseId" value={c.id} />
                        <input type="hidden" name="status" value="archived" />
                        <SubmitButton className="button outline tiny">Архивтеу</SubmitButton>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!courses.length && <p className="table-empty">Курстар әлі жоқ.</p>}
      </div>
      <p className="help-text spaced">
        Архивтеу материал мен оқу тарихын жоймайды. Жариялау алдындағы тексеру негізгі басқару
        тақтасында.
      </p>
    </>
  );
}
