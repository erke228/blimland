import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  Clock3,
  GraduationCap,
  Sigma,
  Languages,
  Monitor,
  Sparkles,
} from 'lucide-react';
import type { Course } from '@/lib/courses';
import { money } from '@/lib/courses';

export function CourseCover({
  course,
  large = false,
}: {
  course: Pick<Course, 'category' | 'accent' | 'title'>;
  large?: boolean;
}) {
  const Icon =
    course.category === 'Математика'
      ? Sigma
      : course.category === 'Тілдер'
        ? Languages
        : course.category === 'Технология'
          ? Monitor
          : GraduationCap;
  return (
    <div className={`course-cover ${course.accent} ${large ? 'large' : ''}`} aria-hidden="true">
      <span className="cover-grid" />
      <span className="cover-symbol">
        <Icon strokeWidth={1.3} />
      </span>
      <span className="cover-caption">BILIM / {course.category.toLocaleUpperCase('kk-KZ')}</span>
      <span className="cover-orbit orbit-one" />
      <span className="cover-orbit orbit-two" />
    </div>
  );
}
export function CourseCard({ course, progress }: { course: Course; progress?: number }) {
  return (
    <article className="course-card">
      <Link href={`/courses/${course.id}`} className="cover-link" aria-label={course.title}>
        <CourseCover course={course} />
      </Link>
      <div className="course-card-body">
        <div className="card-top">
          <span className="category-label">{course.category}</span>
          <span className="level">{course.level}</span>
        </div>
        <h3>
          <Link href={`/courses/${course.id}`}>{course.title}</Link>
        </h3>
        <p className="course-description">{course.description}</p>
        <div className="teacher-line">
          <span className="tiny-avatar">{course.teacher[0]}</span>
          {course.teacher}
        </div>
        <div className="card-footer">
          <span>
            <BookOpen size={15} />
            {course.lesson_count} сабақ
          </span>
          <strong className={course.price_kzt === 0 ? 'free' : ''}>
            {money(course.price_kzt)}
          </strong>
        </div>
        {progress !== undefined && (
          <div className="course-progress">
            <div className="between">
              <span>Оқу барысы</span>
              <b>{progress}%</b>
            </div>
            <progress value={progress} max={100} />
          </div>
        )}
      </div>
    </article>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <BookOpen size={28} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {href && (
        <Link className="button primary" href={href}>
          {label}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function Notice({ error, success }: { error?: string; success?: string }) {
  const errors: Record<string, string> = {
    registration: 'Атыңызды, дұрыс email және кемінде 12 таңбалы құпиясөзді енгізіңіз.',
    email: 'Бұл email арқылы тіркелу мүмкін болмады. Егер аккаунтыңыз болса, кіріңіз.',
    credentials: 'Email немесе құпиясөз дұрыс емес.',
    rate: 'Тым көп әрекет жасалды. Кейінірек қайталаңыз.',
    forbidden: 'Бұл әрекетті орындауға рұқсатыңыз жоқ.',
    bio: 'Өзіңіз туралы 20–3000 таңба жазыңыз.',
    invalid: 'Мәліметтерді тексеріп, қайта жіберіңіз.',
    courseform: 'Атау (5–140 таңба), сипаттама (30–5000 таңба), санат және дұрыс баға қажет.',
    lessonform: 'Сабақтың атауын, мәтінін немесе HTTPS бейнесілтемесін және ұзақтығын тексеріңіз.',
    emptycourse: 'Тексеруге жібермес бұрын кемінде бір сабақ қосыңыз.',
    readonly: 'Бұл нұсқа өңдеуге жабық. Курс тексерілуде немесе жарияланған.',
    payment: 'Төлем әлі қосылмаған. Қазір ақылы курсқа қолжетімділік сатылмайды.',
    course: 'Курс қолжетімсіз.',
    registrationclosed: 'Ашық тіркелу уақытша жабық. Университет әкімшісіне хабарласыңыз.',
    groupform: 'Топ атауын және оқу жылын (мысалы, 2026–2027) дұрыс толтырыңыз.',
    archivedgroup: 'Архивтелген топқа студенттер мен курстарды қосу жабық.',
    invite: 'Шақыру сілтемесі жарамсыз, мерзімі аяқталған немесе лимиті біткен.',
    studentonly: 'Бұл шақыру студент аккаунтына арналған.',
    userform: 'Аты-жөні, email, рөл және мәртебе дұрыс толтырылуы тиіс.',
    ownerprotected:
      'Бас әкімшіні бұғаттауға, рөлін төмендетуге немесе екінші бас әкімші қосуға болмайды.',
    ownership: 'Оқытушыда белсенді курстар немесе топтар бар. Алдымен оларды реттеңіз.',
  };
  const successes: Record<string, string> = {
    saved: 'Өзгерістер сақталды.',
    application: 'Өтінім әкімшіге жіберілді.',
    completed: 'Сабақ оқылған ретінде белгіленді.',
    invitecreated:
      'Шақыру жасалды. Сілтемені қазір көшіріп алыңыз: ол бұл бетте 10 минут көрсетіледі.',
    revoked: 'Шақыру сілтемесі өшірілді. Бұрын қосылған студенттер топта қалады.',
    joined: 'Оқу тобына қосылдыңыз. Тағайындалған тегін курстар кабинетіңізде ашылды.',
    removed: 'Топ мүшелігі өзгертілді. Оқу тарихы мен курсқа жазылу сақталды.',
    sessionsrevoked: 'Пайдаланушының барлық белсенді сессиялары аяқталды.',
  };
  if (error)
    return (
      <div className="notice error" role="alert">
        {errors[error] || errors.invalid}
      </div>
    );
  if (success)
    return (
      <div className="notice success" role="status">
        {successes[success] || successes.saved}
      </div>
    );
  return null;
}
export const statusLabel: Record<string, string> = {
  draft: 'Жоба',
  submitted: 'Тексерілуде',
  published: 'Жарияланған',
  pending: 'Қарастырылуда',
  approved: 'Мақұлданған',
  rejected: 'Қайтарылған',
  archived: 'Архивте',
  active: 'Белсенді',
  blocked: 'Бұғатталған',
};
