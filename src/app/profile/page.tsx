import Link from 'next/link';
import { ArrowUpRight, GraduationCap, LockKeyhole, Users, UserRound } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { studentGroups } from '@/lib/student-community';
import { applyTeacher } from '@/app/actions';
import { saveProfileAction } from '@/app/management-actions';
import { Notice, PageHeading } from '@/components/ui';
import { PersonCard, roleLabel } from '@/components/person-card';
import { SubmitButton } from '@/components/submit-button';
export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await requireUser();
  const groups = user.role === 'student' ? studentGroups(user.id) : [];
  const application =
    user.role === 'student'
      ? one<{ status: string; review_note: string; bio: string }>(
          'SELECT status, review_note, bio FROM teacher_applications WHERE user_id = ?',
          user.id,
        )
      : undefined;
  return (
    <>
      <PageHeading
        eyebrow="ЖЕКЕ КЕҢІСТІК"
        title="Менің профилім"
        description="Жеке мәліметтеріңіз бен оқу ортаңыз бір жерде."
      />
      <Notice {...await searchParams} />
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">
          {user.name.trim().slice(0, 1)}
        </span>
        <div>
          <h2>{user.name}</h2>
          <span>{roleLabel[user.role]}</span>
        </div>
        <span className="profile-language">Қазақ тілі · KZT ₸</span>
      </div>
      <div className="profile-layout">
        <div className="profile-personal">
          <section className="panel profile-details" aria-labelledby="personal-heading">
            <div className="profile-section-heading">
              <UserRound size={19} />
              <h2 id="personal-heading">Жеке мәліметтер</h2>
            </div>
            <p className="profile-caption">Аккаунтыңыздағы мәліметтерді жаңартыңыз.</p>
            <form action={saveProfileAction} className="form-stack">
              <label>
                Аты-жөні
                <input name="name" required minLength={2} maxLength={80} defaultValue={user.name} />
              </label>
              <label>
                Факультет / кафедра
                <input name="department" maxLength={180} defaultValue={user.department} />
              </label>
              <label>
                Лауазым / академиялық мәртебе
                <input
                  name="academicTitle"
                  maxLength={120}
                  defaultValue={user.academic_title}
                  placeholder="Мысалы, 2-курс студенті"
                />
              </label>
              <div className="readonly-field">
                <span>Email</span>
                <strong>{user.email}</strong>
                <small>Email мен аккаунт рөлін бас әкімші өзгертеді.</small>
              </div>
              <SubmitButton>Өзгерістерді сақтау</SubmitButton>
            </form>
          </section>
          {user.role === 'student' && (
            <details className="profile-secondary-menu">
              <summary>Оқытушы мәртебесіне өтінім</summary>
              <div className="profile-request-content">
                {application?.status === 'pending' ? (
                  <p>
                    Өтінім бас әкімшінің қарауында. Шешім қабылданғанша аккаунтыңыз студент ретінде
                    қалады.
                  </p>
                ) : (
                  <>
                    <p>
                      Өтінімді бас әкімші қарастырады. Оқытушы құқығы мақұлданғаннан кейін беріледі.
                    </p>
                    {application?.status === 'rejected' && (
                      <p className="request-review-note">
                        Өтінім қайтарылды. {application.review_note}
                      </p>
                    )}
                    <form action={applyTeacher} className="form-stack">
                      <label>
                        Кафедраңыз, тәжірибеңіз және пәндеріңіз
                        <textarea
                          name="bio"
                          minLength={20}
                          maxLength={3000}
                          required
                          rows={4}
                          defaultValue={application?.bio || ''}
                        />
                      </label>
                      <SubmitButton className="button outline">Өтінім жіберу</SubmitButton>
                    </form>
                  </>
                )}
              </div>
            </details>
          )}
        </div>
        {user.role === 'student' ? (
          <section id="study-groups" className="profile-community" aria-labelledby="groups-heading">
            <div className="profile-section-heading">
              <Users size={20} />
              <h2 id="groups-heading">Менің оқу тобым</h2>
            </div>
            <p className="profile-caption">Тобыңыз және бірге оқитын студенттер.</p>
            {groups.length ? (
              groups.map((group) => (
                <article className="panel study-group" key={group.id}>
                  <div className="study-group-heading">
                    <span className="group-symbol">
                      <GraduationCap size={23} />
                    </span>
                    <div>
                      <h3>{group.name}</h3>
                      <p>
                        {group.academic_year} ·{' '}
                        {group.semester === 3 ? 'Жазғы семестр' : `${group.semester}-семестр`}
                      </p>
                    </div>
                  </div>
                  {group.teacher && (
                    <div className="group-teacher">
                      <span className="people-label">ОҚЫТУШЫ</span>
                      <PersonCard person={group.teacher} />
                    </div>
                  )}
                  <div className="classmates">
                    <span className="people-label">ТОПТАСТАР</span>
                    {group.classmates.length ? (
                      <div className="people-grid">
                        {group.classmates.map((person) => (
                          <PersonCard key={person.id} person={person} />
                        ))}
                      </div>
                    ) : (
                      <p className="profile-caption">
                        Топқа қосылған басқа студенттер осында көрінеді.
                      </p>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="panel community-empty">
                <span className="group-symbol">
                  <GraduationCap size={26} />
                </span>
                <h3>Оқу тобыңыз осында көрінеді</h3>
                <p>
                  Оқытушы берген шақыру сілтемесі арқылы қосылғаннан кейін тобыңыз бен топтастарыңыз
                  пайда болады.
                </p>
              </div>
            )}
            <p className="community-privacy">
              <LockKeyhole size={14} />
              <span>
                Топтастарға тек атыңыз бен рөліңіз көрінеді. Email мен оқу нәтижелері көрсетілмейді.
              </span>
            </p>
          </section>
        ) : (
          <section className="panel profile-workspace">
            <span className="group-symbol">
              <GraduationCap size={24} />
            </span>
            <h2>Оқытушының жұмыс кеңістігі</h2>
            <p>Топтар, шақырулар және студенттердің оқу барысы жеке кабинетте қолжетімді.</p>
            <Link
              href={user.role === 'admin' ? '/admin/groups' : '/teacher/groups'}
              className="profile-workspace-link"
            >
              Оқу топтарын басқару <ArrowUpRight size={17} />
            </Link>
            <Link href="/teacher" className="profile-workspace-link">
              Дәрістер мен курстар <ArrowUpRight size={17} />
            </Link>
            {user.role === 'admin' && (
              <Link href="/admin" className="profile-workspace-link">
                Бас әкімші тақтасы <ArrowUpRight size={17} />
              </Link>
            )}
          </section>
        )}
      </div>
    </>
  );
}
