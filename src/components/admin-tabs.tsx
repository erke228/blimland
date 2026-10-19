import Link from 'next/link';
export function AdminTabs({ active }: { active: string }) {
  const links = [
    ['overview', '/admin', 'Шолу'],
    ['users', '/admin/users', 'Пайдаланушылар'],
    ['courses', '/admin/courses', 'Курстар'],
    ['groups', '/admin/groups', 'Топтар'],
    ['settings', '/admin/settings', 'Баптаулар'],
    ['activity', '/admin/activity', 'Журнал'],
  ];
  return (
    <nav className="workspace-tabs" aria-label="Бас әкімші бөлімдері">
      {links.map(([key, href, text]) => (
        <Link
          href={href}
          key={key}
          aria-current={active === key ? 'page' : undefined}
          className={active === key ? 'selected' : ''}
        >
          {text}
        </Link>
      ))}
    </nav>
  );
}
