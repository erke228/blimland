import Link from 'next/link';
import { BookOpen, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { all, one } from '@/lib/db';
import { getCourse, type Course } from '@/lib/courses';
import { CourseCard, EmptyState, Notice, PageHeading } from '@/components/ui';
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;
  const ids = all<{ course_id: string }>(
    'SELECT course_id FROM enrollments WHERE user_id = ? ORDER BY created_at DESC',
    user.id,
  );
  const courses = ids
    .map((row) => getCourse(row.course_id))
    .filter((c): c is Course => !!c && c.status === 'published');
  const complete = one<{ n: number }>(
    'SELECT COUNT(*) n FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL',
    user.id,
  )!.n;
  const progress = (course: Course) =>
    Math.min(
      100,
      Math.round(
        (100 *
          one<{ n: number }>(
            `SELECT COUNT(*) n FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN sections s ON s.id = l.section_id WHERE p.user_id = ? AND s.course_id = ? AND p.completed_at IS NOT NULL`,
            user.id,
            course.id,
          )!.n) /
          Math.max(1, course.lesson_count),
      ),
    );
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
          description="Каталогтан тегін курсқа жазылып, оқуды бастай аласыз."
          href="/courses"
          label="Курстарды көру"
        />
      )}
    </>
  );
}
