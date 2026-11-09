import Link from 'next/link';
import {
  Search,
  SlidersHorizontal,
  BookOpen,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  X,
} from 'lucide-react';
import { lectureCatalog, type CatalogFilters } from '@/lib/lecture-catalog';
import { CourseCard, EmptyState, PageHeading } from './ui';
import { MobileDisclosure } from './mobile-disclosure';

const formats = [
  ['pdf', 'PDF құжат'],
  ['docx', 'Word құжат'],
  ['video', 'Бейнедәріс'],
  ['text', 'Мәтін'],
] as const;

export async function LectureCatalog({ filters }: { filters: CatalogFilters }) {
  const data = await lectureCatalog({ ...filters, view: 'courses' });
  const href = (changes: Record<string, string>) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ ...filters, ...changes }).filter(([, v]) => !!v),
      ) as Record<string, string>,
    ).toString();
    return query ? `/courses?${query}` : '/courses';
  };
  const applied = [
    ['q', filters.q],
    ['category', filters.category],
    [
      'teacher',
      filters.teacher
        ? (data.teachers.find((teacher) => teacher.id === filters.teacher)?.name ?? 'Оқытушы')
        : undefined,
    ],
    ['level', filters.level],
    ['format', formats.find(([value]) => value === filters.format)?.[1]],
    ['access', filters.access === 'open' ? 'Ашық сабақтар' : undefined],
  ] as const;
  const active = applied.filter(([, label]) => Boolean(label));
  const clearHref = href({
    q: '',
    category: '',
    teacher: '',
    level: '',
    format: '',
    access: '',
    page: '',
  });
  const list = filters.layout === 'list';
  const catalogQuery = href({ view: '', page: data.page > 1 ? String(data.page) : '' }).split(
    '?',
  )[1];
  const catalogContext = catalogQuery ? `?catalog=${encodeURIComponent(catalogQuery)}` : '';
  return (
    <div className="course-catalog">
      <PageHeading
        eyebrow="ОҚУ КІТАПХАНАСЫ"
        title="Пәндер мен курстар"
        description="Курс — бір тақырыпқа біріктірілген дәрістер жинағы. Курсты таңдаңыз: дәрістер, материалдар мен тесттер оның ішінде орналасқан."
      />
      <div className="library-summary">
        <span>
          <BookOpen size={17} />
          <b>{data.totals.courses}</b> курс
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
            {!!active.length && (
              <Link href={clearHref} className="text-link">
                Тазарту
              </Link>
            )}
          </div>
          <form action="/courses" method="get" className="form-stack">
            <div className="library-search-field">
              <label htmlFor="lecture-search">Курс немесе тақырып</label>
              <div className="library-search">
                <Search size={18} />
                <input
                  key={filters.q || ''}
                  id="lecture-search"
                  aria-label="Курс немесе тақырып"
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
                active.length
                  ? 'Іріктеу параметрлері таңдалған'
                  : 'Бағыт, оқытушы және материал пішімі'
              }
              className="filter-disclosure"
              filter
              badge={active.length}
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
                  {formats.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="layout" value={list ? 'list' : 'cards'} />
              <input type="hidden" name="sort" value={filters.sort || ''} />
              <button className="button primary full-width">
                <Search size={17} />
                Нәтижелерді көрсету
              </button>
              {!!active.length && (
                <Link className="filter-reset" href={clearHref}>
                  Барлық сүзгіні тазарту
                </Link>
              )}
            </MobileDisclosure>
          </form>
        </aside>
        <section className="library-results" aria-label="Каталог нәтижелері">
          <div className="library-toolbar">
            <nav className="library-view" aria-label="Курстардың көрінісі">
              <Link
                href={href({ layout: 'cards', view: '', page: '' })}
                className={!list ? 'selected' : ''}
                aria-current={!list ? 'page' : undefined}
              >
                <LayoutGrid size={17} />
                Карточкалар
              </Link>
              <Link
                href={href({ layout: 'list', view: '', page: '' })}
                className={list ? 'selected' : ''}
                aria-current={list ? 'page' : undefined}
              >
                <List size={17} />
                Тізім
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
            <strong>{data.total}</strong> курс табылды
          </p>
          {!!active.length && (
            <ul className="library-applied-filters" aria-label="Қолданылған сүзгілер">
              {active.map(([key, label]) => (
                <li key={key}>
                  <Link
                    href={href({ [key]: '', page: '' })}
                    aria-label={`Сүзгіні алып тастау: ${label}`}
                  >
                    {label} <X size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!data.total ? (
            <EmptyState
              title="Материал табылмады"
              description="Басқа іздеу сөзін немесе іріктеу параметрлерін қолданып көріңіз."
              href={clearHref}
              label="Іріктеуді тазарту"
            />
          ) : (
            <div className={list ? 'library-course-list' : 'library-course-grid'}>
              {data.courses.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  courseHref={`/courses/${c.id}${catalogContext}`}
                />
              ))}
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
    </div>
  );
}
