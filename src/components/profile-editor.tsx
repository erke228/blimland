import type { User } from '@/lib/auth';
import type { ProfileDetails } from '@/lib/profile';
import { saveProfileAction } from '@/app/management-actions';
import { credentialAction } from '@/app/profile-actions';
import { SubmitButton } from './submit-button';
import Link from 'next/link';
import { FilePicker } from './file-picker';
export function ProfileEditor({
  user,
  details,
  tab,
}: {
  user: User;
  details: ProfileDetails;
  tab?: string;
}) {
  const selected = ['contacts', 'security'].includes(tab || '') ? tab : 'personal';
  const values = {
    name: user.name,
    department: user.department,
    academicTitle: user.academic_title,
    university: details.university,
    about: details.bio,
    phone: details.phone,
    city: details.city,
    website: details.website,
  };
  return (
    <section className="panel profile-edit-panel">
      <nav className="workspace-tabs profile-tabs">
        <Link className={selected === 'personal' ? 'selected' : ''} href="/profile">
          Жеке мәліметтер
        </Link>
        <Link className={selected === 'contacts' ? 'selected' : ''} href="/profile?tab=contacts">
          Байланыс
        </Link>
        <Link className={selected === 'security' ? 'selected' : ''} href="/profile?tab=security">
          Қауіпсіздік
        </Link>
      </nav>
      {selected === 'personal' && (
        <form
          action="/api/profile/avatar"
          method="post"
          encType="multipart/form-data"
          className="profile-photo-form"
        >
          <div className="profile-avatar large">
            {details.has_avatar ? (
              <img
                src={`/api/profile/avatar?v=${details.avatar_version}`}
                alt="Профиль суретіңіз"
              />
            ) : (
              user.name[0]
            )}
          </div>
          <div>
            <h3>Профиль суреті</h3>
            <FilePicker
              label="Профиль суретін таңдау"
              accept="image/jpeg,image/png,image/webp"
              image
              previewImage
              required
              help="JPG / PNG / WebP · 5 МБ дейін. Сурет шаршы пішімде сақталады."
            />
            <SubmitButton className="button outline small">Суретті сақтау</SubmitButton>
          </div>
        </form>
      )}
      {selected !== 'security' ? (
        <form action={saveProfileAction} className="form-stack">
          {Object.entries(values)
            .filter(([key]) =>
              selected === 'personal'
                ? ['phone', 'city', 'website'].includes(key)
                : !['phone', 'city', 'website'].includes(key),
            )
            .map(([key, value]) => (
              <input type="hidden" key={key} name={key} value={value} />
            ))}
          {selected === 'personal' ? (
            <>
              <h2>Өзіңіз туралы</h2>
              <label>
                Аты-жөні
                <input name="name" required minLength={2} maxLength={80} defaultValue={user.name} />
              </label>
              <label>
                Университет
                <input name="university" maxLength={180} defaultValue={details.university} />
              </label>
              <label>
                Факультет / кафедра
                <input name="department" maxLength={180} defaultValue={user.department} />
              </label>
              <label>
                Лауазым / академиялық мәртебе
                <input name="academicTitle" maxLength={120} defaultValue={user.academic_title} />
              </label>
              <label>
                Өзіңіз туралы қысқаша
                <textarea name="about" rows={4} maxLength={3000} defaultValue={details.bio} />
              </label>
            </>
          ) : (
            <>
              <h2>Байланыс мәліметтері</h2>
              <p className="help-text">Бұл мәліметтер топтастарға көрсетілмейді.</p>
              <label>
                Телефон
                <input name="phone" type="tel" maxLength={40} defaultValue={details.phone} />
              </label>
              <label>
                Қала
                <input name="city" maxLength={120} defaultValue={details.city} />
              </label>
              <label>
                Сайт / портфолио
                <input
                  name="website"
                  type="url"
                  maxLength={500}
                  defaultValue={details.website}
                  placeholder="https://…"
                />
              </label>
              <div className="readonly-field">
                <span>Email</span>
                <strong>{user.email}</strong>
                <small>Email өзгерту — «Қауіпсіздік» бөлімінде.</small>
              </div>
            </>
          )}
          <SubmitButton>Өзгерістерді сақтау</SubmitButton>
        </form>
      ) : (
        <div className="profile-security">
          <h2>Аккаунт қауіпсіздігі</h2>
          <p className="help-text">
            Email немесе құпиясөз өзгергенде барлық сессия аяқталып, қайта кіресіз.
          </p>
          <form action={credentialAction} className="form-stack">
            <h3>Email өзгерту</h3>
            <input type="hidden" name="operation" value="email" />
            <label>
              Жаңа email
              <input name="email" type="email" required maxLength={254} defaultValue={user.email} />
            </label>
            <label>
              Ағымдағы құпиясөз
              <input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <SubmitButton className="button outline">Email сақтау</SubmitButton>
          </form>
          <form action={credentialAction} className="form-stack">
            <h3>Құпиясөз өзгерту</h3>
            <input type="hidden" name="operation" value="password" />
            <label>
              Ағымдағы құпиясөз
              <input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label>
              Жаңа құпиясөз
              <input
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
              <small>Кемінде 12 таңба.</small>
            </label>
            <label>
              Жаңа құпиясөзді қайталау
              <input
                name="confirmation"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <SubmitButton className="button outline">Құпиясөзді сақтау</SubmitButton>
          </form>
        </div>
      )}
    </section>
  );
}
