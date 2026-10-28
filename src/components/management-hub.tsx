import Link from 'next/link';
import {
  Users,
  BookOpen,
  GraduationCap,
  ClipboardCheck,
  Activity,
  Settings2,
  ArrowUpRight,
} from 'lucide-react';
import { one } from '@/lib/db';
export async function ManagementHub({
  totals,
}: {
  totals: {
    students: number;
    teachers: number;
    groups: number;
    courses: number;
  };
}) {
  const pending = (await one<{
    n: number;
  }>(
    "SELECT (SELECT COUNT(*) FROM teacher_applications WHERE status='pending')+(SELECT COUNT(*) FROM courses WHERE status='submitted') n",
  ))!.n;
  const items = [
    {
      href: '/admin/users',
      title: 'Пайдаланушылар',
      description: 'Профильдер, рөлдер және аккаунттарға қолжетімділік',
      Icon: Users,
      meta: `${totals.students} студент · ${totals.teachers} оқытушы`,
      tone: 'teal',
    },
    {
      href: '/admin/courses',
      title: 'Барлық курстар',
      description: 'Курстарды өңдеу, жасыру, қалпына келтіру және жою',
      Icon: BookOpen,
      meta: `${totals.courses} жарияланған курс`,
      tone: 'blue',
    },
    {
      href: '/admin/groups',
      title: 'Оқу топтары',
      description: 'Топтар, шақырулар және студенттердің оқу барысы',
      Icon: GraduationCap,
      meta: `${totals.groups} белсенді топ`,
      tone: 'violet',
    },
    {
      href: '/admin/review',
      title: 'Тексеру кезегі',
      description: 'Оқытушы өтінімдері мен курстарды жариялау',
      Icon: ClipboardCheck,
      meta: pending ? `${pending} өтінім күтуде` : 'Күтіп тұрған өтінім жоқ',
      tone: 'amber',
    },
    {
      href: '/admin/activity',
      title: 'Әрекеттер журналы',
      description: 'Өңдеу, жариялау, жою және қауіпсіздік тарихы',
      Icon: Activity,
      meta: 'Соңғы әрекеттер',
      tone: 'rose',
    },
    {
      href: '/admin/settings',
      title: 'Сайт баптаулары',
      description: 'Атауы, хабарландырулар және тіркелу тәртібі',
      Icon: Settings2,
      meta: 'Негізгі баптаулар',
      tone: 'slate',
    },
  ];
  return (
    <div className="management-hub">
      {items.map(({ href, title, description, Icon, meta, tone }) => (
        <Link key={href} href={href} className={`management-tile ${tone}`}>
          <span className="management-tile-icon">
            <Icon size={24} />
          </span>
          <ArrowUpRight className="management-tile-arrow" size={19} />
          <h2>{title}</h2>
          <p>{description}</p>
          <span className="management-tile-meta">{meta}</span>
        </Link>
      ))}
    </div>
  );
}
