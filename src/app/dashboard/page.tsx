import Link from 'next/link';
import { BookOpen, CheckCircle2, ArrowUpRight, Play } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { courseLessons, getCourse, type Course } from '@/lib/courses';
import { CourseCard, EmptyState, Notice, PageHeading } from '@/components/ui';
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;
  const ids = await all<{
    course_id: string;
  }>('SELECT course_id FROM enrollments WHERE user_id = ? ORDER BY created_at DESC', user.id);
  const courses = (
    await Promise.all(ids.map(async (row) => await getCourse(row.course_id)))
  ).filter((c): c is Course => !!c && c.status === 'published');
  const complete = (await one<{
    n: number;
  }>(
    'SELECT COUNT(*) n FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL',
    user.id,
  ))!.n;
  const completedByCourse = new Map(
    (
      await all<{
        course_id: string;
        n: number;
      }>(
        `SELECT s.course_id,COUNT(*) n FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id JOIN sections s ON s.id=l.section_id WHERE p.user_id=? AND p.completed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id) GROUP BY s.course_id`,
        user.id,
      )
    ).map((row) => [row.course_id, row.n]),
  );
  const progress = (course: Course) =>
    Math.min(
      100,
      Math.round(
        (100 * (completedByCourse.get(course.id) || 0)) / Math.max(1, course.lesson_count),
      ),
    );
  const resumeCourse = courses.find((course) => progress(course) < 100) || courses[0];
  const completedIds = new Set(
    (
      await all<{
        lesson_id: string;
      }>(
        'SELECT lesson_id FROM lesson_progress WHERE user_id=? AND completed_at IS NOT NULL',
        user.id,
      )
    ).map((row) => row.lesson_id),
  );
  const resumeLessons = resumeCourse ? await courseLessons(resumeCourse.id) : [];
  const resumeLesson =
    resumeLessons.find((lesson) => !completedIds.has(lesson.id)) || resumeLessons[0];
  return (
    <>
      <PageHeading
        eyebrow="ЖЕКЕ КАБИНЕТ"
        title={`Сәлем, ${user.name.split(' ')[0]}!`}
        description="Бүгін де жаңа білімге бір қадам жасаңыз."
      >
        <Link href="/courses" className="button outline">
          Курс таңдау <ArrowUpRight size={16} />
        </Link>
      </PageHeading>
      <Notice error={error} />
      {resumeCourse && resumeLesson && (
        <section className="resume-learning" aria-label="Оқуды жалғастыру">
          <span className="resume-kicker">
            <BookOpen size={17} />
            ОҚУДЫ ЖАЛҒАСТЫРУ
          </span>
          <h2>{resumeLesson.title}</h2>
          <p>{resumeCourse.title}</p>
          <div className="resume-progress">
            <span>Курс барысы</span>
            <strong>{progress(resumeCourse)}%</strong>
            <progress value={progress(resumeCourse)} max={100} />
          </div>
          <Link href={`/learn/${resumeLesson.id}`} className="button primary">
            <Play size={18} />
            {progress(resumeCourse) === 100 ? 'Дәрістерді қайталау' : 'Дәрісті жалғастыру'}
            <ArrowUpRight size={17} />
          </Link>
        </section>
      )}
      <div className="stats-grid learning-stats">
        <div className="stat-card">
          <BookOpen />
          <span>Менің курстарым</span>
          <strong>{courses.length}</strong>
        </div>
        <div className="stat-card">
          <CheckCircle2 />
          <span>Оқылған сабақтар</span>
          <strong>{complete}</strong>
        </div>
      </div>
      <div className="section-title">
        <div>
          <h2>Менің оқуым</h2>
          <p>Жазылған курстарыңыз және оқу барысы.</p>
        </div>
      </div>
      {courses.length ? (
        <div className="course-grid">
          {courses.map((course) => (
            <CourseCard course={course} progress={progress(course)} key={course.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Алғашқы курсыңызды таңдаңыз"
          description="Каталогтан курсқа жазылып, оқуды бастай аласыз."
          href="/courses"
          label="Курстарды көру"
        />
      )}
    </>
  );
}
