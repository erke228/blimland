import type { Metadata } from 'next';
import Link from 'next/link';
import { GraduationCap, ArrowUpRight } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { Navigation } from '@/components/navigation';
import { logout } from './actions';
import { settings } from '@/lib/management';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-sans/800.css';
import './globals.css';
import './management.css';

export async function generateMetadata(): Promise<Metadata> {
  const site = settings();
  return {
    title: {
      default: `${site.site_name} — Университеттің оқу кеңістігі`,
      template: `%s · ${site.site_name}`,
    },
    description:
      'Университет оқытушылары мен студенттеріне арналған дәрістер, оқу топтары және оқу барысын бақылау.',
  };
}
export const dynamic = 'force-dynamic';
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const site = settings();
  return (
    <html lang="kk" data-scroll-behavior="smooth">
      <body>
        <Navigation
          role={user?.role}
          siteName={site.site_name}
          institutionName={site.institution_name}
        />
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-context">
              <GraduationCap size={19} />
              <span>{site.institution_name} · Оқу кеңістігі</span>
            </div>
            <div className="account-nav">
              <span className="language-badge">ҚАЗ</span>
              {user ? (
                <>
                  <Link className="account" href="/profile">
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
          <main>
            {site.announcement && (
              <div className="site-announcement" role="status">
                {site.announcement}
              </div>
            )}
            {children}
          </main>
          <footer className="main-footer">
            <span>
              © {new Date().getFullYear()} {site.site_name}
            </span>
            <span>Әр қадам — жаңа мүмкіндік.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
