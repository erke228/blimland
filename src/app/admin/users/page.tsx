import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { PageHeading, statusLabel, EmptyState } from '@/components/ui';
import { AdminTabs } from '@/components/admin-tabs';
export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
  }>;
}) {
  await requireRole('admin');
  const query = await searchParams;
  const needle = (query.q || '').slice(0, 200).toLocaleLowerCase('kk-KZ');
  const users = (
    await all<{
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      department: string;
      created_at: number;
    }>(
      `SELECT id, name, email, role, status, department, created_at FROM users WHERE (? = '' OR role = ?) AND (? = '' OR status = ?) ORDER BY created_at DESC`,
      query.role || '',
      query.role || '',
      query.status || '',
      query.status || '',
    )
  ).filter((u) =>
    `${u.name} ${u.email} ${u.department}`.toLocaleLowerCase('kk-KZ').includes(needle),
  );
  return (
    <>
      <PageHeading
        eyebrow="БАС ӘКІМШІ"
        title="Пайдаланушыларды басқару"
        description="Профильдер, рөлдер және аккаунтқа қолжетімділік."
      />
      <AdminTabs active="users" />
      <form className="management-filters" method="get">
        <div className="search-field">
          <Search size={18} />
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Аты, email немесе кафедра"
            aria-label="Пайдаланушыны іздеу"
          />
        </div>
        <select name="role" defaultValue={query.role || ''} aria-label="Рөл">
          <option value="">Барлық рөлдер</option>
          <option value="student">Студент</option>
          <option value="teacher">Оқытушы</option>
          <option value="admin">Бас әкімші</option>
        </select>
        <select name="status" defaultValue={query.status || ''} aria-label="Мәртебе">
          <option value="">Барлық мәртебе</option>
          <option value="active">Белсенді</option>
          <option value="blocked">Бұғатталған</option>
        </select>
        <button className="button primary">Іздеу</button>
      </form>
      <div className="result-count">Табылды: {users.length}</div>
      {users.length ? (
        <div className="table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Пайдаланушы</th>
                <th>Рөл</th>
                <th>Кафедра</th>
                <th>Мәртебе</th>
                <th>
                  <span className="sr-only">Әрекет</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </td>
                  <td>
                    {u.role === 'admin'
                      ? 'Бас әкімші'
                      : u.role === 'teacher'
                        ? 'Оқытушы'
                        : 'Студент'}
                  </td>
                  <td>{u.department || '—'}</td>
                  <td>
                    <span className={`status-badge ${u.status}`}>{statusLabel[u.status]}</span>
                  </td>
                  <td>
                    <Link className="text-link" href={`/admin/users/${u.id}`}>
                      Басқару →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Пайдаланушы табылмады" description="Іздеу шарттарын өзгертіңіз." />
      )}
    </>
  );
}
