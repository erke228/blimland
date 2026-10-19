import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Play,
  Check,
  Search,
  SlidersHorizontal,
  BookOpen,
  Video,
  BadgeCheck,
} from 'lucide-react';
import { listCourses } from '@/lib/courses';
import { CourseCard, EmptyState, PageHeading } from './ui';

export function Catalog({ q = '', category = '' }: { q?: string; category?: string }) {
  const courses = listCourses(q.slice(0, 200), category.slice(0, 100));
  const categories = ['Барлығы', 'Математика', 'Тілдер', 'Технология', 'Жаратылыстану'];
  return (
    <>
      <PageHeading
        eyebrow="УНИВЕРСИТЕТТІҢ ОҚУ КЕҢІСТІГІ"
        title="Дәрістерден терең білімге"
        description="Пәндер, оқытушы материалдары және студенттің жеке оқу жолы."
      />
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-tag">
            <span /> Оқытушылар мен студенттерге
          </span>
          <h2>
            Оқу материалдары
            <br />
            бір кеңістікте <em>біріктірілген.</em>
          </h2>
          <p>
            Түсінікті сабақтар, өз қарқыныңызбен оқу және
            <br className="desktop-break" /> алға жетелейтін жаңа білім.
          </p>
          <Link href="/register" className="button dark">
            Оқуды бастау <ArrowUpRight size={17} />
          </Link>
          <div className="hero-note">
            <Check size={15} /> Тегін курстардан бастаңыз
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="art-dotted" />
          <div className="art-orbit" />
          <div className="art-card art-video">
            <div className="art-video-window">
              <span className="play-circle">
                <Play fill="currentColor" size={28} />
              </span>
              <span className="art-wave">∿</span>
            </div>
            <div className="art-video-caption">
              <span className="art-line" />
              <span className="art-line short" />
            </div>
          </div>
          <div className="floating-tag tag-top">
            <span className="floating-icon">
              <BookOpen size={20} />
            </span>
            <div>
              <b>Жаңа білім</b>
              <small>Күн сайын бір қадам</small>
            </div>
          </div>
          <div className="floating-tag tag-bottom">
            <span className="floating-icon amber">
              <Check size={20} />
            </span>
            <div>
              <b>Өз қарқыныңызбен</b>
              <small>Кез келген жерден</small>
            </div>
          </div>
          <span className="art-spark spark-one">✦</span>
          <span className="art-spark spark-two">✧</span>
        </div>
      </section>
      <div className="value-strip">
        <span>
          <Video size={20} />
          <div>
            <b>Түсінікті сабақтар</b>
            <small>Мәтін және бейне форматында</small>
          </div>
        </span>
        <span>
          <BookOpen size={20} />
          <div>
            <b>Бірізді оқу</b>
            <small>Тақырыптан тақырыпқа</small>
          </div>
        </span>
        <span>
          <BadgeCheck size={20} />
          <div>
            <b>Жеке оқу кабинеті</b>
            <small>Нәтижеңіз бір жерде</small>
          </div>
        </span>
      </div>
      <section className="catalog-section" id="catalog">
        <div className="section-title">
          <div>
            <h2>
              Курстарды зерттеңіз <span className="count-pill">{courses.length}</span>
            </h2>
            <p>Жаңа дағдыға алғашқы қадам жасаңыз.</p>
          </div>
        </div>
        <form method="get" action="/courses" className="catalog-tools">
          <div className="search-field">
            <Search size={19} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Қандай тақырыпты іздейсіз?"
              aria-label="Курс іздеу"
            />
          </div>
          {category && <input type="hidden" name="category" value={category} />}
          <button className="button outline" type="submit">
            <SlidersHorizontal size={16} />
            Іздеу
          </button>
        </form>
        <div className="category-tabs">
          {categories.map((item) => (
            <Link
              key={item}
              className={`category-tab ${category === (item === 'Барлығы' ? '' : item) ? 'selected' : ''}`}
              href={`/courses?${new URLSearchParams({ ...(q ? { q } : {}), ...(item !== 'Барлығы' ? { category: item } : {}) }).toString()}`}
            >
              {item}
            </Link>
          ))}
        </div>
        {courses.length ? (
          <div className="course-grid">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Курс табылмады"
            description="Басқа сөзді немесе санатты таңдап көріңіз."
            href="/courses"
            label="Барлық курс"
          />
        )}
        <p className="demo-note">
          Алғашқы курстар — платформаның жұмысын көрсетуге арналған үлгі материалдар.
        </p>
      </section>
    </>
  );
}
