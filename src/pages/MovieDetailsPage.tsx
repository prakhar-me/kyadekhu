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
import { ApiError, getMovieDetails, REGION } from '../lib/tmdb';
import { useWatchlist } from '../lib/watchlist';

export function MovieDetailsPage() {
  const { id } = useParams();
  const movieId = Number(id);
  const navigate = useNavigate();
  const details = useAsync(() => (movieId ? getMovieDetails(movieId) : null), [movieId]);
  const { has, toggle } = useWatchlist();
  const [backdropLoaded, setBackdropLoaded] = useState(false);

  useEffect(() => {
    setBackdropLoaded(false);
  }, [movieId]);
  useEffect(() => {
    if (details.data) document.title = `${details.data.title} (${yearOf(details.data.release_date)}) | Kya Dekhu`;
  }, [details.data]);

  if (!movieId) return <EmptyState title="Movie not found" />;
  if (details.status === 'error') {
    if (details.error instanceof ApiError && details.error.status === 404) {
      return (
        <EmptyState title="Movie not found" action={<Link to="/" className="btn-ghost">Search again</Link>}>
          TMDB has no movie with this ID.
        </EmptyState>
      );
    }
    return <ErrorState error={details.error} onRetry={details.retry} />;
  }
  if (!details.data) return <DetailsSkeleton />;

  const movie = details.data;
  const saved = has(movie.id);
  const director = movie.credits?.crew.find((c) => c.job === 'Director');
  const cast = (movie.credits?.cast ?? []).slice(0, 4).map((c) => c.name);
  const trailer = pickTrailer(movie.videos?.results);
  const region = movie['watch/providers']?.results?.[REGION];
  const language = movie.spoken_languages.find((l) => l.iso_639_1 === movie.original_language)?.english_name ?? languageName(movie.original_language);
  const facts = [yearOf(movie.release_date), formatRuntime(movie.runtime), language].filter(Boolean);

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
              {facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-ink" title={`${movie.vote_count.toLocaleString('en-IN')} votes on TMDB`}>
                <Star size={14} className="fill-accent text-accent" aria-hidden />
                {formatRating(movie.vote_average)}
                <span className="font-sans text-muted">TMDB</span>
              </span>
              {movie.imdb_id && (
                <a href={`https://www.imdb.com/title/${movie.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="text-link font-sans">
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
              {(director || cast.length > 0) && (
                <p className="mt-5 max-w-[62ch] text-[15px] text-muted">
                  {director && <>Directed by <span className="text-ink">{director.name}</span>. </>}
                  {cast.length > 0 && <>Starring <span className="text-ink">{cast.join(', ')}</span>.</>}
                </p>
              )}
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to={`/search?movie=${movie.id}&q=${encodeURIComponent(movie.title)}`} className="btn-primary">
                  <Sparkles size={16} aria-hidden />
                  Find movies like this
                </Link>
                <button type="button" onClick={() => toggle(movie)} className="btn-ghost" aria-pressed={saved}>
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

            <ReviewsSection reviews={movie.reviews?.results ?? []} movieId={movie.id} imdbId={movie.imdb_id} title={movie.title} />
          </div>

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <StreamingProviders region={region} title={movie.title} />
          </aside>
        </div>
      </div>
    </article>
  );
}
