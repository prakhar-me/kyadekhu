import type { Genre, Keyword, MovieDetails, MovieSummary, Paged, TvDetails } from './types';

export const REGION = 'IN';
const LANGUAGE = 'en-US';
const SESSION_PREFIX = 'kd:api:';
const SESSION_TTL_MS = 30 * 60 * 1000;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | undefined>;

const inflight = new Map<string, Promise<unknown>>();

function readSession<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw) as { t: number; v: T };
    return Date.now() - t < SESSION_TTL_MS ? v : undefined;
  } catch {
    return undefined;
  }
}

function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    /* storage full or unavailable — memory cache still works */
  }
}

/** GET a TMDB endpoint through the server proxy, deduplicated and cached. */
export function tmdb<T>(path: string, params: Params = {}): Promise<T> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries({ language: LANGUAGE, ...params })) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  search.sort();
  const key = `${path}?${search}`;

  const cached = inflight.get(key);
  if (cached) return cached as Promise<T>;
  const stored = readSession<T>(key);
  if (stored !== undefined) return Promise.resolve(stored);

  const request = fetch(`/api/tmdb/${path}?${search}`)
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError(body?.message ?? 'Something went wrong loading movies.', res.status, body?.error);
      }
      writeSession(key, body);
      return body as T;
    })
    .catch((err) => {
      inflight.delete(key);
      if (err instanceof ApiError) throw err;
      throw new ApiError('Could not connect. Check your internet connection and try again.', 0, 'network');
    });

  inflight.set(key, request);
  return request;
}

export interface MultiResult {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
}

export const searchMulti = (query: string) =>
  tmdb<Paged<MultiResult>>('search/multi', { query, include_adult: false });

export const searchKeyword = (query: string) => tmdb<Paged<Keyword>>('search/keyword', { query });

export const discoverMovies = (params: Params) =>
  tmdb<Paged<MovieSummary>>('discover/movie', { include_adult: false, ...params });

export const getMovieDetails = (id: number) =>
  tmdb<MovieDetails>(`movie/${id}`, {
    append_to_response: 'videos,reviews,watch/providers,credits,keywords',
    include_video_language: 'en,hi,null',
  });

export const getTvDetails = (id: number) =>
  tmdb<TvDetails>(`tv/${id}`, {
    append_to_response: 'videos,reviews,watch/providers,aggregate_credits,external_ids',
    include_video_language: 'en,hi,null',
  });

let genresPromise: Promise<Genre[]> | null = null;
export function getGenres(): Promise<Genre[]> {
  genresPromise ??= tmdb<{ genres: Genre[] }>('genre/movie/list')
    .then((r) => r.genres)
    .catch((err) => {
      genresPromise = null;
      throw err;
    });
  return genresPromise;
}
