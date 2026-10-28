import Link from 'next/link';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import type { Course } from '@/lib/courses';
import { CoverIllustration } from './cover-illustration';

export function CourseCover({
  course,
  large = false,
}: {
  course: Pick<Course, 'category' | 'accent' | 'title'> &
    Partial<Pick<Course, 'id' | 'has_cover' | 'cover_version' | 'cover_preset'>> & {
      cover_url?: string;
    };
  large?: boolean;
}) {
  if (course.has_cover && course.id)
    return (
      <div className={`course-cover uploaded-cover ${large ? 'large' : ''}`}>
        <img
          src={`${course.cover_url || `/courses/${course.id}/cover`}?v=${course.cover_version}`}
          alt={`${course.title} — мұқаба`}
        />
      </div>
    );
  return <CoverIllustration preset={course.cover_preset} large={large} />;
}
export function CourseCard({ course, progress }: { course: Course; progress?: number }) {
  return (
    <article className="course-card">
      <Link href={`/courses/${course.id}`} className="cover-link" aria-label={course.title}>
        <CourseCover course={course} />
      </Link>
      <div className="course-card-body">
        <div className="card-top">
          <span className="category-label">{course.category}</span>
          <span className="level">{course.level}</span>
        </div>
        <h3>
          <Link href={`/courses/${course.id}`}>{course.title}</Link>
        </h3>
        <p className="course-description">{course.description}</p>
        {course.first_lesson_id && (
          <Link
            className="first-lecture-link"
            href={
              course.first_lesson_preview
                ? `/learn/${course.first_lesson_id}`
                : `/courses/${course.id}`
            }
          >
            <BookOpen size={17} />
            <span>
              <small>АЛҒАШҚЫ ДӘРІС</small>
              {course.first_lesson_title}
            </span>
            <ArrowUpRight size={17} />
          </Link>
        )}
        <div className="teacher-line">
          <span className="tiny-avatar">{course.teacher[0]}</span>
          {course.teacher}
        </div>
        <div className="card-footer">
          <span>
            <BookOpen size={15} />
            {course.lesson_count} сабақ
          </span>
        </div>
        {progress !== undefined && (
          <div className="course-progress">
            <div className="between">
              <span>Оқу барысы</span>
              <b>{progress}%</b>
            </div>
            <progress value={progress} max={100} />
          </div>
        )}
      </div>
    </article>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <BookOpen size={28} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {href && (
        <Link className="button primary" href={href}>
          {label}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function Notice({ error, success }: { error?: string; success?: string }) {
  const errors: Record<string, string> = {
    registration: 'Атыңызды, дұрыс email және кемінде 12 таңбалы құпиясөзді енгізіңіз.',
    email: 'Бұл email арқылы тіркелу мүмкін болмады. Егер аккаунтыңыз болса, кіріңіз.',
    credentials: 'Email немесе құпиясөз дұрыс емес.',
    rate: 'Тым көп әрекет жасалды. Кейінірек қайталаңыз.',
    forbidden: 'Бұл әрекетті орындауға рұқсатыңыз жоқ.',
    coursetrashed: 'Курс себетте. Өңдеу үшін алдымен жобаға қайтарыңыз.',
    purgeconfirmation:
      'Курсты алдымен себетке жіберіңіз. Толық жою үшін атауын дәл жазып, растау белгісін қойыңыз.',
    currentpassword: 'Ағымдағы құпиясөз дұрыс емес.',
    newpassword:
      'Жаңа құпиясөз кемінде 12 таңба болуы және қайталанған нұсқасымен сәйкес келуі тиіс.',
    profilewebsite: 'Сайт сілтемесі http:// немесе https:// арқылы басталуы тиіс.',
    bio: 'Өзіңіз туралы 20–3000 таңба жазыңыз.',
    invalid: 'Мәліметтерді тексеріп, қайта жіберіңіз.',
    courseform: 'Атау (5–140 таңба), сипаттама (30–5000 таңба), санат және дұрыс баға қажет.',
    lessonform: 'Сабақтың атауын, мәтінін немесе HTTPS бейнесілтемесін және ұзақтығын тексеріңіз.',
    emptycourse: 'Тексеруге жібермес бұрын кемінде бір сабақ қосыңыз.',
    sectiondestination:
      'Дәрістері бар бөлімді жою үшін осы курстағы басқа бөлімді таңдаңыз. Дәрістер мен прогресс сақталады.',
    emptylesson:
      'Әр дәріске мәтін, бейнесілтеме немесе PDF/Word құжатын қосыңыз. Бос дәрістер жарияланбайды.',
    coversize: 'Мұқаба файлы бос болмауы және 5 МБ-тан аспауы тиіс.',
    coverinvalid:
      'JPG, PNG немесе WebP суретін таңдаңыз (20 мегапиксельге дейін). Файл ашылуы тиіс.',
    readonly: 'Бұл нұсқа өңдеуге жабық. Курс тексерілуде немесе жарияланған.',
    documenttype:
      'PDF немесе Word (.docx) файлын таңдаңыз. .doc файлын алдымен .docx не PDF ретінде сақтаңыз.',
    documentsize: 'Құжат бос болмауы және 20 МБ-тан аспауы тиіс.',
    documentinvalid:
      'Құжат ашылмады: файл бүлінген, шифрланған немесе пішімі қолдау таппайды. PDF не DOCX нұсқасын тексеріңіз.',
    documentquota: 'Материалдар лимиті: бір сабаққа 10 құжат, бір жүктеушіге жалпы 500 МБ.',
    course: 'Курс қолжетімсіз.',
    registrationclosed: 'Ашық тіркелу уақытша жабық. Университет әкімшісіне хабарласыңыз.',
    groupform: 'Топ атауын және оқу жылын (мысалы, 2026–2027) дұрыс толтырыңыз.',
    archivedgroup: 'Архивтелген топқа студенттер мен курстарды қосу жабық.',
    invite: 'Шақыру сілтемесі жарамсыз, мерзімі аяқталған немесе лимиті біткен.',
    studentonly: 'Бұл шақыру студент аккаунтына арналған.',
    userform: 'Аты-жөні, email, рөл және мәртебе дұрыс толтырылуы тиіс.',
    ownerprotected:
      'Бас әкімшіні бұғаттауға, рөлін төмендетуге немесе екінші бас әкімші қосуға болмайды.',
    ownership: 'Оқытушыда белсенді курстар немесе топтар бар. Алдымен оларды реттеңіз.',
  };
  const successes: Record<string, string> = {
    saved: 'Өзгерістер сақталды.',
    coursepurged: 'Курс және оған қатысты оқу деректері толық жойылды.',
    cleanupqueued:
      'Курс жойылды. Кейбір файлдарды тазалау кезекте қалды; әкімші қайта тексере алады.',
    passwordchanged: 'Құпиясөз өзгертілді. Жаңа құпиясөзбен қайта кіріңіз.',
    emailchanged: 'Email өзгертілді. Жаңа email арқылы қайта кіріңіз.',
    documentuploaded: 'Құжат жүктелді. Ол сабақ ішінде ашылады.',
    application: 'Өтінім әкімшіге жіберілді.',
    completed: 'Сабақ оқылған ретінде белгіленді.',
    invitecreated:
      'Шақыру жасалды. Сілтемені қазір көшіріп алыңыз: ол бұл бетте 10 минут көрсетіледі.',
    revoked: 'Шақыру сілтемесі өшірілді. Бұрын қосылған студенттер топта қалады.',
    joined: 'Оқу тобына қосылдыңыз. Тағайындалған курстар кабинетіңізде ашылды.',
    removed: 'Топ мүшелігі өзгертілді. Оқу тарихы мен курсқа жазылу сақталды.',
    sessionsrevoked: 'Пайдаланушының барлық белсенді сессиялары аяқталды.',
  };
  if (error)
    return (
      <div className="notice error" role="alert">
        {errors[error] || errors.invalid}
      </div>
    );
  if (success)
    return (
      <div className="notice success" role="status">
        {successes[success] || successes.saved}
      </div>
    );
  return null;
}
export const statusLabel: Record<string, string> = {
  draft: 'Жоба',
  submitted: 'Тексерілуде',
  published: 'Жарияланған',
  pending: 'Қарастырылуда',
  approved: 'Мақұлданған',
  rejected: 'Қайтарылған',
  archived: 'Архивте',
  active: 'Белсенді',
  blocked: 'Бұғатталған',
};
