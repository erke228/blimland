import Link from 'next/link';
import type { Metadata } from 'next';
import { currentUser } from '@/lib/auth';
import { invitation } from '@/lib/management';
import { all, one } from '@/lib/db';
import { acceptInviteAction } from '@/app/management-actions';
import { PageHeading, Notice } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
export const metadata: Metadata = {
  title: 'Оқу тобына шақыру',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Join({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const invite = invitation(token);
  if (!invite)
    return (
      <div className="empty-state">
        <h1>Шақыру қолжетімсіз</h1>
        <p>
          Сілтеменің мерзімі аяқталған, лимиті біткен немесе оқытушы оны өшірген. Жаңа сілтеме
          сұраңыз.
        </p>
        <Link className="button outline" href="/profile#study-groups">
          Менің профилім
        </Link>
      </div>
    );
  const user = await currentUser();
  const member =
    !!user &&
    !!one(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
      invite.group_id,
      user.id,
    );
  const courses = all<{ title: string }>(
    `SELECT c.title FROM group_courses gc JOIN courses c ON c.id = gc.course_id WHERE gc.group_id = ? AND c.status = 'published' AND c.price_kzt = 0`,
    invite.group_id,
  );
  const next = encodeURIComponent(`/join/${token}`);
  return (
    <>
      <PageHeading
        eyebrow="ОҚУ ТОБЫНА ШАҚЫРУ"
        title={invite.name}
        description={`${invite.teacher} · ${invite.academic_year} · ${invite.semester === 3 ? 'Жазғы семестр' : `${invite.semester}-семестр`}`}
      />
      <Notice {...await searchParams} />
      <div className="panel narrow-panel">
        <h2>Топқа қосылыңыз</h2>
        <p>{invite.department}</p>
        <p className="muted">
          Қосылғаннан кейін оқытушы атыңызды, email мекенжайыңызды және топқа тағайындалған
          курстардағы оқу барысыңызды көреді. Топтастарға тек атыңыз бен рөліңіз көрінеді.
        </p>
        {courses.length > 0 && (
          <>
            <h3>Сізге ашылатын тегін курстар</h3>
            <ul>
              {courses.map((c, i) => (
                <li key={i}>{c.title}</li>
              ))}
            </ul>
          </>
        )}
        {member ? (
          <Link className="button primary" href="/profile#study-groups">
            Сіз бұл топқа қосылғансыз →
          </Link>
        ) : !user ? (
          <div className="button-row">
            <Link className="button primary" href={`/login?next=${next}`}>
              Кіру және қосылу
            </Link>
            <Link className="button outline" href={`/register?next=${next}`}>
              Тіркелу
            </Link>
          </div>
        ) : user.role !== 'student' ? (
          <div className="notice">
            Бұл шақыру студент аккаунтына арналған. Оқытушы топтарын өз кабинетінде басқарады.
          </div>
        ) : (
          <form action={acceptInviteAction}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton>Топқа қосылуды растау</SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}
