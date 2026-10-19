import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { BasicPerson } from '@/lib/student-community';

export const roleLabel = { student: 'Студент', teacher: 'Оқытушы', admin: 'Бас әкімші' };
export function PersonCard({ person }: { person: BasicPerson }) {
  return (
    <Link className="person-card" href={`/profile/people/${person.id}`}>
      <span
        className={`person-avatar ${person.role !== 'student' ? 'teacher' : ''}`}
        aria-hidden="true"
      >
        {person.name.trim().slice(0, 1)}
      </span>
      <span className="person-name">
        <strong>{person.name}</strong>
        <small>{roleLabel[person.role]}</small>
      </span>
      <ChevronRight size={15} aria-hidden="true" />
    </Link>
  );
}
