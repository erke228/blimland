import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { updateUserAction, revokeSessionsAction } from '@/app/management-actions';
import { PageHeading, Notice } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { AdminTabs } from '@/components/admin-tabs';
export default async function UserEditor({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  await requireRole('admin');
  const { id } = await params;
  const target = await one<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    department: string;
    academic_title: string;
  }>(
    'SELECT id, name, email, role, status, department, academic_title FROM users WHERE id = ?',
    id,
  );
  if (!target) notFound();
  const enrollments = (await one<{
    n: number;
  }>('SELECT COUNT(*) n FROM enrollments WHERE user_id = ?', id))!.n;
  const groups = await all<{
    id: string;
    name: string;
  }>(
    'SELECT g.id, g.name FROM academic_groups g JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ?',
    id,
  );
  const sessions = (await one<{
    n: number;
  }>('SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires_at > ?', id, Date.now()))!.n;
  const owner = target.role === 'admin';
  return (
    <>
      <PageHeading
        eyebrow="БАС ӘКІМШІ"
        title={target.name}
        description="Пайдаланушының профилі мен рұқсаттарын қолмен басқару."
      />
      <AdminTabs active="users" />
      <Notice {...await searchParams} />
      <div className="management-grid">
        <div className="panel">
          <h2>Профиль және қолжетімділік</h2>
          <form action={updateUserAction} className="form-stack">
            <input name="userId" type="hidden" value={id} />
            <label>
              Аты-жөні
              <input name="name" required minLength={2} maxLength={80} defaultValue={target.name} />
            </label>
            <label>
              Email
              <input
                type="email"
                name="email"
                required
                maxLength={254}
                defaultValue={target.email}
              />
            </label>
            <div className="form-row">
              <label>
                Рөл
                <select name="role" defaultValue={target.role}>
                  {owner ? (
                    <option value="admin">Бас әкімші</option>
                  ) : (
                    <>
                      <option value="student">Студент</option>
                      <option value="teacher">Оқытушы</option>
                    </>
                  )}
                </select>
              </label>
              <label>
                Мәртебе
                <select name="status" defaultValue={target.status}>
                  <option value="active">Белсенді</option>
                  {!owner && <option value="blocked">Бұғатталған</option>}
                </select>
              </label>
            </div>
            <label>
              Факультет / кафедра
              <input name="department" maxLength={180} defaultValue={target.department} />
            </label>
            <label>
              Лауазым
              <input name="academicTitle" maxLength={120} defaultValue={target.academic_title} />
            </label>
            <div className="notice">
              Рөл, email немесе мәртебе өзгерсе, пайдаланушының сессиялары аяқталады. Бұғаттау
              деректерді жоймайды.
              {owner && ' Бас әкімші рөлін төмендетуге және өзін бұғаттауға болмайды.'}
            </div>
            <SubmitButton>Пайдаланушыны сақтау</SubmitButton>
          </form>
        </div>
        <aside>
          <div className="panel">
            <h2>Аккаунт туралы</h2>
            <dl className="detail-list">
              <div>
                <dt>Курсқа жазылу</dt>
                <dd>{enrollments}</dd>
              </div>
              <div>
                <dt>Оқу топтары</dt>
                <dd>{groups.length}</dd>
              </div>
              <div>
                <dt>Белсенді сессиялар</dt>
                <dd>{sessions}</dd>
              </div>
            </dl>
            {groups.map((g) => (
              <Link key={g.id} className="list-link" href={`/teacher/groups/${g.id}`}>
                {g.name} →
              </Link>
            ))}
          </div>
          <div className="panel spaced">
            <h2>Сессияларды аяқтау</h2>
            <p className="muted">Барлық құрылғыдан шығару. Пайдаланушы қайта кіруі керек.</p>
            <form action={revokeSessionsAction}>
              <input type="hidden" name="userId" value={id} />
              <SubmitButton className="button outline">Барлық сессияны аяқтау</SubmitButton>
            </form>
          </div>
          <p className="help-text spaced">
            Құпиясөзді қалпына келтіру және расталған email ауыстыру поштаны қосқаннан кейін
            жасалады.
          </p>
        </aside>
      </div>
    </>
  );
}
