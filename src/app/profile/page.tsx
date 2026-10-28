import Link from 'next/link';
import { GraduationCap, LockKeyhole, Users, LogOut } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { studentGroups } from '@/lib/student-community';
import { applyTeacher, logout } from '@/app/actions';
import { Notice, PageHeading } from '@/components/ui';
import { PersonCard, roleLabel } from '@/components/person-card';
import { SubmitButton } from '@/components/submit-button';
import { ProfileEditor } from '@/components/profile-editor';
import { ownProfile } from '@/lib/profile';
import { TeachingProfile } from '@/components/teaching-profile';
import { MobileDisclosure } from '@/components/mobile-disclosure';
export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    tab?: string;
  }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const details = await ownProfile(user.id);
  const groups = user.role === 'student' ? await studentGroups(user.id) : [];
  const application =
    user.role === 'student'
      ? await one<{
          status: string;
          review_note: string;
          bio: string;
        }>('SELECT status, review_note, bio FROM teacher_applications WHERE user_id = ?', user.id)
      : undefined;
  return (
    <>
      <PageHeading
        eyebrow="ЖЕКЕ КЕҢІСТІК"
        title="Менің профилім"
        description="Жеке мәліметтеріңіз бен оқу ортаңыз бір жерде."
      />
      <Notice {...query} />
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">
          {details.has_avatar ? (
            <img src={`/api/profile/avatar?v=${details.avatar_version}`} alt="" />
          ) : (
            user.name.trim().slice(0, 1)
          )}
        </span>
        <div>
          <h2>{user.name}</h2>
          <span>{roleLabel[user.role]}</span>
        </div>
        <span className="profile-language">Қазақ тіліндегі оқу кеңістігі</span>
        <form action={logout} className="profile-signout">
          <SubmitButton className="button outline">
            <LogOut size={17} />
            Шығу
          </SubmitButton>
        </form>
      </div>
      <div className="profile-layout">
        <div className="profile-personal">
          <ProfileEditor user={user} details={details} tab={query.tab} />
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
            <MobileDisclosure
              title="Менің оқу тобым"
              summary={
                groups.length
                  ? groups.map((group) => group.name).join(' · ')
                  : 'Топқа қосылу туралы'
              }
              className="profile-group-disclosure"
            >
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
                    Оқытушы берген шақыру сілтемесі арқылы қосылғаннан кейін тобыңыз бен
                    топтастарыңыз пайда болады.
                  </p>
                </div>
              )}
              <p className="community-privacy">
                <LockKeyhole size={14} />
                <span>
                  Топтастарға тек атыңыз бен рөліңіз көрінеді. Email мен оқу нәтижелері
                  көрсетілмейді.
                </span>
              </p>
            </MobileDisclosure>
          </section>
        ) : (
          <TeachingProfile userId={user.id} admin={user.role === 'admin'} />
        )}
      </div>
    </>
  );
}
