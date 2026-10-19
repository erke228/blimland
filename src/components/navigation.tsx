'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  LayoutDashboard,
  GraduationCap,
  ShieldCheck,
  Compass,
  Menu,
  X,
  Users,
  Settings,
  UserRound,
  Activity,
  House,
} from 'lucide-react';
import { useState } from 'react';

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
  const [open, setOpen] = useState(false);
  const isTeacher = role === 'teacher' || role === 'admin';
  const links =
    role === 'admin'
      ? [
          {
            href: '/admin',
            label: 'Басқару тақтасы',
            icon: LayoutDashboard,
            active: pathname === '/admin',
          },
          {
            href: '/admin/users',
            label: 'Пайдаланушылар',
            icon: Users,
            active: pathname.startsWith('/admin/users'),
          },
          {
            href: '/admin/courses',
            label: 'Барлық курстар',
            icon: BookOpen,
            active: pathname.startsWith('/admin/courses'),
          },
          {
            href: '/admin/groups',
            label: 'Оқу топтары',
            icon: GraduationCap,
            active: pathname === '/admin/groups' || pathname.startsWith('/teacher/groups'),
          },
          {
            href: '/teacher',
            label: 'Менің дәрістерім',
            icon: Compass,
            active: pathname.startsWith('/teacher') && !pathname.startsWith('/teacher/groups'),
          },
          {
            href: '/admin/activity',
            label: 'Әрекеттер журналы',
            icon: Activity,
            active: pathname === '/admin/activity',
          },
          {
            href: '/admin/settings',
            label: 'Сайт баптаулары',
            icon: Settings,
            active: pathname === '/admin/settings',
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
      <button
        className="mobile-menu"
        onClick={() => setOpen(!open)}
        aria-label="Мәзір"
        aria-expanded={open}
        aria-controls="main-sidebar"
      >
        {open ? <X /> : <Menu />}
      </button>
      <aside id="main-sidebar" className={`sidebar ${open ? 'open' : ''}`}>
        <Link href="/" className="brand" onClick={() => setOpen(false)} title={siteName}>
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
                onClick={() => setOpen(false)}
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
            <span>
              ҚАЗ <i /> KZT ₸
            </span>
          </div>
        </div>
      </aside>
      {open && (
        <button
          className="mobile-backdrop"
          aria-label="Мәзірді жабу"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
