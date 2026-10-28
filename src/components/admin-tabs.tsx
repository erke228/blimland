import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  ClipboardCheck,
  Settings2,
  Activity,
} from 'lucide-react';
export function AdminTabs({ active }: { active: string }) {
  const links = [
    ['overview', '/admin', 'Басқару', LayoutDashboard],
    ['users', '/admin/users', 'Пайдаланушылар', Users],
    ['courses', '/admin/courses', 'Курстар', BookOpen],
    ['groups', '/admin/groups', 'Топтар', GraduationCap],
    ['review', '/admin/review', 'Тексеру', ClipboardCheck],
    ['settings', '/admin/settings', 'Баптаулар', Settings2],
    ['activity', '/admin/activity', 'Журнал', Activity],
  ] as const;
  return (
    <nav className="workspace-tabs" aria-label="Бас әкімші бөлімдері">
      {links.map(([key, href, text, Icon]) => (
        <Link
          href={href}
          key={key}
          aria-current={active === key ? 'page' : undefined}
          className={active === key ? 'selected' : ''}
        >
          <Icon size={15} aria-hidden="true" />
          {text}
        </Link>
      ))}
    </nav>
  );
}
