import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye, Plus, Send, Pencil, BookOpen } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { courseLessons, getCourse } from '@/lib/courses';
import {
  addSection,
  saveLesson,
  submitCourse,
  saveCourseDetails,
  selectCourseCover,
  reopenCourseForEditing,
  updateSection,
} from '@/app/actions';
import { CourseCover, Notice, PageHeading, statusLabel } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { MaterialEditor } from '@/components/material-editor';
import { CourseFields } from '@/components/course-fields';
import { CoverPicker } from '@/components/cover-picker';
import { LectureCoverEditor } from '@/components/lecture-cover-editor';
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
  const sections = all<{ id: string; title: string; position: number }>(
    'SELECT id,title,position FROM sections WHERE course_id=? ORDER BY position,id',
    id,
  );
  const lessons = courseLessons(id);
  const editing = query.lesson ? lessons.find((l) => l.id === query.lesson) : undefined;
  const writable = course.status === 'draft';
  const archived = course.status === 'archived';
  return (
    <>
      <PageHeading
        eyebrow="ДӘРІСТЕР РЕДАКТОРЫ"
        title={course.title}
        description={`Күйі: ${statusLabel[course.status]} · ${lessons.length} дәріс`}
      >
        <Link className="button outline" href={`/courses/${id}`}>
          <Eye size={17} />
          Алдын ала көру
        </Link>
      </PageHeading>
      <Notice error={query.error} success={query.success} />
      <nav className="workspace-tabs" aria-label="Редактор бөлімдері">
        <a href="#structure">Құрылым</a>
        <a href="#lesson-editor">Дәріс мазмұны</a>
        <a href="#cover">Мұқаба</a>
        <a href="#settings">Курс параметрлері</a>
      </nav>
      {!writable && (
        <div className="panel editor-status">
          <div>
            <h2>{archived ? 'Курс архивте' : 'Жарияланған нұсқа қорғалған'}</h2>
            <p>
              {archived
                ? 'Архивтен қайтару бас әкімшінің курстарды басқару бөлімінде орындалады.'
                : 'Мазмұнды өзгерту үшін курс жобаға қайтарылады. Ол қайта мақұлданғанша студенттерге ашылмайды. Оқу тарихы сақталады. Мұқабаны бірден өзгерте аласыз.'}
            </p>
          </div>
          {!archived && (
            <form action={reopenCourseForEditing}>
              <input type="hidden" name="courseId" value={id} />
              <SubmitButton className="button outline">
                <Pencil size={16} />
                Өңдеуге ашу
              </SubmitButton>
            </form>
          )}
        </div>
      )}
      <div className="editor-grid">
        <aside className="panel editor-structure" id="structure">
          <div className="between">
            <h2>Курс құрылымы</h2>
            <span className="count-pill">{lessons.length}</span>
          </div>
          {sections.map((section, index) => (
            <div className="editor-section" key={section.id}>
              <h3>
                {index + 1}. {section.title}
              </h3>
              {writable && (
                <details className="section-settings">
                  <summary>Бөлім параметрлері</summary>
                  <form action={updateSection} className="form-stack compact-form">
                    <input type="hidden" name="courseId" value={id} />
                    <input type="hidden" name="sectionId" value={section.id} />
                    <label>
                      Бөлім атауы
                      <input
                        name="title"
                        required
                        minLength={2}
                        maxLength={140}
                        defaultValue={section.title}
                      />
                    </label>
                    <label>
                      Бөлім реті
                      <input
                        name="position"
                        type="number"
                        min={1}
                        max={sections.length}
                        required
                        defaultValue={index + 1}
                      />
                    </label>
                    <SubmitButton className="button outline tiny">Бөлімді сақтау</SubmitButton>
                  </form>
                </details>
              )}
              {lessons
                .filter((l) => l.section_id === section.id)
                .map((lesson) => (
                  <Link
                    className={`editor-lesson ${editing?.id === lesson.id ? 'selected' : ''}`}
                    href={`/teacher/courses/${id}?lesson=${lesson.id}#lesson-editor`}
                    key={lesson.id}
                  >
                    <BookOpen size={16} />
                    <span>{lesson.title}</span>
                    <small>{writable ? 'Өңдеу' : 'Көру'}</small>
                  </Link>
                ))}
              {!lessons.some((l) => l.section_id === section.id) && (
                <p className="help-text">Бұл бөлімге дәріс қосылмаған.</p>
              )}
            </div>
          ))}
          {writable && (
            <>
              <Link
                className="button outline full-width"
                href={`/teacher/courses/${id}#lesson-editor`}
              >
                <Plus size={16} />
                Жаңа дәріс
              </Link>
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
                <p className="help-text">
                  Әр дәрісте мәтін, бейне немесе құжат болуы тиіс. Мақұлданған курс басты бетте
                  көрсетіледі.
                </p>
              </form>
            </>
          )}
        </aside>
        <div className="editor-main">
          <section className="panel" id="lesson-editor">
            <div className="between">
              <div>
                <span className="eyebrow">ДӘРІС МАЗМҰНЫ</span>
                <h2>{editing ? 'Дәрісті өңдеу' : 'Жаңа дәріс қосу'}</h2>
              </div>
              {editing && (
                <Link className="text-link" href={`/learn/${editing.id}`}>
                  <Eye size={16} />
                  Дәрісті ашу
                </Link>
              )}
            </div>
            {writable ? (
              <>
                <p className="help-text">
                  1. Мәліметтерді толтырыңыз → 2. Сақтаңыз → 3. PDF немесе Word жүктеңіз.
                </p>
                <form action={saveLesson} className="form-stack" key={editing?.id || 'new'}>
                  <input type="hidden" name="courseId" value={id} />
                  <input type="hidden" name="lessonId" value={editing?.id || ''} />
                  <label>
                    Дәріс атауы
                    <input
                      name="title"
                      required
                      minLength={3}
                      maxLength={180}
                      defaultValue={editing?.title}
                      placeholder="Мысалы: 1-дәріс. Тақырып атауы"
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Бөлім
                      <select name="sectionId" defaultValue={editing?.section_id}>
                        {sections.map((s) => (
                          <option value={s.id} key={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Бөлім ішіндегі реті
                      <input
                        name="position"
                        type="number"
                        min={1}
                        max={10000}
                        placeholder="Бөлім соңына"
                        defaultValue={editing ? editing.position + 1 : undefined}
                      />
                      <small>Басқа бөлімге ауыстыруға болады.</small>
                    </label>
                  </div>
                  <label>
                    Қысқаша сипаттама
                    <textarea
                      name="summary"
                      maxLength={500}
                      rows={2}
                      defaultValue={editing?.summary}
                      placeholder="Дәрістің негізгі мазмұны, 1–3 сөйлем."
                    />
                  </label>
                  <label>
                    Оқу мақсаттары
                    <textarea
                      name="objectives"
                      maxLength={3000}
                      rows={3}
                      defaultValue={editing?.objectives}
                      placeholder="Әр мақсатты жаңа жолдан жазыңыз."
                    />
                    <small>Дәрісті аяқтаған студент нені түсінеді немесе орындай алады?</small>
                  </label>
                  <label>
                    Дәріс мәтіні
                    <textarea
                      name="body"
                      rows={12}
                      maxLength={30000}
                      defaultValue={editing?.body}
                      placeholder="Түсіндірме, мысалдар, әдебиеттер. Құжатты төменде бөлек жүктей аласыз."
                    />
                    <small>
                      Әр абзацты бос жолмен бөліңіз. Құжатпен оқытсаңыз, мәтін міндетті емес.
                    </small>
                  </label>
                  <label>
                    Бейнефайлға HTTPS сілтеме
                    <input
                      name="videoUrl"
                      type="url"
                      maxLength={2000}
                      defaultValue={editing?.video_url}
                      placeholder="https://…/lecture.mp4"
                    />
                    <small>
                      Тікелей MP4/WebM бейнефайл сілтемесі. Бейне жүктеу және транскодтау әлі
                      қосылмаған.
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
                      defaultValue={editing?.duration_minutes || 45}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" name="preview" defaultChecked={!!editing?.is_preview} />
                    Танысу үшін ашық дәріс
                  </label>
                  <p className="help-text">
                    Ашық дәрісті курс жарияланғаннан кейін қонақтар да оқи алады. Басқа дәрістер
                    курсқа жазылған студенттерге қолжетімді.
                  </p>
                  <SubmitButton>
                    {editing ? 'Өзгерістерді сақтау' : 'Дәрісті сақтап, құжат қосу'}
                  </SubmitButton>
                </form>
                {editing ? (
                  <MaterialEditor lessonId={editing.id} userId={user.id} />
                ) : (
                  <p className="notice spaced">
                    PDF/Word жүктеу бөлімі дәріс сақталғаннан кейін бірден ашылады.
                  </p>
                )}
              </>
            ) : editing ? (
              <div className="lesson-readonly">
                <p>{editing.summary || editing.title}</p>
                <Link className="button outline" href={`/learn/${editing.id}`}>
                  Мәтін мен құжаттарды көру →
                </Link>
              </div>
            ) : (
              <p className="help-text">
                Құрылымнан дәрісті таңдаңыз немесе мазмұнды өзгерту үшін өңдеуді ашыңыз.
              </p>
            )}
          </section>
          {editing && !archived && (
            <section className="panel">
              <LectureCoverEditor course={course} lessonId={editing.id} />
            </section>
          )}
          <section className="panel" id="cover">
            <span className="eyebrow">КӨРНЕКІ БЕЗЕНДІРУ</span>
            <h2>Негізгі мұқаба</h2>
            <p className="help-text">
              Басты беттегі карточкада, курс бетінде және дәрістің жоғарғы бөлігінде көрсетіледі.
            </p>
            <div className="cover-current">
              <CourseCover course={course} large />
              <span>{course.has_cover ? 'Жүктелген сурет' : 'Дайын иллюстрация'}</span>
            </div>
            {!archived && (
              <>
                <form
                  action="/api/course-covers"
                  method="post"
                  encType="multipart/form-data"
                  className="form-stack cover-upload"
                >
                  <input type="hidden" name="courseId" value={id} />
                  <label>
                    Өз суретіңіз
                    <input
                      type="file"
                      name="file"
                      accept="image/jpeg,image/png,image/webp"
                      required
                    />
                    <small>
                      JPG, PNG, WebP · 5 МБ дейін · 20 Мп дейін. Сурет 16:9 пішіміне келтіріледі.
                    </small>
                  </label>
                  <SubmitButton className="button outline">Суретті жүктеу</SubmitButton>
                </form>
                <form action={selectCourseCover} className="form-stack">
                  <input type="hidden" name="courseId" value={id} />
                  <CoverPicker selected={course.cover_preset} />
                  <p className="help-text">
                    Иллюстрацияны сақтасаңыз, ол жүктелген суретті алмастырады.
                  </p>
                  <SubmitButton className="button outline">Иллюстрацияны қолдану</SubmitButton>
                </form>
              </>
            )}
          </section>
          <section className="panel" id="settings">
            <span className="eyebrow">НЕГІЗГІ МӘЛІМЕТТЕР</span>
            <h2>Курс параметрлері</h2>
            {writable ? (
              <form action={saveCourseDetails} className="form-stack">
                <input type="hidden" name="courseId" value={id} />
                <CourseFields course={course} />
                <SubmitButton>Курс параметрлерін сақтау</SubmitButton>
              </form>
            ) : (
              <p className="help-text">
                Курс атауын, сипаттамасын және бағасын өзгерту үшін курсты өңдеуге ашыңыз.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
