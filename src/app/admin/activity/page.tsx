import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { PageHeading } from '@/components/ui';
import { AdminTabs } from '@/components/admin-tabs';
import { AuditEvent } from '@/components/audit-event';
import { auditPresentation, auditKinds } from '@/lib/audit-presentation';
export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
  }>;
}) {
  await requireRole('admin');
  const { kind = '' } = await searchParams;
  const rows = (
    await all<{
      id: string;
      action: string;
      actor: string;
      target_id: string;
      created_at: number;
      target_label: string | null;
    }>(
      `SELECT a.id,a.action,u.name actor,a.target_id,a.created_at,COALESCE(c.title,l.title,s.title,g.name,t.name,m.original_name) target_label FROM audit_log a JOIN users u ON u.id=a.actor_id LEFT JOIN courses c ON c.id=a.target_id LEFT JOIN lessons l ON l.id=a.target_id LEFT JOIN sections s ON s.id=a.target_id LEFT JOIN academic_groups g ON g.id=a.target_id LEFT JOIN users t ON t.id=a.target_id LEFT JOIN lesson_materials m ON m.id=a.target_id ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,
    )
  ).filter(
    (row) => !Object.hasOwn(auditKinds, kind) || auditPresentation(row.action).kind === kind,
  );
  return (
    <>
      <PageHeading
        eyebrow="БАС ӘКІМШІ"
        title="Әрекеттер журналы"
        description="Соңғы 100 басқару әрекеті. Уақыт — Қазақстан (UTC+5)."
      />
      <AdminTabs active="activity" />
      <form action="/admin/activity" method="get" className="audit-filter">
        <label>
          Әрекет түрі
          <select name="kind" defaultValue={kind}>
            <option value="">Барлық әрекет</option>
            {Object.entries(auditKinds).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button outline">Көрсету</button>
        <span>{rows.length} әрекет</span>
      </form>
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
                <td>
                  <AuditEvent action={row.action} />
                </td>
                <td>
                  {row.target_label ? (
                    <span className="audit-target">{row.target_label}</span>
                  ) : (
                    <code title={row.target_id}>
                      {row.target_id === 'platform' ? 'Сайт' : row.target_id.slice(0, 12)}
                    </code>
                  )}
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
