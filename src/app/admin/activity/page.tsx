import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { PageHeading } from '@/components/ui';
import { AdminTabs } from '@/components/admin-tabs';
const labels: Record<string, string> = {
  'teacher.approved': 'Оқытушы мақұлданды',
  'teacher.rejected': 'Өтінім қайтарылды',
  'course.submitted': 'Курс тексеруге жіберілді',
  'course.published': 'Курс жарияланды',
  'course.draft': 'Курс өңдеуге қайтарылды',
  'course.archived': 'Курс архивтелді',
  'user.updated': 'Пайдаланушы жаңартылды',
  'user.sessions_revoked': 'Сессиялар аяқталды',
  'profile.updated': 'Профиль жаңартылды',
  'site.settings_updated': 'Сайт баптаулары өзгерді',
  'group.created': 'Топ құрылды',
  'group.updated': 'Топ өзгертілді',
  'group.invite_created': 'Шақыру жасалды',
  'group.invite_revoked': 'Шақыру өшірілді',
  'group.joined': 'Студент топқа қосылды',
  'group.left': 'Студент топтан шықты',
  'group.member_removed': 'Топ мүшесі шығарылды',
  'group.active': 'Топ қайта ашылды',
  'group.archived': 'Топ архивтелді',
  'group.course_assigned': 'Топқа курс тағайындалды',
  'group.course_removed': 'Топтан курс алынды',
};
export default async function Activity() {
  await requireRole('admin');
  const rows = all<{
    id: string;
    action: string;
    actor: string;
    target_id: string;
    created_at: number;
  }>(
    'SELECT a.id, a.action, u.name actor, a.target_id, a.created_at FROM audit_log a JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 100',
  );
  return (
    <>
      <PageHeading
        eyebrow="БАС ӘКІМШІ"
        title="Әрекеттер журналы"
        description="Соңғы 100 басқару әрекеті. Уақыт — Қазақстан (UTC+5)."
      />
      <AdminTabs active="activity" />
      <div className="table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Уақыт</th>
              <th>Кім</th>
              <th>Әрекет</th>
              <th>Нысан</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {new Date(row.created_at).toLocaleString('kk-KZ', { timeZone: 'Asia/Qyzylorda' })}
                </td>
                <td>{row.actor}</td>
                <td>{labels[row.action] || row.action}</td>
                <td>
                  <code>{row.target_id.slice(0, 12)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="table-empty">Журнал әзірге бос.</p>}
      </div>
    </>
  );
}
