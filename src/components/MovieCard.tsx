import { Bookmark, BookmarkCheck, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatRating, yearOf } from '../lib/format';
import type { CardItem } from '../lib/types';
import { useWatchlist } from '../lib/watchlist';
import { Poster } from './Poster';

interface Props {
  movie: CardItem;
  genreNames?: Map<number, string>;
  eager?: boolean;
}

export function MovieCard({ movie, genreNames, eager }: Props) {
  const { has, toggle } = useWatchlist();
  const type = movie.type ?? 'movie';
  const href = `/${type}/${movie.id}`;
  const saved = has(type, movie.id);
  const year = yearOf(movie.release_date);
  const genres = (movie.genre_ids ?? [])
    .map((id) => genreNames?.get(id))
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');

  return (
    <article className="group relative flex flex-col">
      <Link to={href} className="block rounded-xl" aria-label={`${movie.title}${year ? ` (${year})` : ''}`}>
        <Poster
          path={movie.poster_path}
          title={movie.title}
          eager={eager}
          className="transition-transform duration-500 ease-out group-hover:-translate-y-1"
        />
      </Link>

      <button
        type="button"
        onClick={() => toggle({ ...movie, type })}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${movie.title} from watchlist` : `Save ${movie.title} to watchlist`}
        title={saved ? 'Remove from watchlist' : 'Save to watchlist'}
        className={`absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-bg/70 backdrop-blur transition-opacity duration-200 hover:bg-bg ${
          saved ? 'text-accent opacity-100' : 'text-ink opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'
        }`}
      >
        {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
      </button>

      <div className="mt-3 flex flex-1 flex-col">
        <h3 className="text-[1.05rem] font-semibold leading-snug tracking-[-0.03em]">
          <Link to={href} className="hover:text-white">
            {movie.title}
          </Link>
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
          <TypeBadge type={type} />
          {year && <span className="font-mono text-xs">{year}</span>}
          {genres && <span className="truncate">{genres}</span>}
          <span className="inline-flex items-center gap-1 font-mono text-xs text-ink">
            <Star size={12} className="fill-accent text-accent" aria-hidden />
            <span className="sr-only">TMDB rating</span>
            {formatRating(movie.vote_average)}
          </span>
        </p>
        {movie.overview && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-faint">{movie.overview}</p>}
        {movie.reason && <p className="mt-2 border-l border-white/20 pl-2 text-[13px] leading-snug text-ink/70">{movie.reason}</p>}
      </div>
    </article>
  );
}

export function TypeBadge({ type }: { type: 'movie' | 'tv' }) {
  return (
    <span className="rounded-full border border-line px-1.5 py-px text-[10px] font-medium uppercase leading-4 tracking-[0.08em] text-muted">
      {type === 'tv' ? 'Series' : 'Movie'}
    </span>
  );
}
