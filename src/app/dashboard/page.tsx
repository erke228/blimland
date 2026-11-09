import Link from 'next/link';
import { BookOpen, CheckCircle2, ArrowUpRight, Play } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { all } from '@/lib/db';
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
  const assessments = await all<{
    id: string;
    lesson_id: string;
    title: string;
    points: number;
    max_points: number;
    status: string;
  }>(
    `SELECT a.id,a.lesson_id,l.title,a.points,a.max_points,a.status
      FROM quiz_attempts a JOIN lessons l ON l.id=a.lesson_id
      JOIN sections s ON s.id=l.section_id JOIN courses c ON c.id=s.course_id
      WHERE a.user_id=? AND c.status='published'
        AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id)
        AND NOT EXISTS (
          SELECT 1 FROM quiz_attempts newer
          WHERE newer.user_id=a.user_id AND newer.lesson_id=a.lesson_id
            AND (newer.submitted_at>a.submitted_at
              OR (newer.submitted_at=a.submitted_at AND newer.id>a.id))
        )
      ORDER BY a.submitted_at DESC,a.id DESC LIMIT 10`,
    user.id,
  );
  const ids = await all<{
    course_id: string;
  }>('SELECT course_id FROM enrollments WHERE user_id = ? ORDER BY created_at DESC', user.id);
  const courses = (
    await Promise.all(ids.map(async (row) => await getCourse(row.course_id)))
  ).filter((c): c is Course => !!c && c.status === 'published');
  const completed = await all<{ course_id: string; lesson_id: string }>(
    `SELECT s.course_id,p.lesson_id FROM lesson_progress p
      JOIN lessons l ON l.id=p.lesson_id JOIN sections s ON s.id=l.section_id
      JOIN courses c ON c.id=s.course_id
      JOIN enrollments e ON e.course_id=c.id AND e.user_id=p.user_id
      WHERE p.user_id=? AND p.completed_at IS NOT NULL AND c.status='published'
        AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=s.id)`,
    user.id,
  );
  const completedByCourse = new Map<string, number>();
  for (const { course_id } of completed)
    completedByCourse.set(course_id, (completedByCourse.get(course_id) || 0) + 1);
  const completedCount = (course: Course) => completedByCourse.get(course.id) || 0;
  const progress = (course: Course) => {
    if (!course.lesson_count) return 0;
    const count = completedCount(course);
    return count >= course.lesson_count
      ? 100
      : Math.min(99, Math.round((100 * count) / course.lesson_count));
  };
  const availableCourses = courses.filter((course) => course.lesson_count > 0);
  const resumeCourse =
    availableCourses.find((course) => completedCount(course) < course.lesson_count) ||
    availableCourses[0];
  const completedIds = new Set(completed.map((row) => row.lesson_id));
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
            <progress
              aria-label={`${resumeCourse.title} — оқу барысы`}
              value={progress(resumeCourse)}
              max={100}
            />
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
          <strong>{completed.length}</strong>
        </div>
      </div>
      <div className="section-title">
        <div>
          <h2>Менің оқуым</h2>
          <p>Жазылған курстарыңыз және оқу барысы.</p>
        </div>
      </div>
      {!!assessments.length && (
        <section className="panel">
          <h2>Соңғы тест нәтижелері</h2>
          {assessments.map((a) => (
            <p key={a.id}>
              <Link className="text-link" href={`/learn/${a.lesson_id}#knowledge-check`}>
                {a.title}
              </Link>{' '}
              · {a.points}/{a.max_points} ·{' '}
              {a.status === 'awaiting_review' ? 'Тексеру күтілуде' : 'Бағаланған'}
            </p>
          ))}
        </section>
      )}
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
