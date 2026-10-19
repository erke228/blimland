import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listGroups } from '@/lib/management';
import { all } from '@/lib/db';
import { removeMemberAction } from '@/app/management-actions';
import { PageHeading, Notice, EmptyState, statusLabel } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
export default async function MyGroups({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await requireUser();
  const groups = listGroups(user.id, 'member');
  return (
    <>
      <PageHeading
        eyebrow="СТУДЕНТ КАБИНЕТІ"
        title="Менің оқу топтарым"
        description="Оқытушыңыздың шақыру сілтемесі арқылы топқа қосылыңыз."
      />
      <Notice {...await searchParams} />
      {groups.length ? (
        <div className="group-grid">
          {groups.map((g) => {
            const courses = all<{ id: string; title: string; status: string }>(
              'SELECT c.id, c.title, c.status FROM group_courses gc JOIN courses c ON c.id = gc.course_id WHERE gc.group_id = ?',
              g.id,
            );
            return (
              <div className="panel group-card" key={g.id}>
                <div className="between">
                  <span className="eyebrow">{g.academic_year}</span>
                  <span className={`status-badge ${g.status}`}>{statusLabel[g.status]}</span>
                </div>
                <h2>{g.name}</h2>
                <p>{g.teacher}</p>
                <p>{g.department}</p>
                <div className="group-course-links">
                  {courses.map((c) =>
                    c.status === 'published' ? (
                      <Link className="list-link" href={`/courses/${c.id}`} key={c.id}>
                        {c.title} →
                      </Link>
                    ) : (
                      <div className="list-link muted" key={c.id}>
                        {c.title} · Қолжетімсіз
                      </div>
                    ),
                  )}
                </div>
                <form action={removeMemberAction} className="spaced">
                  <input type="hidden" name="groupId" value={g.id} />
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="self" value="yes" />
                  <SubmitButton className="button outline tiny">Топтан шығу</SubmitButton>
                </form>
                <p className="help-text">Оқу тарихы мен курсқа жазылу сақталады.</p>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Әзірге топқа қосылмадыңыз"
          description="Оқытушыдан шақыру сілтемесін алыңыз. Курстарды каталогтан да қарай аласыз."
          href="/courses"
          label="Курстарға өту"
        />
      )}
    </>
  );
}
