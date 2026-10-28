import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye, Plus, Send, Pencil, BookOpen, Trash2, FileUp } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { all } from '@/lib/db';
import { courseLessons, getCourse } from '@/lib/courses';
import {
  addSection,
  submitCourse,
  saveCourseDetails,
  selectCourseCover,
  reopenCourseForEditing,
  updateSection,
  removeSection,
  restoreSection,
} from '@/app/actions';
import { CourseCover, Notice, PageHeading, statusLabel } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { MaterialEditor } from '@/components/material-editor';
import { CourseFields } from '@/components/course-fields';
import { CoverPicker } from '@/components/cover-picker';
import { LectureCoverEditor } from '@/components/lecture-cover-editor';
import { DocumentFileInput } from '@/components/document-file-input';
import { CourseControls } from '@/components/course-controls';
import { courseInTrash } from '@/lib/course-lifecycle';
import { FilePicker } from '@/components/file-picker';
export default async function CourseEditor({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
    lesson?: string;
    tab?: string;
  }>;
}) {
  const user = await requireRole('teacher', 'admin');
  const { id } = await params;
  const query = await searchParams;
  const course = await getCourse(id);
  if (!course || (course.owner_id !== user.id && user.role !== 'admin')) notFound();
  const sections = await all<{
    id: string;
    title: string;
    position: number;
  }>(
    'SELECT id,title,position FROM sections WHERE course_id=? AND NOT EXISTS(SELECT 1 FROM section_trash t WHERE t.section_id=sections.id) ORDER BY position,id',
    id,
  );
  const removedSections = await all<{
    id: string;
    title: string;
  }>(
    'SELECT s.id,s.title FROM sections s JOIN section_trash t ON t.section_id=s.id WHERE s.course_id=? ORDER BY t.removed_at DESC',
    id,
  );
  const lessons = await courseLessons(id);
  const editing =
    query.lesson === 'new'
      ? undefined
      : query.lesson
        ? lessons.find((l) => l.id === query.lesson)
        : lessons[0];
  const writable = course.status === 'draft';
  const archived = course.status === 'archived';
  const inTrash = await courseInTrash(id);
  const pane = ['structure', 'lecture', 'materials', 'cover', 'settings', 'manage'].includes(
    query.tab || '',
  )
    ? query.tab!
    : query.lesson
      ? 'lecture'
      : 'structure';
  const tabs = [
    ['structure', 'Бөлімдер мен дәрістер'],
    ['lecture', 'Дәріс редакторы'],
    ['materials', 'PDF / Word'],
    ['cover', 'Мұқаба'],
    ['settings', 'Параметрлер'],
    ['manage', 'Басқару'],
  ];
  return (
    <>
      <PageHeading
        eyebrow="ДӘРІСТЕР РЕДАКТОРЫ"
        title={course.title}
        description={`Күйі: ${statusLabel[course.status]} · ${lessons.length} дәріс`}
      >
        <div className="editor-heading-actions">
          <Link className="button outline" href={`/courses/${id}`}>
            <Eye size={17} />
            Алдын ала көру
          </Link>
          <CourseControls
            id={id}
            title={course.title}
            status={course.status}
            inTrash={inTrash}
            admin={user.role === 'admin'}
            returnTo={user.role === 'admin' ? '/admin/courses' : '/teacher'}
          />
        </div>
      </PageHeading>
      <Notice error={query.error} success={query.success} />
      <nav className="workspace-tabs" aria-label="Редактор бөлімдері">
        {tabs.map(([key, label]) => (
          <Link
            className={pane === key ? 'selected' : ''}
            href={`/teacher/courses/${id}?tab=${key}${key !== 'structure' && key !== 'settings' && key !== 'manage' ? `&lesson=${editing?.id || 'new'}` : ''}`}
            key={key}
          >
            {label}
          </Link>
        ))}
      </nav>
      {!writable && (
        <div className="panel editor-status">
          <div>
            <h2>{archived ? 'Курс архивте' : 'Жарияланған нұсқа қорғалған'}</h2>
            <p>
              {archived
                ? 'Курс жасырылған немесе себетте. Өңдеу үшін «Жобаға қайтару» батырмасын басыңыз.'
                : 'Мазмұнды өзгерту үшін курс жобаға қайтарылады. Ол қайта мақұлданғанша студенттерге ашылмайды. Оқу тарихы сақталады. Мұқабаны бірден өзгерте аласыз.'}
            </p>
          </div>
          {!archived && (
            <form action={reopenCourseForEditing}>
              <input type="hidden" name="courseId" value={id} />
              <input type="hidden" name="lessonId" value={editing?.id || ''} />
              <SubmitButton className="button outline">
                <Pencil size={16} />
                Өңдеуге ашу
              </SubmitButton>
            </form>
          )}
        </div>
      )}
      <div className="course-editor-stage">
        {pane === 'structure' && (
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
                {!archived && (
                  <details className="section-remove">
                    <summary className="button outline danger-text">
                      <Trash2 size={14} />
                      Бөлімді жою
                    </summary>
                    <p className="help-text">
                      {lessons.some((l) => l.section_id === section.id)
                        ? 'Бөлім дәрістерімен бірге алынады. Файлдар мен оқу тарихы сақталады; бөлімді қалпына келтіруге болады.'
                        : 'Бос бөлім құрылымнан алынады. Оны жойылған бөлімдерден қалпына келтіруге болады.'}
                    </p>
                    {!writable && (
                      <p className="help-text">
                        Курс жобаға қайтарылады және қайта мақұлданғанша студенттерге жабылады.
                      </p>
                    )}
                    <form action={removeSection} className="form-stack compact-form">
                      <input type="hidden" name="courseId" value={id} />
                      <input type="hidden" name="sectionId" value={section.id} />
                      {lessons.some((l) => l.section_id === section.id) && (
                        <label>
                          Дәрістерді ауыстыру
                          <select name="targetId" defaultValue="">
                            <option value="">Дәрістермен бірге алып тастау</option>
                            {sections
                              .filter((s) => s.id !== section.id)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.title}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      <SubmitButton className="button outline tiny">
                        <Trash2 size={14} />
                        Бөлімді жоюды растау
                      </SubmitButton>
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
                  href={`/teacher/courses/${id}?lesson=new#lesson-editor`}
                >
                  <Plus size={16} />
                  Жаңа дәріс
                </Link>
                <form action={addSection} className="form-stack compact-form" id="add-section">
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
                {!!removedSections.length && (
                  <details className="removed-sections">
                    <summary>Жойылған бөлімдер ({removedSections.length})</summary>
                    <p className="help-text">
                      Бөлім мен ішіндегі дәрістер қалпына келеді. Басқа бөлімге ауыстырылған
                      дәрістер сол жерде қалады.
                    </p>
                    {removedSections.map((s) => (
                      <form action={restoreSection} key={s.id} className="restore-section-row">
                        <span>{s.title}</span>
                        <input type="hidden" name="courseId" value={id} />
                        <input type="hidden" name="sectionId" value={s.id} />
                        <SubmitButton className="button outline tiny">Қалпына келтіру</SubmitButton>
                      </form>
                    ))}
                  </details>
                )}
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
        )}
        <div className="editor-main">
          {pane === 'materials' && editing && (
            <div className="panel">
              <MaterialEditor
                lessonId={editing.id}
                userId={user.id}
                courseId={id}
                readOnly={!writable}
                archived={archived}
              />
            </div>
          )}
          {pane === 'lecture' && (
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
              {writable && sections.length === 0 ? (
                <div className="notice">
                  <p>Дәріс қоспас бұрын бөлім жасаңыз.</p>
                  <a
                    className="text-link"
                    href={`/teacher/courses/${id}?tab=structure#add-section`}
                  >
                    Бөлім қосу →
                  </a>
                </div>
              ) : writable ? (
                <>
                  <p className="help-text">
                    Мәліметтерді толтырыңыз. Жаңа дәріске PDF немесе Word файлын бірден қоса аласыз.
                  </p>
                  <form
                    action="/api/lessons"
                    method="post"
                    encType="multipart/form-data"
                    className="form-stack"
                    key={editing?.id || 'new'}
                  >
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
                    {!editing && (
                      <div id="materials" className="new-lecture-document">
                        <h3>
                          <FileUp size={19} />
                          PDF немесе Word қосу
                        </h3>
                        <p className="help-text">
                          Файл міндетті емес. Таңдалған құжат дәріспен бірге сақталып, сайтта
                          ашылады.
                        </p>
                        <DocumentFileInput />
                      </div>
                    )}
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
                      <input
                        type="checkbox"
                        name="preview"
                        defaultChecked={!!editing?.is_preview}
                      />
                      Танысу үшін ашық дәріс
                    </label>
                    <p className="help-text">
                      Ашық дәрісті курс жарияланғаннан кейін қонақтар да оқи алады. Басқа дәрістер
                      курсқа жазылған студенттерге қолжетімді.
                    </p>
                    <SubmitButton>
                      {editing ? 'Өзгерістерді сақтау' : 'Дәрісті және құжатты сақтау'}
                    </SubmitButton>
                  </form>
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
          )}
          {pane === 'cover' && editing && !archived && (
            <section className="panel">
              <LectureCoverEditor course={course} lessonId={editing.id} />
            </section>
          )}
          {pane === 'cover' && (
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
                    <FilePicker
                      label="Курс мұқабасын таңдау"
                      accept="image/jpeg,image/png,image/webp"
                      required
                      image
                      previewImage
                      help="JPG / PNG / WebP · 5 МБ · 20 Мп · 16:9."
                    />
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
          )}
          {pane === 'settings' && (
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
                  Курс атауын және сипаттамасын өзгерту үшін курсты өңдеуге ашыңыз.
                </p>
              )}
            </section>
          )}
          {pane === 'materials' && !editing && (
            <section className="panel">
              <h2>PDF / Word</h2>
              <p className="help-text">
                Алдымен дәріс атауын енгізіңіз. Құжатты жаңа дәріспен бірге жүктей аласыз.
              </p>
              <Link
                className="button primary"
                href={`/teacher/courses/${id}?tab=lecture&lesson=new`}
              >
                Дәріс пен құжат қосу
              </Link>
            </section>
          )}
          {pane === 'manage' && (
            <section className="panel">
              <h2>Курсты басқару</h2>
              <p className="help-text">
                Жасыру курсқа қолжетімділікті тоқтатады. Себеттен қалпына келтіруге болады; толық
                жою — тек бас әкімшіге.
              </p>
              <CourseControls
                id={id}
                title={course.title}
                status={course.status}
                inTrash={inTrash}
                admin={user.role === 'admin'}
                returnTo={user.role === 'admin' ? '/admin/courses' : '/teacher'}
              />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
