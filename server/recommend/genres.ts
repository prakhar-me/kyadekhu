/**
 * TMDB uses different genre ids for TV. Everything is scored in the movie
 * genre space; these maps convert in both directions.
 */
const TV_TO_MOVIE: Record<number, number[]> = {
  10759: [28, 12], // Action & Adventure
  10765: [878, 14], // Sci-Fi & Fantasy
  10768: [10752], // War & Politics
  10762: [10751], // Kids
};

const MOVIE_TO_TV: Record<number, number[]> = {
  28: [10759],
  12: [10759],
  878: [10765],
  14: [10765],
  10752: [10768],
  53: [80, 9648], // Thriller has no TV genre
  27: [9648, 10765], // nor does Horror
  10749: [18], // nor Romance
  10402: [18],
  36: [18, 10768],
};

/** Genres that make a title something other than a story to watch. */
export const NON_STORY_TV_GENRES = new Set([99, 10763, 10764, 10767]); // Documentary, News, Reality, Talk
export const DOCUMENTARY = 99;

export function toMovieGenres(type: 'movie' | 'tv', ids: number[]): number[] {
  if (type === 'movie') return ids;
  return [...new Set(ids.flatMap((id) => TV_TO_MOVIE[id] ?? [id]))];
}

export function toTvGenres(movieIds: number[]): number[] {
  return [...new Set(movieIds.flatMap((id) => MOVIE_TO_TV[id] ?? [id]))];
}

/** Genre ids in the given type's own space, from movie-space ids. */
export const nativeGenres = (type: 'movie' | 'tv', movieIds: number[]) => (type === 'movie' ? movieIds : toTvGenres(movieIds));
