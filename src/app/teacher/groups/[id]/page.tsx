import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { managedGroup, ManagementError, groupReport, invitation } from '@/lib/management';
import {
  assignCourseAction,
  createInviteAction,
  revokeInviteAction,
  removeMemberAction,
  groupStatusAction,
} from '@/app/management-actions';
import { PageHeading, Notice, statusLabel } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { GroupForm } from '@/components/group-form';
import { CopyLink } from '@/components/copy-link';
export default async function GroupDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await requireRole('teacher', 'admin');
  const { id } = await params;
  let group;
  try {
    group = managedGroup(user.id, id);
  } catch (e) {
    if (e instanceof ManagementError) notFound();
    throw e;
  }
  const report = groupReport(user.id, id);
  const assigned = all<{ id: string; title: string; status: string }>(
    'SELECT c.id, c.title, c.status FROM group_courses gc JOIN courses c ON c.id = gc.course_id WHERE gc.group_id = ?',
    id,
  );
  const available = all<{ id: string; title: string; teacher: string }>(
    `SELECT c.id, c.title, u.name teacher FROM courses c JOIN users u ON u.id = c.owner_id WHERE c.status = 'published' AND c.price_kzt = 0 AND (? = 'admin' OR c.owner_id = ?) AND c.id NOT IN (SELECT course_id FROM group_courses WHERE group_id = ?) ORDER BY c.title`,
    user.role,
    user.id,
    id,
  );
  const invites = all<{
    id: string;
    expires_at: number;
    max_uses: number;
    uses: number;
    revoked_at: number | null;
  }>(
    'SELECT id, expires_at, max_uses, uses, revoked_at FROM group_invites WHERE group_id = ? ORDER BY created_at DESC LIMIT 30',
    id,
  );
  const raw = (await cookies()).get(`group_invite_${id}`)?.value;
  const currentInvite = raw ? invitation(raw) : undefined;
  const link =
    currentInvite?.group_id === id
      ? `${(process.env.APP_ORIGIN || 'http://127.0.0.1:3000').replace(/\/$/, '')}/join/${raw}`
      : '';
  const members = [...new Map(report.map((r) => [r.user_id, r])).values()];
  const active = group.status === 'active';
  return (
    <>
      <Link
        className="back-link"
        href={user.role === 'admin' ? '/admin/groups' : '/teacher/groups'}
      >
        ← Оқу топтары
      </Link>
      <PageHeading
        eyebrow={`${group.academic_year} · ${group.semester === 3 ? 'ЖАЗҒЫ СЕМЕСТР' : `${group.semester}-СЕМЕСТР`}`}
        title={group.name}
        description={`${group.department || 'Оқу тобы'} · ${group.teacher}`}
      >
        <span className={`status-badge ${group.status}`}>{statusLabel[group.status]}</span>
      </PageHeading>
      <Notice {...await searchParams} />
      <div className="stats-grid">
        <div className="stat-card">
          <span>Студенттер</span>
          <strong>{group.member_count}</strong>
        </div>
        <div className="stat-card">
          <span>Тағайындалған курстар</span>
          <strong>{assigned.length}</strong>
        </div>
        <div className="stat-card">
          <span>Белсенді шақырулар</span>
          <strong>
            {
              invites.filter(
                (i) => !i.revoked_at && i.expires_at > Date.now() && i.uses < i.max_uses,
              ).length
            }
          </strong>
        </div>
      </div>
      <div className="management-grid">
        <section>
          <div className="panel">
            <h2>Топ курстары</h2>
            {assigned.map((course) => (
              <div className="assigned-course" key={course.id}>
                <div>
                  <Link className="text-link" href={`/courses/${course.id}`}>
                    {course.title}
                  </Link>
                  <small>{statusLabel[course.status]}</small>
                </div>
                {active && (
                  <form action={assignCourseAction}>
                    <input type="hidden" name="groupId" value={id} />
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="remove" value="yes" />
                    <SubmitButton className="button outline tiny">Топтан алу</SubmitButton>
                  </form>
                )}
              </div>
            ))}
            {!assigned.length && <p className="muted">Әзірге курс тағайындалмаған.</p>}
            {active && (
              <form action={assignCourseAction} className="form-stack spaced">
                <input type="hidden" name="groupId" value={id} />
                <label>
                  Жарияланған тегін курс
                  <select name="courseId" required disabled={!available.length}>
                    <option value="">Курсты таңдаңыз</option>
                    {available.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.title}
                        {user.role === 'admin' ? ` · ${c.teacher}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton className="button outline" disabled={!available.length}>
                  Курс тағайындау
                </SubmitButton>
                {!available.length && (
                  <p className="help-text">
                    Қосуға болатын жарияланған тегін курс жоқ. Алдымен курс жасап, оны жариялаңыз.
                  </p>
                )}
                <p className="help-text">
                  Курс топтағы студенттердің кабинетіне қосылады. Ақылы курстарға бұл әрекет
                  қолжетімділік бермейді.
                </p>
              </form>
            )}
          </div>
          <div className="panel spaced">
            <div className="between">
              <h2>Студенттер және оқу барысы</h2>
              <Link className="button outline tiny" href={`/teacher/groups/${id}/export`}>
                CSV жүктеу
              </Link>
            </div>
            <p className="help-text">
              Пайыз қолмен оқылды деп белгіленген сабақтарды көрсетеді. Тест бағасы емес.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Студент</th>
                    <th>Курс</th>
                    <th>Оқылған сабақтар</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r, index) => (
                    <tr key={`${r.user_id}-${r.course_id || index}`}>
                      <td>
                        <strong>{r.name}</strong>
                        <small>{r.email}</small>
                        {r.status === 'blocked' && (
                          <small className="danger-text">Бұғатталған</small>
                        )}
                      </td>
                      <td>
                        {r.course_title || 'Курс тағайындалмаған'}
                        {r.course_status && r.course_status !== 'published' && (
                          <small>{statusLabel[r.course_status]}</small>
                        )}
                      </td>
                      <td>
                        {r.course_id ? (
                          <div className="report-progress">
                            <span>
                              {r.completed}/{r.total} ·{' '}
                              {r.total
                                ? Math.min(100, Math.round((100 * r.completed) / r.total))
                                : 0}
                              %
                            </span>
                            <progress value={r.completed} max={Math.max(1, r.total)} />
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!members.length && (
              <p className="table-empty">Студенттер әлі қосылмаған. Шақыру сілтемесін жасаңыз.</p>
            )}
          </div>
          {members.length > 0 && (
            <details className="panel spaced">
              <summary>Топ құрамын басқару</summary>
              <p className="help-text">Топтан шығару курсқа жазылуды және оқу тарихын жоймайды.</p>
              {members.map((m) => (
                <div className="member-control" key={m.user_id}>
                  <span>{m.name}</span>
                  <form action={removeMemberAction}>
                    <input type="hidden" name="groupId" value={id} />
                    <input type="hidden" name="userId" value={m.user_id} />
                    <SubmitButton className="button outline tiny">Топтан шығару</SubmitButton>
                  </form>
                </div>
              ))}
            </details>
          )}
        </section>
        <aside>
          <div className="panel">
            <h2>Сілтемемен шақыру</h2>
            {active ? (
              <>
                <p className="muted">Студент аккаунтымен кіріп, топқа қосылуын растайды.</p>
                <form action={createInviteAction} className="form-stack">
                  <input type="hidden" name="groupId" value={id} />
                  <div className="form-row">
                    <label>
                      Мерзімі
                      <select name="days">
                        <option value="7">7 күн</option>
                        <option value="1">1 күн</option>
                        <option value="30">30 күн</option>
                      </select>
                    </label>
                    <label>
                      Студент лимиті
                      <input
                        name="maxUses"
                        type="number"
                        min={1}
                        max={5000}
                        defaultValue={50}
                        required
                      />
                    </label>
                  </div>
                  <SubmitButton>Шақыру сілтемесін жасау</SubmitButton>
                </form>
                {link && (
                  <div className="invite-result">
                    <p>Жаңа шақыру сілтемесі</p>
                    <CopyLink value={link} />
                    <small>Сілтемені тек осы топқа шақырылатын студенттермен бөлісіңіз.</small>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">Архивтелген топқа шақыру жабық.</p>
            )}
            <div className="invite-history">
              {invites.map((i) => (
                <div key={i.id}>
                  <div>
                    <strong>
                      {i.uses}/{i.max_uses} қосылу
                    </strong>
                    <small>
                      {i.revoked_at
                        ? 'Өшірілген'
                        : i.expires_at <= Date.now()
                          ? 'Мерзімі аяқталған'
                          : i.uses >= i.max_uses
                            ? 'Лимиті біткен'
                            : `Дейін: ${new Date(i.expires_at).toLocaleDateString('kk-KZ', { timeZone: 'Asia/Qyzylorda' })}`}
                    </small>
                  </div>
                  {!i.revoked_at && i.expires_at > Date.now() && (
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="groupId" value={id} />
                      <input type="hidden" name="inviteId" value={i.id} />
                      <SubmitButton className="button outline tiny">Өшіру</SubmitButton>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </div>
          <details className="panel spaced">
            <summary>Топ мәліметтерін өзгерту</summary>
            <div className="spaced">
              <GroupForm group={group} />
            </div>
          </details>
          <div className="panel spaced">
            <h2>{active ? 'Топты архивтеу' : 'Топты қайта ашу'}</h2>
            <p className="help-text">
              Архивтеу шақыруларды тоқтатады. Құрамы мен оқу тарихы сақталады. Қайта ашқанда жаңа
              шақыру жасаңыз.
            </p>
            <form action={groupStatusAction} className="spaced">
              <input type="hidden" name="groupId" value={id} />
              <input type="hidden" name="status" value={active ? 'archived' : 'active'} />
              <SubmitButton className="button outline">
                {active ? 'Архивтеу' : 'Қайта ашу'}
              </SubmitButton>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
