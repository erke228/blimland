import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { register } from '../actions';
import { Notice } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { safeReturnPath, settings } from '@/lib/management';
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
}) {
  const query = await searchParams;
  const next = safeReturnPath(query.next);
  if (await currentUser()) redirect(next || '/');
  const { error } = query;
  const open = !!(await settings()).registration_open;
  return (
    <div className="auth-layout">
      <div className="auth-intro">
        <span className="eyebrow">АЛҒАШҚЫ ҚАДАМ</span>
        <h1>
          Білімге жол
          <br />
          әркімге ашық.
        </h1>
        <p>Пәндерге жазылып, дәрістерді оқыңыз және жеке кабинетте оқу барысын бақылаңыз.</p>
        <div className="auth-benefits">
          <span>✓ Жеке оқу кабинеті</span>
          <span>✓ Оқу материалдары</span>
          <span>✓ Сақталатын оқу барысы</span>
        </div>
      </div>
      <div className="panel auth-panel">
        <h2>Аккаунт құру</h2>
        <p className="muted">Өзіңіз туралы негізгі ақпаратты енгізіңіз.</p>
        <Notice error={error} />
        {!open && (
          <div className="notice">
            Ашық тіркелу уақытша жабық. Университет әкімшісіне хабарласыңыз.
          </div>
        )}
        {open && (
          <form action={register} className="form-stack">
            <input type="hidden" name="next" value={next} />
            <label>
              Аты-жөніңіз
              <input name="name" required minLength={2} maxLength={80} autoComplete="name" />
            </label>
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
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
              <small>Кемінде 12 таңба қолданыңыз.</small>
            </label>
            <SubmitButton>Тіркелу →</SubmitButton>
          </form>
        )}
        <p className="auth-switch">
          Аккаунтыңыз бар ма?{' '}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>Кіру</Link>
        </p>
      </div>
    </div>
  );
}
