'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  LayoutDashboard,
  ShieldCheck,
  Compass,
  Users,
  UserRound,
  House,
} from 'lucide-react';

export function Navigation({
  role,
  siteName,
  institutionName,
}: {
  role?: string;
  siteName: string;
  institutionName: string;
}) {
  const pathname = usePathname();
  const isTeacher = role === 'teacher' || role === 'admin';
  const links =
    role === 'admin'
      ? [
          {
            href: '/admin',
            label: 'Басқару тақтасы',
            icon: LayoutDashboard,
            active: pathname.startsWith('/admin') || pathname.startsWith('/teacher/groups'),
          },
          {
            href: '/courses',
            label: 'Пәндер мен курстар',
            icon: Compass,
            active: pathname.startsWith('/courses') || pathname.startsWith('/learn'),
          },
          {
            href: '/teacher',
            label: 'Менің дәрістерім',
            icon: Compass,
            active: pathname.startsWith('/teacher') && !pathname.startsWith('/teacher/groups'),
          },
          {
            href: '/profile',
            label: 'Менің профилім',
            icon: UserRound,
            active: pathname.startsWith('/profile'),
          },
        ]
      : [
          ...(isTeacher
            ? [
                {
                  href: '/teacher',
                  label: 'Оқытушы кабинеті',
                  icon: LayoutDashboard,
                  active:
                    pathname.startsWith('/teacher') && !pathname.startsWith('/teacher/groups'),
                },
                {
                  href: '/teacher/groups',
                  label: 'Менің топтарым',
                  icon: Users,
                  active: pathname.startsWith('/teacher/groups'),
                },
              ]
            : [
                {
                  href: '/dashboard',
                  label: 'Менің оқуым',
                  icon: LayoutDashboard,
                  active: pathname === '/dashboard',
                },
              ]),
          {
            href: '/courses',
            label: 'Пәндер мен курстар',
            icon: Compass,
            active: pathname.startsWith('/courses') || pathname.startsWith('/learn'),
          },
          {
            href: '/profile',
            label: 'Менің профилім',
            icon: UserRound,
            active: pathname.startsWith('/profile'),
          },
        ];
  return (
    <>
      <aside id="main-sidebar" className="sidebar">
        <Link href="/" className="brand" title={siteName}>
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          <span className="brand-text">{siteName}</span>
          <span className="brand-dot" />
        </Link>
        <div className="workspace">
          <span className="workspace-icon">
            {role === 'admin' ? <ShieldCheck size={19} /> : 'У'}
          </span>
          <div>
            <strong>
              {role === 'admin' ? 'Бас әкімші' : isTeacher ? 'Оқытушы' : role ? 'Студент' : 'Қонақ'}
            </strong>
            <span title={institutionName}>{institutionName}</span>
          </div>
        </div>
        <p className="nav-caption">{role === 'admin' ? 'БАСҚАРУ ОРТАЛЫҒЫ' : 'ОҚУ КЕҢІСТІГІ'}</p>
        <nav aria-label="Негізгі мәзір">
          {[{ href: '/', label: 'Басты бет', icon: House, active: pathname === '/' }, ...links].map(
            ({ href, label, icon: Icon, active }) => (
              <Link
                key={href}
                href={href}
                className={`nav-link ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={19} />
                {label}
                {active && <span className="active-dot" />}
              </Link>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-foot">
            Университеттің цифрлық оқу кеңістігі
            <span>Қазақ тіліндегі оқу кеңістігі</span>
          </div>
        </div>
      </aside>
      <nav className="mobile-bottom-nav" aria-label="Телефондағы навигация">
        {[
          { href: '/', label: 'Басты бет', icon: House, active: pathname === '/' },
          {
            href: '/courses',
            label: 'Каталог',
            icon: Compass,
            active: pathname.startsWith('/courses'),
          },
          {
            href: role === 'admin' ? '/admin' : isTeacher ? '/teacher' : '/dashboard',
            label: role === 'admin' ? 'Басқару' : isTeacher ? 'Кабинет' : 'Менің оқуым',
            icon: role === 'admin' ? LayoutDashboard : BookOpen,
            active:
              pathname.startsWith('/admin') ||
              pathname.startsWith('/teacher') ||
              pathname === '/dashboard' ||
              pathname.startsWith('/learn'),
          },
          {
            href: '/profile',
            label: 'Профиль',
            icon: UserRound,
            active: pathname.startsWith('/profile'),
          },
        ].map(({ href, label, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            className={active ? 'selected' : ''}
            aria-current={active ? 'page' : undefined}
          >
            <span className="mobile-nav-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
