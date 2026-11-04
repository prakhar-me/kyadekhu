import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { MovieCard } from '../components/MovieCard';
import { MovieGrid } from '../components/MovieGrid';
import { SurpriseButton } from '../components/SurpriseMe';
import { useAsync } from '../hooks/useAsync';
import { getGenres } from '../lib/tmdb';
import { useWatchlist } from '../lib/watchlist';

export function WatchlistPage() {
  const { list } = useWatchlist();
  const genres = useAsync(() => getGenres(), []);
  const genreNames = useMemo(() => new Map((genres.data ?? []).map((g) => [g.id, g.name])), [genres.data]);

  useEffect(() => {
    document.title = 'Watchlist | Kya Dekhu';
  }, []);

  return (
    <div className="page pt-6">
      <header className="mb-10 max-w-2xl">
        <h1 className="display text-5xl sm:text-6xl">Watchlist</h1>
        <p className="mt-3 text-muted">
          {list.length
            ? `${list.length} ${list.length === 1 ? 'movie' : 'movies'} saved on this device.`
            : 'Movies you save are kept on this device. No account needed.'}
        </p>
      </header>

      {list.length ? (
        <MovieGrid>
          {list.map((m) => (
            <MovieCard key={`${m.type}-${m.id}`} movie={m} genreNames={genreNames} />
          ))}
        </MovieGrid>
      ) : (
        <EmptyState
          title="Nothing saved yet"
          action={
            <>
              <Link to="/" className="btn-primary">
                Search movies
              </Link>
              <SurpriseButton />
            </>
          }
        >
          Tap the bookmark on any movie to keep it here for later.
        </EmptyState>
      )}
    </div>
  );
}
