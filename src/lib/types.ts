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

/** A movie in a result list, with the reasons it was surfaced. */
export interface RankedMovie extends MovieSummary {
  score: number;
  reason: string;
}
