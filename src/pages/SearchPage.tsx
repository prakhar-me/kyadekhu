import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorState, EmptyState } from '../components/EmptyState';
import { GridSkeleton } from '../components/LoadingSkeleton';
import { MovieCard } from '../components/MovieCard';
import { MovieGrid } from '../components/MovieGrid';
import { Poster } from '../components/Poster';
import { SearchBar } from '../components/SearchBar';
import { SurpriseButton } from '../components/SurpriseMe';
import { useAsync } from '../hooks/useAsync';
import { discover, discoverTitle, type DiscoveryResult } from '../lib/discovery';
import { languageName, yearOf } from '../lib/format';
import { getGenres } from '../lib/tmdb';
import type { CardItem, Genre, MediaType } from '../lib/types';

type Listed = CardItem & { vote_average: number; type?: MediaType };
type TypeFilter = 'movie' | 'tv' | 'both';

type Sort = 'relevance' | 'rating' | 'newest' | 'oldest';
interface Filters {
  genre: string;
  decade: string;
  rating: string;
  language: string;
  sort: Sort;
}
const NO_FILTERS: Filters = { genre: '', decade: '', rating: '', language: '', sort: 'relevance' };

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const movieId = Number(params.get('movie')) || undefined;
  const tvId = Number(params.get('tv')) || undefined;

  const result = useAsync<DiscoveryResult>(
    () => (movieId ? discoverTitle('movie', movieId) : tvId ? discoverTitle('tv', tvId) : q ? discover(q) : null),
    [q, movieId, tvId],
  );
  const genres = useAsync<Genre[]>(() => getGenres(), []);
  const genreNames = useMemo(() => new Map((genres.data ?? []).map((g) => [g.id, g.name])), [genres.data]);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [typeFilter, setTypeFilter] = useState<TypeFilter | null>(null);
  useEffect(() => {
    setFilters(NO_FILTERS);
    setTypeFilter(null);
  }, [q, movieId, tvId]);

  useEffect(() => {
    const data = result.data;
    if (data?.kind === 'seed') document.title = `Like ${data.seed.title} | Kya Dekhu`;
    else if (data?.kind === 'browse') document.title = `${data.title} movies | Kya Dekhu`;
    else if (q) document.title = `${q} | Kya Dekhu`;
  }, [result.data, q]);

  const all: Listed[] = result.data && result.data.kind !== 'none' ? result.data.movies : [];
  const seedType = result.data?.kind === 'seed' ? result.data.seed.type : 'movie';
  const activeType: TypeFilter = typeFilter ?? seedType;
  const hasBothTypes = result.data?.kind === 'seed';
  const movies = hasBothTypes
    ? activeType === 'both'
      ? [...all].sort((a, b) => ((b as { score?: number }).score ?? 0) - ((a as { score?: number }).score ?? 0))
      : all.filter((m) => (m.type ?? 'movie') === activeType)
    : all;

  return (
    <div className="page">
      <div className="max-w-2xl pt-2">
        <SearchBar variant="compact" initialValue={q} />
      </div>

      <div className="mt-10 sm:mt-14">
        {result.status === 'loading' && (
          <>
            <div className="mb-10">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton mt-3 h-12 w-2/3 max-w-md rounded" />
            </div>
            <GridSkeleton />
          </>
        )}

        {!q && !movieId && !tvId && (
          <EmptyState title="What are you in the mood for?" action={<SurpriseButton />}>
            Search for a movie you loved, a genre, or a mood like feel-good or mind-bending.
          </EmptyState>
        )}

        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.retry} />}

        {result.data?.kind === 'none' && (
          <EmptyState title={`Nothing found for “${q}”`} action={<SurpriseButton />}>
            Check the spelling, try the original title, or search a genre or mood instead.
          </EmptyState>
        )}

        {result.data?.kind === 'seed' && <SeedHeader result={result.data} />}
        {result.data?.kind === 'browse' && (
          <header className="mb-10 max-w-2xl">
            <p className="text-sm text-muted">Browsing</p>
            <h1 className="mt-1 display text-4xl leading-tight sm:text-6xl">{result.data.title}</h1>
            <p className="mt-3 text-muted">{result.data.blurb}</p>
          </header>
        )}

        {result.status === 'success' && result.data.kind !== 'none' && (
          <>
            {hasBothTypes && (
              <TypeToggle value={activeType} onChange={setTypeFilter} counts={{ movie: all.filter((m) => m.type === 'movie').length, tv: all.filter((m) => m.type === 'tv').length }} />
            )}
            <Results
              key={activeType}
              movies={movies}
              noun={hasBothTypes ? (activeType === 'tv' ? ['series', 'series'] : activeType === 'both' ? ['title', 'titles'] : ['movie', 'movies']) : ['movie', 'movies']}
              genreNames={genreNames}
              filters={filters}
              setFilters={setFilters}
            />
          </>
        )}
      </div>
    </div>
  );
}

function SeedHeader({ result }: { result: Extract<DiscoveryResult, { kind: 'seed' }> }) {
  const { seed, alternatives } = result;
  const href = `/${seed.type}/${seed.id}`;
  return (
    <header className="mb-10">
      <div className="flex items-end gap-5 sm:gap-7">
        <Link to={href} className="w-20 shrink-0 rounded-xl sm:w-28">
          <Poster path={seed.poster_path} title={seed.title} sizes="112px" eager />
        </Link>
        <div className="min-w-0 pb-1">
          <p className="text-sm text-muted">Because you liked</p>
          <h1 className="mt-1 display text-4xl leading-[1.05] sm:text-6xl">
            <Link to={href} className="hover:text-white">
              {seed.title}
            </Link>
          </h1>
          <p className="mt-2 text-sm text-muted">
            {[seed.type === 'tv' ? 'Series' : '', seed.year, seed.genres.join(', '), seed.people].filter(Boolean).join('. ')}
          </p>
        </div>
      </div>
      {alternatives.length > 0 && (
        <p className="mt-6 flex flex-wrap items-center gap-2 text-sm text-faint">
          <span className="mr-1">Not the one you meant?</span>
          {alternatives.map((m) => (
            <Link key={`${m.type}-${m.id}`} to={`/search?${m.type}=${m.id}&q=${encodeURIComponent(m.title)}`} className="pill">
              {m.title}
              {m.year ? ` (${m.type === 'tv' ? 'series, ' : ''}${m.year})` : m.type === 'tv' ? ' (series)' : ''}
            </Link>
          ))}
        </p>
      )}
    </header>
  );
}

