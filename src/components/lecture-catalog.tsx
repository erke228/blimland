import Link from 'next/link';
import {
  Search,
  SlidersHorizontal,
  BookOpen,
  FileText,
  FileType2,
  Video,
  AlignLeft,
  Clock3,
  ArrowUpRight,
  GraduationCap,
  LockKeyhole,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { lectureCatalog, type CatalogFilters } from '@/lib/lecture-catalog';
import { currentUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { CourseCard, CourseCover, EmptyState, PageHeading } from './ui';
import { MobileDisclosure } from './mobile-disclosure';
export async function LectureCatalog({ filters }: { filters: CatalogFilters }) {
  const data = await lectureCatalog(filters),
    user = await currentUser();
  const enrolled = new Set(
    user
      ? (
          await all<{
            course_id: string;
          }>('SELECT course_id FROM enrollments WHERE user_id=?', user.id)
        ).map((e) => e.course_id)
      : [],
  );
  const href = (changes: Record<string, string>) =>
    '/courses?' +
    new URLSearchParams(
      Object.fromEntries(
        Object.entries({ ...filters, ...changes }).filter(([, v]) => !!v),
      ) as Record<string, string>,
    );
  const active = ['q', 'category', 'teacher', 'level', 'format', 'access'].some(
    (key) => !!filters[key as keyof CatalogFilters],
  );
  return (
    <>
      <PageHeading
        eyebrow="ОҚУ КІТАПХАНАСЫ"
        title="Пәндер мен курстар"
        description="Тақырып, пән немесе оқытушы бойынша дәрісті табыңыз."
      />
      <div className="library-summary">
        <span>
          <BookOpen size={17} />
          <b>{data.totals.courses}</b> курс
        </span>
        <span>
          <FileText size={17} />
          <b>{data.totals.lectures}</b> дәріс
        </span>
        <span>
          <GraduationCap size={18} />
          <b>{data.totals.teachers}</b> оқытушы
        </span>
      </div>
      <div className="library-layout">
        <aside className="panel library-filters">
          <div className="between">
            <h2>
              <SlidersHorizontal size={18} /> Іріктеу
            </h2>
            {active && (
              <Link href="/courses" className="text-link">
                Тазарту
              </Link>
            )}
          </div>
          <form action="/courses" method="get" className="form-stack">
            <div className="library-search-field">
              <label htmlFor="lecture-search">Дәріс немесе тақырып</label>
              <div className="library-search">
                <Search size={18} />
                <input
                  id="lecture-search"
                  aria-label="Дәріс немесе тақырып"
                  name="q"
                  defaultValue={filters.q}
                  placeholder="Тақырып, пән, оқытушы…"
                  maxLength={200}
                />
                <button
                  type="submit"
                  className="library-search-submit"
                  aria-label="Каталогтан іздеу"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
            <MobileDisclosure
              key={JSON.stringify(filters)}
              title="Сүзгілер"
              summary={
                active ? 'Іріктеу параметрлері таңдалған' : 'Бағыт, оқытушы және материал пішімі'
              }
              className="filter-disclosure"
              filter
              badge={
                ['q', 'category', 'teacher', 'level', 'format', 'access'].filter(
                  (key) => !!filters[key as keyof CatalogFilters],
                ).length
              }
            >
              <label>
                Білім бағыты
                <select name="category" defaultValue={filters.category || ''}>
                  <option value="">Барлық бағыт</option>
                  {data.categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Оқытушы
                <select name="teacher" defaultValue={filters.teacher || ''}>
                  <option value="">Барлық оқытушы</option>
                  {data.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Деңгей
                <select name="level" defaultValue={filters.level || ''}>
                  <option value="">Барлық деңгей</option>
                  {['Бастапқы', 'Орташа', 'Жоғары', 'Барлық деңгей'].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <label>
                Материал пішімі
                <select name="format" defaultValue={filters.format || ''}>
                  <option value="">Барлық пішім</option>
                  <option value="pdf">PDF құжат</option>
                  <option value="docx">Word құжат</option>
                  <option value="video">Бейнедәріс</option>
                  <option value="text">Мәтін</option>
                </select>
              </label>
              <label>
                Қолжетімділік
                <select name="access" defaultValue={filters.access || ''}>
                  <option value="">Барлық дәріс</option>
                  <option value="open">Тіркелмей ашылатын</option>
                </select>
              </label>
              <input type="hidden" name="view" value={data.view} />
              <input type="hidden" name="sort" value={filters.sort || ''} />
              <button className="button primary full-width">
                <Search size={17} />
                Нәтижелерді көрсету
              </button>
              {active && (
                <Link className="filter-reset" href="/courses">
                  Барлық сүзгіні тазарту
                </Link>
              )}
            </MobileDisclosure>
          </form>
        </aside>
        <section className="library-results" aria-label="Каталог нәтижелері">
          <div className="library-toolbar">
            <nav className="library-view">
              <Link
                href={href({ view: 'lectures', page: '' })}
                className={data.view === 'lectures' ? 'selected' : ''}
              >
                <FileText size={17} />
                Дәрістер
              </Link>
              <Link
                href={href({ view: 'courses', page: '' })}
                className={data.view === 'courses' ? 'selected' : ''}
              >
                <BookOpen size={17} />
                Курстар
              </Link>
            </nav>
            <details className="library-sort">
              <summary>Реттеу</summary>
              <div>
                {[
                  ['', 'Жаңалары алдымен'],
                  ['title', 'Атауы бойынша'],
                  ['duration', 'Ұзақтығы бойынша'],
                ].map(([sort, label]) => (
                  <Link
                    className={(filters.sort || '') === sort ? 'selected' : ''}
                    key={sort}
                    href={href({ sort, page: '' })}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          </div>
          <p className="library-result-count">
            <strong>{data.total}</strong> {data.view === 'lectures' ? 'дәріс' : 'курс'} табылды
            {filters.q && <> · «{filters.q}»</>}
          </p>
          {!data.total ? (
            <EmptyState
              title="Материал табылмады"
              description="Басқа іздеу сөзін немесе іріктеу параметрлерін қолданып көріңіз."
              href="/courses"
              label="Іріктеуді тазарту"
            />
          ) : data.view === 'courses' ? (
            <div className="library-course-grid">
              {data.courses.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          ) : (
            <div className="lecture-list">
              {data.results.map((l) => {
                const readable =
                  !!l.is_preview ||
                  (!!user &&
                    (user.role === 'admin' || user.id === l.owner_id || enrolled.has(l.course_id)));
                const course = data.courseMap.get(l.course_id)!;
                return (
                  <article key={l.id} className="lecture-list-card">
                    <Link
                      className="lecture-list-art"
                      href={readable ? `/learn/${l.id}` : `/courses/${l.course_id}`}
                      aria-label={l.title}
                    >
                      <CourseCover course={course} />
                    </Link>
                    <div className="lecture-list-body">
                      <div className="lecture-list-top">
                        <Link
                          className="category-label"
                          href={href({ category: l.category, page: '' })}
                        >
                          {l.category}
                        </Link>
                        <span className={`lecture-access ${readable ? 'open' : ''}`}>
                          {readable ? <PlayCircle size={13} /> : <LockKeyhole size={13} />}{' '}
                          {l.is_preview ? 'Ашық дәріс' : readable ? 'Қолжетімді' : 'Курсқа жазылу'}
                        </span>
                      </div>
                      <h2>
                        <Link href={readable ? `/learn/${l.id}` : `/courses/${l.course_id}`}>
                          {l.title}
                        </Link>
                      </h2>
                      <Link className="lecture-parent" href={`/courses/${l.course_id}`}>
                        {l.course_title} · {l.section_title}
                      </Link>
                      <div className="lecture-meta">
                        <span>
                          <GraduationCap size={15} />
                          {l.teacher}
                        </span>
                        <span>
                          <Clock3 size={14} />
                          {l.duration_minutes} мин
                        </span>
                        <span>{l.level}</span>
                      </div>
                      <div className="lecture-list-bottom">
                        <div className="resource-tags">
                          {l.has_pdf > 0 && (
                            <span>
                              <FileText size={13} />
                              PDF
                            </span>
                          )}
                          {l.has_docx > 0 && (
                            <span>
                              <FileType2 size={13} />
                              Word
                            </span>
                          )}
                          {l.has_video > 0 && (
                            <span>
                              <Video size={13} />
                              Бейне
                            </span>
                          )}
                          {l.has_text > 0 && (
                            <span>
                              <AlignLeft size={13} />
                              Мәтін
                            </span>
                          )}
                        </div>
                        <Link
                          className="text-link"
                          href={readable ? `/learn/${l.id}` : `/courses/${l.course_id}`}
                        >
                          {readable ? 'Дәрісті ашу' : 'Курсқа өту'}
                          <ArrowUpRight size={16} />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {data.pages > 1 && (
            <nav className="library-pagination" aria-label="Каталог беттері">
              {data.page > 1 && (
                <Link href={href({ page: String(data.page - 1) })}>
                  <ChevronLeft size={16} />
                  Алдыңғы
                </Link>
              )}
              <span>
                {data.page} / {data.pages}
              </span>
              {data.page < data.pages && (
                <Link href={href({ page: String(data.page + 1) })}>
                  Келесі
                  <ChevronRight size={16} />
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
