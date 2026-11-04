import { ArrowLeft, Bookmark, BookmarkCheck, Sparkles, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorState, EmptyState } from '../components/EmptyState';
import { DetailsSkeleton } from '../components/LoadingSkeleton';
import { Poster } from '../components/Poster';
import { ReviewsSection } from '../components/ReviewsSection';
import { StreamingProviders } from '../components/StreamingProviders';
import { pickTrailer, TrailerPlayer } from '../components/TrailerPlayer';
import { useAsync } from '../hooks/useAsync';
import { backdropSrcSet, formatRating, formatRuntime, imageUrl, languageName, yearOf } from '../lib/format';
import { ApiError, getMovieDetails, getTvDetails, REGION } from '../lib/tmdb';
import type { Genre, MediaType, MovieDetails, RegionProviders, Review, TvDetails, Video } from '../lib/types';
import { useWatchlist } from '../lib/watchlist';

/** What the page shows, built from either a movie or a series. */
interface TitleView {
  type: MediaType;
  id: number;
  title: string;
  year: string;
  tagline: string | null;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: Genre[];
  facts: string[];
  vote_average: number;
  vote_count: number;
  imdbId: string | null;
  people: { label: string; names: string[] }[];
  videos: Video[];
  reviews: Review[];
  region: RegionProviders | undefined;
  saveable: { type: MediaType; id: number; title: string; poster_path: string | null; release_date: string; vote_average: number; overview: string; original_language: string; genre_ids: number[] };
}

const languageOf = (code: string, spoken: { iso_639_1: string; english_name: string }[]) =>
  spoken.find((l) => l.iso_639_1 === code)?.english_name ?? languageName(code);

function fromMovie(m: MovieDetails): TitleView {
  const director = m.credits?.crew.find((c) => c.job === 'Director');
  return {
    type: 'movie',
    id: m.id,
    title: m.title,
    year: yearOf(m.release_date),
    tagline: m.tagline,
    overview: m.overview,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    genres: m.genres,
    facts: [yearOf(m.release_date), formatRuntime(m.runtime), languageOf(m.original_language, m.spoken_languages)].filter(Boolean),
    vote_average: m.vote_average,
    vote_count: m.vote_count,
    imdbId: m.imdb_id,
    people: [
      ...(director ? [{ label: 'Directed by', names: [director.name] }] : []),
      { label: 'Starring', names: (m.credits?.cast ?? []).slice(0, 4).map((c) => c.name) },
    ],
    videos: m.videos?.results ?? [],
    reviews: m.reviews?.results ?? [],
    region: m['watch/providers']?.results?.[REGION],
    saveable: { ...m, type: 'movie', release_date: m.release_date ?? '', genre_ids: m.genres.map((g) => g.id) },
  };
}

function fromTv(t: TvDetails): TitleView {
  const start = yearOf(t.first_air_date);
  const ended = !t.in_production && (t.status === 'Ended' || t.status === 'Canceled');
  const end = ended ? yearOf(t.last_air_date ?? '') : 'Ongoing';
  const years = start ? (end && end !== start ? `${start} to ${end}` : ended ? start : `${start} to Ongoing`) : '';
  const runtime = t.episode_run_time?.[0] ?? t.last_episode_to_air?.runtime ?? null;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return {
    type: 'tv',
    id: t.id,
    title: t.name,
    year: start,
    tagline: t.tagline || null,
    overview: t.overview,
    poster_path: t.poster_path,
    backdrop_path: t.backdrop_path,
    genres: t.genres,
    facts: [
      years,
      t.number_of_seasons ? `${plural(t.number_of_seasons, 'season')}, ${plural(t.number_of_episodes, 'episode')}` : '',
      runtime ? `${formatRuntime(runtime)} episodes` : '',
      languageOf(t.original_language, t.spoken_languages),
    ].filter(Boolean),
    vote_average: t.vote_average,
    vote_count: t.vote_count,
    imdbId: t.external_ids?.imdb_id ?? null,
    people: [
      ...(t.created_by.length ? [{ label: 'Created by', names: t.created_by.map((c) => c.name) }] : []),
      ...(t.networks.length ? [{ label: 'On', names: t.networks.slice(0, 2).map((n) => n.name) }] : []),
      { label: 'Starring', names: (t.aggregate_credits?.cast ?? []).slice(0, 4).map((c) => c.name) },
    ],
    videos: t.videos?.results ?? [],
    reviews: t.reviews?.results ?? [],
    region: t['watch/providers']?.results?.[REGION],
    saveable: {
      type: 'tv',
      id: t.id,
      title: t.name,
      poster_path: t.poster_path,
      release_date: t.first_air_date ?? '',
      vote_average: t.vote_average,
      overview: t.overview,
      original_language: t.original_language,
      genre_ids: t.genres.map((g) => g.id),
    },
  };
}

const loadTitle = (type: MediaType, id: number): Promise<TitleView> =>
  type === 'tv' ? getTvDetails(id).then(fromTv) : getMovieDetails(id).then(fromMovie);

