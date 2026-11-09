import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Notice } from '@/components/ui';
import { LoginForm } from '@/components/login-form';
import { safeReturnPath } from '@/lib/management';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    next?: string;
    success?: string;
  }>;
}) {
  const query = await searchParams;
  const next = safeReturnPath(query.next);
  if (await currentUser()) redirect(next || '/');
  const { error } = query;
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
        <Notice error={error} success={query.success} />
        <LoginForm next={next} />
        <p className="auth-switch">
          Аккаунтыңыз жоқ па?{' '}
          <Link href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}>
            Тіркелу
          </Link>
        </p>
        <p className="help-text">Құпиясөзді қалпына келтіру қызметі келесі кезеңде қосылады.</p>
      </div>
    </div>
  );
}
