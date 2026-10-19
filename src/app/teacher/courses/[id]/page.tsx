import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye, Plus, Send } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { courseLessons, getCourse } from '@/lib/courses';
import { addSection, saveLesson, submitCourse } from '@/app/actions';
import { Notice, PageHeading, statusLabel } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
export default async function CourseEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string; lesson?: string }>;
}) {
  const user = await requireRole('teacher', 'admin');
  const { id } = await params;
  const query = await searchParams;
  const course = getCourse(id);
  if (!course || (course.owner_id !== user.id && user.role !== 'admin')) notFound();
  const sections = all<{ id: string; title: string }>(
    'SELECT id, title FROM sections WHERE course_id = ? ORDER BY position',
    id,
  );
  const lessons = courseLessons(id);
  const editing = query.lesson ? lessons.find((l) => l.id === query.lesson) : undefined;
  const writable = course.status === 'draft';
  return (
    <>
      <PageHeading
        eyebrow="РЕДАКТОР"
        title={course.title}
        description={`Күйі: ${statusLabel[course.status]}`}
      >
        <Link className="button outline" href={`/courses/${id}`}>
          <Eye size={17} />
          Алдын ала көру
        </Link>
      </PageHeading>
      <Notice error={query.error} success={query.success} />
      {!writable && (
        <div className="notice">
          Курс тексерілуде немесе жарияланған. Осы нұсқада жарияланған материалды өзгерту жабық.
        </div>
      )}
      <div className="editor-grid">
        <div className="panel">
          <h2>Курс құрылымы</h2>
          {sections.map((section) => (
            <div className="editor-section" key={section.id}>
              <h3>{section.title}</h3>
              {lessons
                .filter((l) => l.section_id === section.id)
                .map((lesson) => (
                  <Link
                    className="editor-lesson"
                    href={
                      writable
                        ? `/teacher/courses/${id}?lesson=${lesson.id}`
                        : `/learn/${lesson.id}`
                    }
                    key={lesson.id}
                  >
                    <span>{lesson.video_url ? '▶' : '≡'}</span>
                    {lesson.title}
                    <small>{writable ? 'Өңдеу' : 'Көру'}</small>
                  </Link>
                ))}
              {!lessons.some((l) => l.section_id === section.id) && (
                <p className="help-text">Бұл бөлімге сабақ қосылмаған.</p>
              )}
            </div>
          ))}
          {writable && (
            <>
              <form action={addSection} className="form-stack compact-form">
                <input type="hidden" name="courseId" value={id} />
                <label>
                  Жаңа бөлім
                  <input name="title" required minLength={2} maxLength={140} />
                </label>
                <SubmitButton className="button outline">
                  <Plus size={16} />
                  Бөлім қосу
                </SubmitButton>
              </form>
              <form action={submitCourse} className="publish-form">
                <input type="hidden" name="courseId" value={id} />
                <SubmitButton>
                  <Send size={16} />
                  Тексеруге жіберу
                </SubmitButton>
                <p className="help-text">Курс әкімші мақұлдағаннан кейін каталогта пайда болады.</p>
              </form>
            </>
          )}
        </div>
        {writable && (
          <div className="panel">
            <div className="between">
              <h2>{editing ? 'Сабақты өңдеу' : 'Сабақ қосу'}</h2>
              {editing && (
                <Link className="text-link" href={`/teacher/courses/${id}`}>
                  Жаңа сабақ
                </Link>
              )}
            </div>
            <form action={saveLesson} className="form-stack" key={editing?.id || 'new'}>
              <input type="hidden" name="courseId" value={id} />
              <input type="hidden" name="lessonId" value={editing?.id || ''} />
              <label>
                Бөлім
                <select name="sectionId" defaultValue={editing?.section_id}>
                  {sections.map((section) => (
                    <option value={section.id} key={section.id}>
                      {section.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Сабақ атауы
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={180}
                  defaultValue={editing?.title}
                />
              </label>
              <label>
                Сабақ мәтіні
                <textarea
                  name="body"
                  rows={9}
                  maxLength={30000}
                  defaultValue={editing?.body}
                  placeholder="Түсіндірме, мысалдар және негізгі ойлар…"
                />
              </label>
              <label>
                Бейнефайлға HTTPS сілтеме
                <input
                  name="videoUrl"
                  type="url"
                  defaultValue={editing?.video_url}
                  placeholder="https://…/lesson.mp4"
                />
                <small>
                  Қазір тікелей бейнефайл сілтемесі қолданылады. Файл жүктеу және бейнехостинг
                  келесі кезеңде қосылады.
                </small>
              </label>
              <label>
                Ұзақтығы, минут
                <input
                  name="minutes"
                  type="number"
                  min={1}
                  max={600}
                  required
                  defaultValue={editing?.duration_minutes || 10}
                />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="preview" defaultChecked={!!editing?.is_preview} />
                Танысу үшін ашық сабақ
              </label>
              <SubmitButton>{editing ? 'Өзгерістерді сақтау' : 'Сабақты сақтау'}</SubmitButton>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
