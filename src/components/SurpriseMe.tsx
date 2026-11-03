import { Shuffle, Star, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { randomMovie } from '../lib/discovery';
import { formatRating, languageName, yearOf } from '../lib/format';
import { ErrorState } from './EmptyState';
import { Poster } from './Poster';

const SurpriseContext = createContext<() => void>(() => {});
export const useSurprise = () => useContext(SurpriseContext);

export function SurpriseProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  return (
    <SurpriseContext.Provider value={show}>
      {children}
      {open && <SurpriseDialog onClose={() => setOpen(false)} />}
    </SurpriseContext.Provider>
  );
}

export function SurpriseButton({ className = '' }: { className?: string }) {
  const show = useSurprise();
  return (
    <button type="button" onClick={show} className={`btn-ghost ${className}`}>
      <Shuffle size={16} aria-hidden />
      Surprise me
    </button>
  );
}

function SurpriseDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const [round, setRound] = useState(0);
  const lastId = useRef<number>();
  const pick = useAsync(() => randomMovie(lastId.current), [round]);
  if (pick.data) lastId.current = pick.data.id;

  // No close() in cleanup: it fires the dialog's close event, which would
  // unmount the dialog straight away under StrictMode's double effects.
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const movie = pick.data;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-label="Surprise movie"
      className="rise m-auto w-[calc(100%-2rem)] max-w-2xl rounded-3xl border border-line bg-surface p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="relative p-5 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-muted hover:text-ink"
        >
          <X size={20} />
        </button>

        {pick.status === 'error' ? (
          <ErrorState error={pick.error} onRetry={pick.retry} />
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-52">
              {movie ? (
                <Poster key={movie.id} path={movie.poster_path} title={movie.title} sizes="208px" eager />
              ) : (
                <div className="skeleton aspect-[2/3] rounded-md" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="-rotate-2 font-hand text-[1.75rem] leading-none text-muted">tonight, try…</p>
              {movie ? (
                <>
                  <h2 className="mt-1 display text-3xl leading-tight sm:text-4xl">{movie.title}</h2>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 font-mono text-xs text-muted">
                    <span>{yearOf(movie.release_date)}</span>
                    <span>{languageName(movie.original_language)}</span>
                    <span className="inline-flex items-center gap-1 text-ink">
                      <Star size={13} className="fill-accent text-accent" aria-hidden />
                      {formatRating(movie.vote_average)}
                    </span>
                  </p>
                  <p className="mt-4 line-clamp-5 text-[15px] leading-relaxed text-ink/80">{movie.overview}</p>
                </>
              ) : (
                <div aria-busy="true">
                  <div className="skeleton mt-2 h-9 w-3/4 rounded" />
                  <div className="skeleton mt-3 h-4 w-1/3 rounded" />
                  <div className="skeleton mt-5 h-4 w-full rounded" />
                  <div className="skeleton mt-2 h-4 w-5/6 rounded" />
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                <button type="button" className="btn-primary" disabled={!movie} onClick={() => movie && go(`/movie/${movie.id}`)}>
                  View details
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!movie}
                  onClick={() => movie && go(`/search?movie=${movie.id}&q=${encodeURIComponent(movie.title)}`)}
                >
                  Find similar
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={pick.status === 'loading'}
                  onClick={() => setRound((r) => r + 1)}
                >
                  <Shuffle size={16} aria-hidden />
                  Another
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
