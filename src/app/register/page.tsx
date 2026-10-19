import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { register } from '../actions';
import { Notice } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect('/dashboard');
  const { error } = await searchParams;
  return (
    <div className="auth-layout">
      <div className="auth-intro">
        <span className="eyebrow">АЛҒАШҚЫ ҚАДАМ</span>
        <h1>
          Білімге жол
          <br />
          әркімге ашық.
        </h1>
        <p>
          Курстарға жазылыңыз, жаңа дағдыларды меңгеріңіз немесе оқытушы ретінде біліміңізбен
          бөлісіңіз.
        </p>
        <div className="auth-benefits">
          <span>✓ Жеке оқу кабинеті</span>
          <span>✓ Тегін курстар</span>
          <span>✓ Сақталатын оқу барысы</span>
        </div>
      </div>
      <div className="panel auth-panel">
        <h2>Аккаунт құру</h2>
        <p className="muted">Өзіңіз туралы негізгі ақпаратты енгізіңіз.</p>
        <Notice error={error} />
        <form action={register} className="form-stack">
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
          <label className="checkbox-label">
            <input type="checkbox" name="teacher" />
            Оқытушы болуға өтінім бергім келеді
          </label>
          <p className="help-text">Оқытушы құқығын әкімші өтінімді мақұлдағаннан кейін береді.</p>
          <SubmitButton>Тіркелу →</SubmitButton>
        </form>
        <p className="auth-switch">
          Аккаунтыңыз бар ма? <Link href="/login">Кіру</Link>
        </p>
      </div>
    </div>
  );
}
