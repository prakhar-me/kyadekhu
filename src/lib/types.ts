export interface Genre {
  id: number;
  name: string;
}

/** Shape returned by list endpoints (search, discover, similar, recommendations). */
export interface MovieSummary {
  id: number;
  title: string;
  original_title?: string;
  original_language: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  genre_ids?: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
}

export interface Paged<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  iso_639_1: string;
  published_at: string;
}

export interface Review {
  id: string;
  author: string;
  author_details: { name: string; username: string; rating: number | null; avatar_path: string | null };
  content: string;
  created_at: string;
  url: string;
}

export interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export interface RegionProviders {
  link?: string;
  flatrate?: Provider[];
  free?: Provider[];
  ads?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
}

export interface Keyword {
  id: number;
  name: string;
}

export interface MovieDetails extends Omit<MovieSummary, 'genre_ids'> {
  genres: Genre[];
  runtime: number | null;
  imdb_id: string | null;
  tagline: string | null;
  spoken_languages: { iso_639_1: string; english_name: string; name: string }[];
  videos?: { results: Video[] };
  reviews?: Paged<Review>;
  'watch/providers'?: { results: Record<string, RegionProviders> };
  credits?: { cast: CastMember[]; crew: CrewMember[] };
  keywords?: { keywords: Keyword[] };
}

export type MediaType = 'movie' | 'tv';

export interface TvDetails {
  id: number;
  name: string;
  original_name: string;
  original_language: string;
  overview: string;
  tagline: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string | null;
  status: string;
  in_production: boolean;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  last_episode_to_air?: { runtime: number | null } | null;
  genres: Genre[];
  created_by: { id: number; name: string }[];
  networks: { id: number; name: string }[];
  spoken_languages: { iso_639_1: string; english_name: string; name: string }[];
  vote_average: number;
  vote_count: number;
  videos?: { results: Video[] };
  reviews?: Paged<Review>;
  'watch/providers'?: { results: Record<string, RegionProviders> };
  aggregate_credits?: { cast: { id: number; name: string; total_episode_count: number }[] };
  external_ids?: { imdb_id: string | null };
}

/** A movie in a result list, with the reasons it was surfaced. */
export interface RankedMovie extends MovieSummary {
  type?: MediaType;
  score: number;
  reason: string;
}

/** A scored result from /api/discover (movie or series, normalised to movie field names). */
export interface Recommendation {
  type: MediaType;
  id: number;
  title: string;
  release_date: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  original_language: string;
  genre_ids: number[]; // movie genre ids, TV genres mapped
  reason: string;
  score: number;
  popularity?: number;
}

export interface SeedInfo {
  type: MediaType;
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
  people: string;
}

export interface Alternative {
  type: MediaType;
  id: number;
  title: string;
  year: number | null;
}

/** Anything a card can show. */
export type CardItem = Pick<MovieSummary, 'id' | 'title' | 'poster_path' | 'release_date' | 'vote_average' | 'overview' | 'original_language'> & {
  type?: MediaType;
  genre_ids?: number[];
  reason?: string;
};
