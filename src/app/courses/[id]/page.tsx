import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen, Clock3, CheckCircle2, LockKeyhole, PlayCircle } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { courseLessons, getCourse, money } from '@/lib/courses';
import { one } from '@/lib/db';
import { enroll } from '@/app/actions';
import { CourseCover, Notice } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const course = getCourse(id);
  const user = await currentUser();
  if (
    !course ||
    (course.status !== 'published' && user?.id !== course.owner_id && user?.role !== 'admin')
  )
    notFound();
  const lessons = courseLessons(id);
  const enrolled =
    !!user &&
    !!one('SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?', user.id, id);
  const owner = !!user && (user.id === course.owner_id || user.role === 'admin');
  const accessible = enrolled || owner;
  const first =
    lessons.find(
      (lesson) =>
        !user ||
        !one(
          'SELECT lesson_id FROM lesson_progress WHERE user_id = ? AND lesson_id = ? AND completed_at IS NOT NULL',
          user.id,
          lesson.id,
        ),
    ) || lessons[0];
  return (
    <>
      <Link className="back-link" href="/courses">
        <ArrowLeft size={16} />
        Курстар каталогы
      </Link>
      <Notice {...await searchParams} />
      {course.status !== 'published' && (
        <div className="notice">Бұл — жарияланбаған курстың алдын ала көрінісі.</div>
      )}
      <div className="course-detail-grid">
        <div>
          <span className="eyebrow">
            {course.category} · {course.level}
          </span>
          <h1 className="detail-title">{course.title}</h1>
          <p className="detail-description">{course.description}</p>
          <div className="detail-meta">
            <span className="teacher-line">
              <span className="tiny-avatar">{course.teacher[0]}</span>
              {course.teacher}
            </span>
            <span>
              <BookOpen size={16} />
              {lessons.length} сабақ
            </span>
            <span>
              <Clock3 size={16} />
              {lessons.reduce((n, l) => n + l.duration_minutes, 0)} мин
            </span>
          </div>
          <div className="course-program">
            <h2>Курс бағдарламасы</h2>
            {[...new Set(lessons.map((l) => l.section_id))].map((section) => (
              <div className="program-section" key={section}>
                <h3>{lessons.find((l) => l.section_id === section)!.section_title}</h3>
                {lessons
                  .filter((l) => l.section_id === section)
                  .map((lesson, i) => {
                    const canOpen =
                      accessible || (course.status === 'published' && !!lesson.is_preview);
                    const done =
                      !!user &&
                      !!one(
                        'SELECT lesson_id FROM lesson_progress WHERE user_id = ? AND lesson_id = ? AND completed_at IS NOT NULL',
                        user.id,
                        lesson.id,
                      );
                    const content = (
                      <>
                        <span className={`lesson-number ${done ? 'done' : ''}`}>
                          {done ? <CheckCircle2 size={17} /> : String(i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <strong>{lesson.title}</strong>
                          <span>
                            {lesson.duration_minutes} мин{lesson.is_preview ? ' · Ашық сабақ' : ''}
                          </span>
                        </div>
                        {canOpen ? <PlayCircle size={20} /> : <LockKeyhole size={18} />}
                      </>
                    );
                    return canOpen ? (
                      <Link className="program-lesson" key={lesson.id} href={`/learn/${lesson.id}`}>
                        {content}
                      </Link>
                    ) : (
                      <div className="program-lesson locked" key={lesson.id}>
                        {content}
                      </div>
                    );
                  })}
              </div>
            ))}
            {!lessons.length && <p className="muted">Сабақтар әлі қосылмаған.</p>}
          </div>
        </div>
        <aside className="panel enrollment-panel">
          <CourseCover course={course} large />
          <div className="enrollment-content">
            <span className="eyebrow">КУРСҚА ҚОЛЖЕТІМДІЛІК</span>
            <strong className="price">{money(course.price_kzt)}</strong>
            {accessible && first ? (
              <Link className="button primary full-width" href={`/learn/${first.id}`}>
                Оқуды жалғастыру →
              </Link>
            ) : course.status !== 'published' ? (
              <p className="help-text">Курс жарияланғаннан кейін жазылуға болады.</p>
            ) : !user ? (
              <Link href="/login" className="button primary full-width">
                Кіру және жазылу →
              </Link>
            ) : course.price_kzt === 0 ? (
              <form action={enroll}>
                <input type="hidden" name="courseId" value={course.id} />
                <SubmitButton className="button primary full-width">
                  Курсқа тегін жазылу →
                </SubmitButton>
              </form>
            ) : (
              <div className="notice">
                Төлем қызметі әзірге қосылмаған. Бұл курс сатылымға ашылмайды.
              </div>
            )}
            <ul className="included">
              <li>
                <CheckCircle2 size={16} />
                Жеке кабинеттегі оқу барысы
              </li>
              <li>
                <CheckCircle2 size={16} />
                Компьютер мен телефоннан оқу
              </li>
              <li>
                <CheckCircle2 size={16} />
                Қазақ тіліндегі оқу кеңістігі
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
