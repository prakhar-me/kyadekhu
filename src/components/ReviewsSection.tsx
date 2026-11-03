import { Star } from 'lucide-react';
import { useState } from 'react';
import type { Review } from '../lib/types';

interface Props {
  reviews: Review[];
  movieId: number;
  imdbId: string | null;
  title: string;
}

const EXCERPT = 420;

function clean(text: string) {
  return text.replace(/\r/g, '').replace(/[*_]{1,2}([^*_\n]+)[*_]{1,2}/g, '$1')
    .replace(/\*+/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function ReviewItem({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false);
  const body = clean(review.content);
  const long = body.length > EXCERPT;
  const text = expanded || !long ? body : `${body.slice(0, EXCERPT).replace(/\s+\S*$/, '')}…`;
  const rating = review.author_details.rating;
  const date = new Date(review.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });

  return (
    <li className="border-t border-line py-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-medium">{review.author_details.name || review.author}</p>
        <div className="flex shrink-0 items-center gap-3 font-mono text-xs text-muted">
          {rating != null && (
            <span className="inline-flex items-center gap-1 text-ink">
              <Star size={13} className="fill-accent text-accent" aria-hidden />
              {rating}/10
            </span>
          )}
          <time dateTime={review.created_at}>{date}</time>
        </div>
      </div>
      <p className="mt-3 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-ink/80">{text}</p>
      <div className="mt-3 flex gap-5 text-sm">
        {long && (
          <button type="button" className="text-link text-muted" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Show less' : 'Read full review'}
          </button>
        )}
      </div>
    </li>
  );
}

export function ReviewsSection({ reviews, movieId, imdbId, title }: Props) {
  const tmdbUrl = `https://www.themoviedb.org/movie/${movieId}/reviews`;
  const imdbUrl = imdbId ? `https://www.imdb.com/title/${imdbId}/reviews/` : undefined;

  return (
    <section aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="section-title">
        Reviews
      </h2>
      {reviews.length ? (
        <ul className="mt-4">
          {reviews.slice(0, 4).map((r) => (
            <ReviewItem key={r.id} review={r} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-muted">No audience reviews for {title} on TMDB yet.</p>
      )}
      <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
        <a href={tmdbUrl} target="_blank" rel="noopener noreferrer" className="text-link">
          More reviews on TMDB
        </a>
        {imdbUrl && (
          <a href={imdbUrl} target="_blank" rel="noopener noreferrer" className="text-link">
            Reviews on IMDb
          </a>
        )}
      </p>
    </section>
  );
}