function TypeToggle({ value, onChange, counts }: { value: TypeFilter; onChange: (t: TypeFilter) => void; counts: { movie: number; tv: number } }) {
  const options: [TypeFilter, string, number][] = [
    ['movie', 'Movies', counts.movie],
    ['tv', 'Series', counts.tv],
    ['both', 'Both', counts.movie + counts.tv],
  ];
  return (
    <div role="radiogroup" aria-label="Show" className="mb-4 inline-flex rounded-full border border-line p-1">
      {options.map(([v, label, n]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={n === 0}
          onClick={() => onChange(v)}
          className={`h-9 rounded-full px-4 text-sm transition-colors disabled:opacity-40 ${
            value === v ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Results({
  movies,
  noun,
  genreNames,
  filters,
  setFilters,
}: {
  movies: Listed[];
  noun: [string, string];
  genreNames: Map<number, string>;
  filters: Filters;
  setFilters: (f: Filters) => void;
}) {
  const options = useMemo(() => {
    const genreIds = new Set<number>();
    const languages = new Map<string, number>();
    const decades = new Set<number>();
    for (const m of movies) {
      m.genre_ids?.forEach((g) => genreIds.add(g));
      languages.set(m.original_language, (languages.get(m.original_language) ?? 0) + 1);
      const y = Number(yearOf(m.release_date));
      if (y) decades.add(Math.floor(y / 10) * 10);
    }
    return {
      genres: [...genreIds].filter((id) => genreNames.has(id)).sort((a, b) => genreNames.get(a)!.localeCompare(genreNames.get(b)!)),
      languages: [...languages.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code),
      decades: [...decades].sort((a, b) => b - a),
    };
  }, [movies, genreNames]);

  const visible = useMemo(() => {
    const list = movies.filter((m) => {
      if (filters.genre && !m.genre_ids?.includes(Number(filters.genre))) return false;
      if (filters.language && m.original_language !== filters.language) return false;
      if (filters.rating && m.vote_average < Number(filters.rating)) return false;
      if (filters.decade) {
        const y = Number(yearOf(m.release_date));
        if (!y || Math.floor(y / 10) * 10 !== Number(filters.decade)) return false;
      }
      return true;
    });
    const date = (m: Listed) => m.release_date || '0000';
    if (filters.sort === 'rating') list.sort((a, b) => b.vote_average - a.vote_average);
    if (filters.sort === 'newest') list.sort((a, b) => date(b).localeCompare(date(a)));
    if (filters.sort === 'oldest') list.sort((a, b) => date(a).localeCompare(date(b)));
    return list;
  }, [movies, filters]);

  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFilters({ ...filters, [key]: e.target.value });
  const active = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  if (movies.length === 0) {
    return (
      <EmptyState title="No recommendations yet" action={<SurpriseButton />}>
        TMDB doesn’t have enough data to suggest similar movies for this one. Try another title or a genre.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="frame mb-10 flex flex-wrap items-center gap-2 py-4">
        <label className="sr-only" htmlFor="f-sort">Sort by</label>
        <select id="f-sort" className="select" value={filters.sort} onChange={set('sort')}>
          <option value="relevance">Best match</option>
          <option value="rating">Highest rated</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <label className="sr-only" htmlFor="f-genre">Genre</label>
        <select id="f-genre" className="select" value={filters.genre} onChange={set('genre')}>
          <option value="">Any genre</option>
          {options.genres.map((id) => (
            <option key={id} value={id}>{genreNames.get(id)}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-decade">Release decade</label>
        <select id="f-decade" className="select" value={filters.decade} onChange={set('decade')}>
          <option value="">Any year</option>
          {options.decades.map((d) => (
            <option key={d} value={d}>{d}s</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-rating">Minimum rating</label>
        <select id="f-rating" className="select" value={filters.rating} onChange={set('rating')}>
          <option value="">Any rating</option>
          <option value="6">6+</option>
          <option value="7">7+</option>
          <option value="8">8+</option>
        </select>
        <label className="sr-only" htmlFor="f-language">Language</label>
        <select id="f-language" className="select" value={filters.language} onChange={set('language')}>
          <option value="">Any language</option>
          {options.languages.map((code) => (
            <option key={code} value={code}>{languageName(code)}</option>
          ))}
        </select>
        {active && (
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className="ml-1 min-h-[40px] px-2 text-sm text-muted text-link">
            Reset
          </button>
        )}
        <span className="ml-auto font-mono text-xs text-faint" aria-live="polite">
          {visible.length} {visible.length === 1 ? noun[0] : noun[1]}
        </span>
      </div>

      {visible.length ? (
        <MovieGrid>
          {visible.map((m, i) => (
            <MovieCard key={m.id} movie={m} genreNames={genreNames} eager={i < 5} />
          ))}
        </MovieGrid>
      ) : (
        <EmptyState
          title="No movies match these filters"
          action={
            <button type="button" className="btn-ghost" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </button>
          }
        />
      )}
    </>
  );
}
