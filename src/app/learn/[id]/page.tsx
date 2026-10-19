import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { courseLessons, getCourse, type Lesson } from '@/lib/courses';
import { completeLesson } from '@/app/actions';
import { Notice } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { VideoPlayer } from '@/components/video-player';
export default async function Learn({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id } = await params;
  const lesson = one<Lesson>(
    'SELECT l.*, s.course_id, s.title AS section_title FROM lessons l JOIN sections s ON s.id = l.section_id WHERE l.id = ?',
    id,
  );
  if (!lesson) notFound();
  const course = getCourse(lesson.course_id)!;
  const user = await currentUser();
  const owner = !!user && (course.owner_id === user.id || user.role === 'admin');
  if (course.status !== 'published' && !owner) notFound();
  const enrolled =
    !!user &&
    !!one(
      'SELECT user_id FROM enrollments WHERE course_id = ? AND user_id = ?',
      course.id,
      user.id,
    );
  if (!owner && !enrolled && !lesson.is_preview)
    return (
      <div className="empty-state">
        <LockKeyhole size={32} />
        <h1>Бұл сабаққа жазылу қажет</h1>
        <p>Курс бетінде қолжетімділік шарттарын қараңыз.</p>
        <Link href={`/courses/${course.id}`} className="button primary">
          Курсқа өту
        </Link>
      </div>
    );
  const lessons = courseLessons(course.id);
  const index = lessons.findIndex((item) => item.id === id);
  const next = lessons[index + 1];
  const done =
    !!user &&
    !!one(
      'SELECT lesson_id FROM lesson_progress WHERE user_id = ? AND lesson_id = ? AND completed_at IS NOT NULL',
      user.id,
      id,
    );
  return (
    <>
      <Link className="back-link" href={`/courses/${course.id}`}>
        <ArrowLeft size={16} />
        {course.title}
      </Link>
      <div className="learning-grid">
        <article>
          <span className="eyebrow">
            {lesson.section_title} · {index + 1}/{lessons.length} САБАҚ
          </span>
          <h1 className="detail-title">{lesson.title}</h1>
          <Notice {...await searchParams} />
          {lesson.video_url && <VideoPlayer src={lesson.video_url} />}
          <div className="panel lesson-body">
            {lesson.body
              .split('\n\n')
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
          </div>
          <div className="lesson-actions">
            {enrolled ? (
              done ? (
                <span className="complete-label">
                  <CheckCircle2 size={19} />
                  Оқылған деп белгіленді
                </span>
              ) : (
                <form action={completeLesson}>
                  <input type="hidden" name="lessonId" value={id} />
                  <SubmitButton>Оқып шықтым ✓</SubmitButton>
                  <p className="help-text">Бұл — қолмен белгілеу, білімді бағалау емес.</p>
                </form>
              )
            ) : (
              <Link href={`/courses/${course.id}`} className="button primary">
                Курсқа жазылу
              </Link>
            )}
            {next && (enrolled || owner || next.is_preview) && (
              <Link href={`/learn/${next.id}`} className="button outline">
                Келесі сабақ <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </article>
        <aside className="panel learning-sidebar">
          <h3>Курс сабақтары</h3>
          {lessons.map((item, i) =>
            enrolled || owner || item.is_preview ? (
              <Link
                key={item.id}
                className={`lesson-nav ${item.id === id ? 'selected' : ''}`}
                href={`/learn/${item.id}`}
              >
                <span>{i + 1}</span>
                {item.title}
              </Link>
            ) : (
              <div className="lesson-nav muted" key={item.id}>
                <LockKeyhole size={15} />
                {item.title}
              </div>
            ),
          )}
        </aside>
      </div>
    </>
  );
}
