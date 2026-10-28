import Link from 'next/link';
import { Users, BookOpen, ArrowUpRight } from 'lucide-react';
import { listGroups } from '@/lib/management';
import { EmptyState, statusLabel } from './ui';
export async function GroupList({ userId }: { userId: string }) {
  const groups = await listGroups(userId);
  return groups.length ? (
    <div className="group-grid">
      {groups.map((g) => (
        <Link className="panel group-card" href={`/teacher/groups/${g.id}`} key={g.id}>
          <div className="between">
            <span className="group-symbol">
              <Users size={23} />
            </span>
            <span className={`status-badge ${g.status}`}>{statusLabel[g.status]}</span>
          </div>
          <h2>{g.name}</h2>
          <p>{g.department || 'Оқу тобы'}</p>
          <div className="group-meta">
            {g.academic_year} · {g.semester === 3 ? 'Жазғы семестр' : `${g.semester}-семестр`}
          </div>
          <div className="group-counts">
            <span>
              <Users size={15} />
              {g.member_count} студент
            </span>
            <span>
              <BookOpen size={15} />
              {g.course_count} курс
            </span>
          </div>
          <div className="group-card-footer">
            <span>{g.teacher}</span>
            <ArrowUpRight size={17} />
          </div>
        </Link>
      ))}
    </div>
  ) : (
    <EmptyState
      title="Оқу топтары әлі жоқ"
      description="Топ құрып, курстарды тағайындаңыз және студенттерді сілтемемен шақырыңыз."
      href="/teacher/groups/new"
      label="Алғашқы топты құру"
    />
  );
}
