import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { courseLessons, getCourse, type Lesson } from '@/lib/courses';
import { completeLesson } from '@/app/actions';
import { CourseCover, Notice } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { VideoPlayer } from '@/components/video-player';
import { listMaterials } from '@/lib/materials';
import { DocumentMaterials } from '@/components/document-materials';
import { lectureCoverPresentation } from '@/lib/course-covers';
import { MobileDisclosure } from '@/components/mobile-disclosure';
import { LessonQuiz } from '@/components/lesson-quiz';
import { PythonPractice } from '@/components/python-practice';
import { lessonPractice } from '@/lib/practices';
import { hasLessonVideo } from '@/lib/lesson-videos';
import { LessonStages } from '@/components/lesson-stages';
import { LectureText } from '@/components/lecture-text';
import { videoPosition } from '@/lib/video-progress';
export default async function Learn({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    success?: string;
    quizError?: string;
    quizSaved?: string;
    preview?: string;
  }>;
}) {
  const { id } = await params;
  const lesson = await one<Lesson>(
    "SELECT l.*, s.course_id, s.title AS section_title, COALESCE(d.summary,'') summary, COALESCE(d.objectives,'') objectives FROM lessons l JOIN sections s ON s.id = l.section_id LEFT JOIN lesson_details d ON d.lesson_id=l.id WHERE l.id = ?",
    id,
  );
  if (!lesson) notFound();
  if (await one('SELECT section_id FROM section_trash WHERE section_id=?', lesson.section_id))
    notFound();
  const course = (await getCourse(lesson.course_id))!;
  const user = await currentUser();
  const owner = !!user && (course.owner_id === user.id || user.role === 'admin');
  const query = await searchParams;
  const previewMode = owner && query.preview === 'student';
  if (course.status !== 'published' && !owner) notFound();
  const enrolled =
    !!user &&
    !!(await one(
      'SELECT user_id FROM enrollments WHERE course_id = ? AND user_id = ?',
      course.id,
      user.id,
    ));
  const lessons = await courseLessons(course.id);
  const index = lessons.findIndex((item) => item.id === id);
  const next = lessons[index + 1];
  const previous = lessons[index - 1];
  const done =
    !!user &&
    !!(await one(
      'SELECT lesson_id FROM lesson_progress WHERE user_id = ? AND lesson_id = ? AND completed_at IS NOT NULL',
      user.id,
      id,
    ));
  const [materials, practice, storedVideo, quizExists] = await Promise.all([
    listMaterials(id, user?.id),
    lessonPractice(id, user?.id),
    hasLessonVideo(id),
    one('SELECT lesson_id FROM lesson_quizzes WHERE lesson_id=?', id),
  ]);
  const videoSrc = storedVideo ? `/learn/${id}/video` : lesson.video_url;
  const resume =
    videoSrc && enrolled && user && !previewMode && course.status === 'published'
      ? { lessonId: id, initialPosition: await videoPosition(user.id, id) }
      : undefined;
  const body = <LectureText text={lesson.body} />;
  return (
    <>
      <Link className="back-link" href={`/courses/${course.id}`}>
        <ArrowLeft size={16} />
        {course.title}
      </Link>
      <div className="learning-grid student-reading">
        <article>
          <span className="eyebrow">
            {lesson.section_title} · {index + 1}/{lessons.length} САБАҚ
          </span>
          <h1 className="detail-title">{lesson.title}</h1>
          <p className="lesson-teacher">Оқытушы: {course.teacher}</p>
          {previewMode && (
            <div className="lesson-access-note">
              <strong>Оқушы көрінісі</strong>
              <p>
                Материалдарды студентке арналған тәртіппен көріп отырсыз. Бұл режимде жауаптар мен
                оқу барысы сақталмайды.
              </p>
              <Link
                className="text-link"
                href={`/teacher/courses/${course.id}?lesson=${id}#lesson-editor`}
              >
                Редакторға оралу →
              </Link>
            </div>
          )}
          {owner && !previewMode && (
            <Link
              className="text-link lesson-edit-link"
              href={`/teacher/courses/${course.id}?lesson=${id}#lesson-editor`}
            >
              Дәрісті өңдеу →
            </Link>
          )}
          <Notice {...await searchParams} />
          {!videoSrc && !materials.length && (
            <div className="lecture-header-cover">
              <CourseCover course={{ ...course, ...(await lectureCoverPresentation(id)) }} large />
            </div>
          )}
          {lesson.summary && <p className="lecture-summary">{lesson.summary}</p>}
          {lesson.objectives && (
            <details className="panel lecture-objectives">
              <summary>Оқу мақсаттары</summary>
              <ul>
                {lesson.objectives
                  .split('\n')
                  .filter(Boolean)
                  .map((goal, i) => (
                    <li key={i}>{goal}</li>
                  ))}
              </ul>
            </details>
          )}
          {!enrolled && !owner && (
            <div className="lesson-access-note">
              <strong>Бұл — ашық дәріс.</strong>
              <p>
                Дәрістерді кез келген ретпен оқи аласыз. Тест нәтижелері мен оқу барысын сақтау үшін
                курсқа жазылыңыз.
              </p>
              <Link className="text-link" href={`/courses/${course.id}`}>
                Курсқа өту және жазылу →
              </Link>
            </div>
          )}
          <LessonStages
            key={id}
            lesson={
              <>
                {videoSrc && <VideoPlayer key={id} src={videoSrc} progress={resume} />}
                <DocumentMaterials materials={materials} />
                {materials.length ? (
                  <details className="panel lesson-overview">
                    <summary>Дәрістің мәтіндік нұсқасы</summary>
                    <div className="lesson-body">{body}</div>
                  </details>
                ) : (
                  <div className="panel lesson-body">{body}</div>
                )}
              </>
            }
            practice={
              practice ? <PythonPractice key={id} lessonId={id} practice={practice} /> : undefined
            }
            quiz={
              quizExists ? (
                <LessonQuiz
                  lessonId={id}
                  userId={user?.id}
                  enrolled={enrolled && !previewMode}
                  preview={previewMode}
                  error={query.quizError}
                  saved={query.quizSaved}
                />
              ) : undefined
            }
          />
          <div className="lesson-actions">
            {previewMode ? (
              <p className="help-text">Оқушы көрінісі · оқу барысын белгілеу өшірілген.</p>
            ) : enrolled ? (
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
                Оқу барысын сақтау
              </Link>
            )}
            {next && (
              <Link
                href={`/learn/${next.id}${previewMode ? '?preview=student' : ''}`}
                className="button outline"
              >
                Келесі сабақ <ArrowRight size={16} />
              </Link>
            )}
            {previous && (
              <Link
                href={`/learn/${previous.id}${previewMode ? '?preview=student' : ''}`}
                className="button outline"
              >
                <ArrowLeft size={16} />
                Алдыңғы сабақ
              </Link>
            )}
          </div>
        </article>
        <aside className="panel learning-sidebar">
          <MobileDisclosure
            title="Курс сабақтары"
            summary={`${index + 1} / ${lessons.length} сабақ`}
            desktopHeading
            className="lesson-outline"
          >
            {lessons.map((item, i) => (
              <Link
                key={item.id}
                className={`lesson-nav ${item.id === id ? 'selected' : ''}`}
                href={`/learn/${item.id}${previewMode ? '?preview=student' : ''}`}
              >
                <span>{i + 1}</span>
                {item.title}
              </Link>
            ))}
          </MobileDisclosure>
        </aside>
      </div>
    </>
  );
}
