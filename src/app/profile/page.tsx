import { requireUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { applyTeacher } from '@/app/actions';
import { saveProfileAction } from '@/app/management-actions';
import { Notice, PageHeading } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await requireUser();
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
        eyebrow="ЖЕКЕ АККАУНТ"
        title="Менің профилім"
        description="Университеттегі профиліңізді жаңартыңыз."
      />
      <Notice {...await searchParams} />
      <div className="panel narrow-panel">
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
              placeholder="Мысалы, аға оқытушы немесе 2-курс студенті"
            />
          </label>
          <div className="readonly-field">
            <span>Email</span>
            <strong>{user.email}</strong>
            <small>Email мен аккаунт рөлін бас әкімші өзгертеді.</small>
          </div>
          <SubmitButton>Профильді сақтау</SubmitButton>
        </form>
      </div>
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
    </>
  );
}
