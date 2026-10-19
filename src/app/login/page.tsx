import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { login } from '../actions';
import { Notice } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect('/dashboard');
  const { error } = await searchParams;
  return (
    <div className="auth-layout">
      <div className="auth-intro">
        <span className="eyebrow">БІЛІМГЕ ҚАЙТА ОРАЛЫҢЫЗ</span>
        <h1>
          Келесі қадам
          <br />
          сізден басталады.
        </h1>
        <p>Сабақтарыңыз бен оқу барысыңыз жеке кабинетте сақталады.</p>
        <div className="auth-quote">«Білім — таусылмайтын қазына.»</div>
      </div>
      <div className="panel auth-panel">
        <h2>Қош келдіңіз!</h2>
        <p className="muted">Оқуды жалғастыру үшін аккаунтыңызға кіріңіз.</p>
        <Notice error={error} />
        <form action={login} className="form-stack">
          <label>
            Email
            <input
              type="email"
              name="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="name@example.kz"
            />
          </label>
          <label>
            Құпиясөз
            <input
              type="password"
              name="password"
              required
              maxLength={128}
              autoComplete="current-password"
            />
          </label>
          <SubmitButton>Кіру →</SubmitButton>
        </form>
        <p className="auth-switch">
          Аккаунтыңыз жоқ па? <Link href="/register">Тіркелу</Link>
        </p>
        <p className="help-text">Құпиясөзді қалпына келтіру қызметі келесі кезеңде қосылады.</p>
      </div>
    </div>
  );
}
