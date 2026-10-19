'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  LayoutDashboard,
  GraduationCap,
  ShieldCheck,
  ArrowUpRight,
  Compass,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

export function Navigation({ role }: { role?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = [
    {
      href: '/courses',
      label: 'Курстар каталогы',
      icon: Compass,
      active: pathname === '/' || pathname.startsWith('/courses') || pathname.startsWith('/learn'),
    },
    {
      href: '/dashboard',
      label: 'Менің оқуым',
      icon: LayoutDashboard,
      active: pathname === '/dashboard',
    },
    {
      href: '/teacher',
      label: 'Оқытушы кабинеті',
      icon: GraduationCap,
      active: pathname.startsWith('/teacher'),
    },
    ...(role === 'admin'
      ? [
          {
            href: '/admin',
            label: 'Әкімші кабинеті',
            icon: ShieldCheck,
            active: pathname === '/admin',
          },
        ]
      : []),
  ];
  return (
    <>
      <button
        className="mobile-menu"
        onClick={() => setOpen(!open)}
        aria-label="Мәзір"
        aria-expanded={open}
      >
        {open ? <X /> : <Menu />}
      </button>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          bilim<span className="brand-light">hub</span>
          <span className="brand-dot" />
        </Link>
        <div className="workspace">
          <span className="workspace-icon">Қ</span>
          <div>
            <strong>Білім кеңістігі</strong>
            <span>Қазақ тілінде үйреніңіз</span>
          </div>
        </div>
        <p className="nav-caption">ПЛАТФОРМА</p>
        <nav>
          {links.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${active ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              {label}
              {active && <span className="active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="teacher-promo">
            <span className="promo-icon">
              <GraduationCap size={23} />
            </span>
            <strong>Біліміңізбен бөлісіңіз</strong>
            <p>Өз курсыңызды жасап, оқушыларға жол ашыңыз.</p>
            <Link href="/teacher" onClick={() => setOpen(false)}>
              Оқытушы болу <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="sidebar-foot">
            Қазақстанда білімге жол ашамыз
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
