import Link from 'next/link';
import { ArrowUpRight, BookOpen, FileText, Pencil, Plus, LayoutDashboard } from 'lucide-react';
import { teachingProfileCourses } from '@/lib/teaching-profile';
import { statusLabel } from './ui';
export async function TeachingProfile({ userId, admin }: { userId: string; admin: boolean }) {
  const items = await teachingProfileCourses(userId);
  return (
    <section className="profile-teaching">
      <div className="profile-section-heading">
        <BookOpen size={21} />
        <h2>Менің курстарым мен дәрістерім</h2>
      </div>
      <p className="profile-caption">
        Автор ретінде жариялаған және дайындап жатқан материалдарыңыз.
      </p>
      {items.length ? (
        items.map(({ course, lessons }) => (
          <article className="panel profile-teaching-course" key={course.id}>
            <div className="between">
              <span className="category-label">{course.category}</span>
              <span className={`status-badge ${course.status}`}>{statusLabel[course.status]}</span>
            </div>
            <h3>
              <Link href={`/courses/${course.id}`}>{course.title}</Link>
            </h3>
            <p>{lessons.length} дәріс</p>
            <div className="profile-teaching-lessons">
              {lessons.map((l) => (
                <div className="profile-teaching-lesson" key={l.id}>
                  <FileText size={17} />
                  <Link href={`/learn/${l.id}`}>
                    {l.title}
                    <small>{l.duration_minutes} мин · Дәрісті ашу</small>
                  </Link>
                  <Link
                    className="button outline tiny"
                    href={`/teacher/courses/${course.id}?tab=lecture&lesson=${l.id}`}
                    aria-label={`${l.title} — өңдеу`}
                  >
                    <Pencil size={15} />
                  </Link>
                </div>
              ))}
            </div>
            <Link className="text-link" href={`/teacher/courses/${course.id}`}>
              <Pencil size={15} />
              Курс редакторы
              <ArrowUpRight size={15} />
            </Link>
          </article>
        ))
      ) : (
        <div className="panel">
          <h3>Әзірге курс жоқ</h3>
          <p className="help-text">
            Жаңа курс жасап, дәрістеріңізді қосыңыз. Жасырылған курстар оқытушы кабинетінде қалады.
          </p>
          <Link className="button outline" href="/teacher/new">
            <Plus size={17} />
            Курс жасау
          </Link>
        </div>
      )}
      <div className="profile-teaching-actions">
        <Link href="/teacher" className="button outline">
          <BookOpen size={16} />
          Барлық материалдар
        </Link>
        {admin ? (
          <Link href="/admin" className="button outline">
            <LayoutDashboard size={16} />
            Басқару тақтасы
          </Link>
        ) : (
          <Link href="/teacher/groups" className="button outline">
            Оқу топтары
            <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
    </section>
  );
}
