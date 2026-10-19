import type { Metadata } from 'next';
import Link from 'next/link';
import { GraduationCap, ArrowUpRight } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { Navigation } from '@/components/navigation';
import { logout } from './actions';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'BilimHub — Білімге бірге қадам', template: '%s · BilimHub' },
  description: 'Қазақ тіліндегі оқу кеңістігі: курстар, бейнесабақтар және білімді дамыту.',
};
export const dynamic = 'force-dynamic';
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="kk" data-scroll-behavior="smooth">
      <body>
        <Navigation role={user?.role} />
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-context">
              <GraduationCap size={19} />
              <span>Үйреніңіз. Дамыңыз. Бөлісіңіз.</span>
            </div>
            <div className="account-nav">
              <span className="language-badge">ҚАЗ</span>
              {user ? (
                <>
                  <Link className="account" href="/dashboard">
                    <span className="avatar">{user.name[0]}</span>
                    <span>{user.name}</span>
                  </Link>
                  <form action={logout}>
                    <button className="text-button">Шығу</button>
                  </form>
                </>
              ) : (
                <>
                  <Link className="login-link" href="/login">
                    Кіру
                  </Link>
                  <Link className="button primary small" href="/register">
                    Тіркелу <ArrowUpRight size={15} />
                  </Link>
                </>
              )}
            </div>
          </header>
          <main>{children}</main>
          <footer className="main-footer">
            <span>© {new Date().getFullYear()} BilimHub</span>
            <span>Әр қадам — жаңа мүмкіндік.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
