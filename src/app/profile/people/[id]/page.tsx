import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { basicProfile } from '@/lib/student-community';
import { roleLabel } from '@/components/person-card';

export const metadata: Metadata = {
  title: 'Қысқаша профиль',
  robots: { index: false, follow: false },
};
export default async function PersonProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (id === user.id) redirect('/profile');
  const person = basicProfile(user.id, id);
  if (!person) notFound();
  return (
    <>
      <Link className="back-link" href="/profile#study-groups">
        <ArrowLeft size={15} />
        Профильге оралу
      </Link>
      <article className="panel basic-profile">
        <span className="profile-avatar" aria-hidden="true">
          {person.name.trim().slice(0, 1)}
        </span>
        <span className="people-label">ҚЫСҚАША ПРОФИЛЬ</span>
        <h1>{person.name}</h1>
        <span className="basic-role">{roleLabel[person.role]}</span>
        <p className="community-privacy">
          <LockKeyhole size={15} />
          <span>Жеке байланыс деректері мен оқу нәтижелері жабық.</span>
        </p>
      </article>
    </>
  );
}
