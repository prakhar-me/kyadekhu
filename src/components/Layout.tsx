import { Bookmark, House, Shuffle, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useWatchlist } from '../lib/watchlist';
import { useSurprise } from './SurpriseMe';

export function Wordmark() {
  return (
    <Link to="/" className="display text-[1.3rem] leading-none" aria-label="Kya Dekhu, home">
      kya dekhu<span className="text-accent">?</span>
    </Link>
  );
}

function NavIcon({ to, label, icon: Icon, badge }: { to: string; label: string; icon: LucideIcon; badge?: number }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      aria-label={badge ? `${label} (${badge})` : label}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`relative grid h-10 w-10 place-items-center rounded-full transition-colors ${
        active ? 'bg-white/10 text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      <Icon size={17} aria-hidden />
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1 font-mono text-[10px] font-medium leading-none text-bg">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function Header() {
  const { list } = useWatchlist();
  const surprise = useSurprise();
  const onHome = useLocation().pathname === '/';

  return (
    <header className="relative z-30 pb-2 pt-3 sm:pt-4">
      <div className="page flex h-12 items-center">
        <Wordmark />
        {/* Floating nav: pinned to the top on desktop, to the bottom (thumb reach) on phones. */}
        <nav
          aria-label="Main"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 sm:bottom-auto sm:top-4"
        >
          <div className="capsule flex items-center gap-0.5 p-1">
            <NavIcon to="/" label="Home" icon={House} />
            <NavIcon to="/watchlist" label="Watchlist" icon={Bookmark} badge={list.length} />
          </div>
          {!onHome && (
          <button
            type="button"
            onClick={surprise}
            aria-label="Surprise me"
            className="flex h-12 min-w-12 items-center justify-center gap-2.5 rounded-full bg-ink p-1 text-[15px] font-medium text-bg shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-colors hover:bg-white/85 sm:justify-start sm:pr-5"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full sm:bg-bg sm:text-ink">
              <Shuffle size={16} aria-hidden />
            </span>
            <span className="hidden sm:inline">Surprise me</span>
          </button>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="page mt-24 border-t border-line pb-28 pt-8 text-[13px] leading-relaxed text-faint sm:pb-8">
      <p>
        Movie data and images from{' '}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="text-link text-muted">
          TMDB
        </a>
        . This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability by{' '}
        <a href="https://www.justwatch.com/in" target="_blank" rel="noopener noreferrer" className="text-link text-muted">
          JustWatch
        </a>
        .
      </p>
    </footer>
  );
}

export function Layout() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