export function MovieDetailsPage({ type = 'movie' }: { type?: MediaType }) {
  const { id } = useParams();
  const movieId = Number(id);
  const navigate = useNavigate();
  const details = useAsync(() => (movieId ? loadTitle(type, movieId) : null), [type, movieId]);
  const noun = type === 'tv' ? 'Series' : 'Movie';
  const { has, toggle } = useWatchlist();
  const [backdropLoaded, setBackdropLoaded] = useState(false);

  useEffect(() => {
    setBackdropLoaded(false);
  }, [movieId]);
  useEffect(() => {
    if (details.data) document.title = `${details.data.title} (${details.data.year}) | Kya Dekhu`;
  }, [details.data]);

  if (!movieId) return <EmptyState title={`${noun} not found`} />;
  if (details.status === 'error') {
    if (details.error instanceof ApiError && details.error.status === 404) {
      return (
        <EmptyState title={`${noun} not found`} action={<Link to="/" className="btn-ghost">Search again</Link>}>
          TMDB has no {noun.toLowerCase()} with this ID.
        </EmptyState>
      );
    }
    return <ErrorState error={details.error} onRetry={details.retry} />;
  }
  if (!details.data) return <DetailsSkeleton />;

  const movie = details.data;
  const saved = has(movie.type, movie.id);
  const trailer = pickTrailer(movie.videos);
  const people = movie.people.filter((p) => p.names.length);

  return (
    <article>
      <div className="relative -mt-[68px] h-[44vh] min-h-[280px] overflow-hidden sm:-mt-[72px] sm:h-[62vh]">
        {movie.backdrop_path && (
          <img
            src={imageUrl(movie.backdrop_path, 'w1280')}
            srcSet={backdropSrcSet(movie.backdrop_path)}
            sizes="100vw"
            alt=""
            {...{ fetchpriority: "high" }}
            data-loaded={backdropLoaded}
            onLoad={() => setBackdropLoaded(true)}
            className="img-fade absolute inset-0 h-full w-full object-cover object-top"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-bg/30" />
      </div>

      <div className="page relative -mt-40 sm:-mt-52">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="capsule mb-6 inline-flex h-10 items-center gap-2 px-4 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={16} aria-hidden />
          Back
        </button>

        <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:gap-10">
          <div className="w-36 shrink-0 shadow-2xl shadow-black/60 sm:w-60">
            <Poster path={movie.poster_path} title={movie.title} sizes="(min-width: 640px) 240px, 144px" eager />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="display text-[2.6rem] leading-[1] sm:text-6xl lg:text-7xl">{movie.title}</h1>
            {movie.tagline && <p className="mt-3 -ml-0.5 font-hand text-[1.9rem] leading-none text-ink/75 sm:text-4xl">{movie.tagline}</p>}
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted sm:text-[13px]">
              {movie.facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-ink" title={`${movie.vote_count.toLocaleString('en-IN')} votes on TMDB`}>
                <Star size={14} className="fill-accent text-accent" aria-hidden />
                {formatRating(movie.vote_average)}
                <span className="font-sans text-muted">TMDB</span>
              </span>
              {movie.imdbId && (
                <a href={`https://www.imdb.com/title/${movie.imdbId}/`} target="_blank" rel="noopener noreferrer" className="text-link font-sans">
                  IMDb page
                </a>
              )}
            </p>
            {movie.genres.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {movie.genres.map((g) => (
                  <li key={g.id}>
                    <Link to={`/search?q=${encodeURIComponent(g.name)}`} className="pill">
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-10 grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
          <div className="flex flex-col gap-14">
            <section aria-label="Synopsis">
              <p className="max-w-[62ch] text-xl font-medium leading-[1.45] tracking-[-0.03em] text-ink/90 sm:text-[1.45rem]">
                {movie.overview || 'No synopsis available yet.'}
              </p>
              {people.length > 0 && (
                <p className="mt-5 max-w-[62ch] text-[15px] text-muted">
                  {people.map((p) => (
                    <span key={p.label}>
                      {p.label} <span className="text-ink">{p.names.join(', ')}</span>.{' '}
                    </span>
                  ))}
                </p>
              )}
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to={`/search?${movie.type}=${movie.id}&q=${encodeURIComponent(movie.title)}`} className="btn-primary">
                  <Sparkles size={16} aria-hidden />
                  {movie.type === 'tv' ? 'Find series like this' : 'Find movies like this'}
                </Link>
                <button type="button" onClick={() => toggle(movie.saveable)} className="btn-ghost" aria-pressed={saved}>
                  {saved ? <BookmarkCheck size={16} className="text-accent" aria-hidden /> : <Bookmark size={16} aria-hidden />}
                  {saved ? 'Saved to watchlist' : 'Save to watchlist'}
                </button>
              </div>
            </section>

            <section aria-labelledby="trailer-title">
              <h2 id="trailer-title" className="section-title mb-5">
                Trailer
              </h2>
              <TrailerPlayer video={trailer} title={movie.title} />
            </section>

            <ReviewsSection reviews={movie.reviews} type={movie.type} movieId={movie.id} imdbId={movie.imdbId} title={movie.title} />
          </div>

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <StreamingProviders region={movie.region} title={movie.title} />
          </aside>
        </div>
      </div>
    </article>
  );
}
