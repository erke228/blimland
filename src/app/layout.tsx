import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { GraduationCap, ArrowUpRight, BookOpen } from 'lucide-react';
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
import './profile.css';
import './documents.css';
import './library.css';
import './mobile.css';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f5f8f6',
};
export async function generateMetadata(): Promise<Metadata> {
  const site = await settings();
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
  const site = await settings();
  return (
    <html lang="kk" data-scroll-behavior="smooth">
      <body data-role={user?.role || 'guest'}>
        <a className="skip-content" href="#main-content">
          Мазмұнға өту
        </a>
        <Navigation
          role={user?.role}
          siteName={site.site_name}
          institutionName={site.institution_name}
        />
        <div className="app-shell">
          <header className="topbar">
            <Link className="mobile-brand" href="/" aria-label={`${site.site_name} — басты бет`}>
              <span>
                <BookOpen size={22} />
              </span>
              <strong>{site.site_name}</strong>
            </Link>
            <div className="topbar-context">
              <GraduationCap size={19} />
              <span>{site.institution_name} · Оқу кеңістігі</span>
            </div>
            <div className="account-nav">
              <span className="language-badge">ҚАЗ</span>
              {user ? (
                <>
                  <Link
                    className="account"
                    href="/profile"
                    aria-label={`${user.name} — менің профилім`}
                  >
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
          <main id="main-content">
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
