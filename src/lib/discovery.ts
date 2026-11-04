import { normalize } from './format';
import { ApiError, discoverMovies, getGenres, searchKeyword } from './tmdb';
import type { Alternative, Genre, MediaType, MovieSummary, RankedMovie, Recommendation, SeedInfo } from './types';

/* ------------------------------------------------------------------------ */
/* Query vocabulary                                                          */
/* ------------------------------------------------------------------------ */

interface Mood {
  label: string;
  /** TMDB genre ids, OR'd together. */
  genres: number[];
  withoutGenres?: number[];
  /** Keyword names resolved to TMDB keyword ids at query time. */
  keywords: string[];
  blurb: string;
}

export const MOODS: Record<string, Mood> = {
  'feel-good': {
    label: 'feel-good',
    genres: [35, 10751, 10402, 16],
    withoutGenres: [27, 53, 80, 10752],
    keywords: ['feel-good', 'friendship', 'coming of age'],
    blurb: 'Light, warm films that leave you in a better mood.',
  },
  'mind-bending': {
    label: 'mind-bending',
    genres: [878, 9648],
    keywords: ['twist ending', 'time travel', 'alternate reality', 'psychological thriller'],
    blurb: 'Puzzles, twists and ideas that stay with you.',
  },
  emotional: {
    label: 'emotional',
    genres: [18],
    withoutGenres: [27],
    keywords: ['tearjerker', 'grief', 'family relationships'],
    blurb: 'Stories that hit hard. Keep tissues close.',
  },
  dark: {
    label: 'dark',
    genres: [80, 53, 27],
    keywords: ['dark comedy', 'neo-noir', 'revenge'],
    blurb: 'Bleak, morally grey, unsettling in the best way.',
  },
  suspenseful: {
    label: 'suspenseful',
    genres: [53, 9648],
    keywords: ['suspense', 'whodunit', 'cat and mouse'],
    blurb: 'Edge-of-the-seat tension from start to finish.',
  },
  romantic: {
    label: 'romantic',
    genres: [10749],
    keywords: ['romantic comedy', 'love'],
    blurb: 'Love stories, big and small.',
  },
  inspiring: {
    label: 'inspiring',
    genres: [18, 36],
    withoutGenres: [27],
    keywords: ['inspirational', 'sports', 'biography'],
    blurb: 'Underdogs, true stories and people who refuse to quit.',
  },
};

const MOOD_ALIASES: Record<string, string> = {
  'feel good': 'feel-good',
  feelgood: 'feel-good',
  happy: 'feel-good',
  uplifting: 'feel-good',
  wholesome: 'feel-good',
  'mind bending': 'mind-bending',
  mindbending: 'mind-bending',
  'mind blowing': 'mind-bending',
  trippy: 'mind-bending',
  emotional: 'emotional',
  sad: 'emotional',
  'tear jerker': 'emotional',
  tearjerker: 'emotional',
  dark: 'dark',
  gritty: 'dark',
  suspenseful: 'suspenseful',
  suspense: 'suspenseful',
  tense: 'suspenseful',
  gripping: 'suspenseful',
  romantic: 'romantic',
  inspiring: 'inspiring',
  inspirational: 'inspiring',
  motivational: 'inspiring',
};

const GENRE_ALIASES: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  animated: 16,
  anime: 16,
  comedy: 35,
  comedies: 35,
  funny: 35,
  crime: 80,
  documentary: 99,
  documentaries: 99,
  drama: 18,
  dramas: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  historical: 36,
  horror: 27,
  scary: 27,
  music: 10402,
  musical: 10402,
  mystery: 9648,
  romance: 10749,
  'rom com': 10749,
  romcom: 10749,
  'science fiction': 878,
  'sci fi': 878,
  scifi: 878,
  thriller: 53,
  thrillers: 53,
  war: 10752,
  western: 37,
};

const LANGUAGE_ALIASES: Record<string, { code: string; label: string }> = {
  hindi: { code: 'hi', label: 'Hindi' },
  bollywood: { code: 'hi', label: 'Hindi' },
  tamil: { code: 'ta', label: 'Tamil' },
  telugu: { code: 'te', label: 'Telugu' },
  tollywood: { code: 'te', label: 'Telugu' },
  malayalam: { code: 'ml', label: 'Malayalam' },
  kannada: { code: 'kn', label: 'Kannada' },
  bengali: { code: 'bn', label: 'Bengali' },
  marathi: { code: 'mr', label: 'Marathi' },
  punjabi: { code: 'pa', label: 'Punjabi' },
  english: { code: 'en', label: 'English' },
  hollywood: { code: 'en', label: 'English' },
  korean: { code: 'ko', label: 'Korean' },
  japanese: { code: 'ja', label: 'Japanese' },
  spanish: { code: 'es', label: 'Spanish' },
  french: { code: 'fr', label: 'French' },
};

const FILLER = new Set([
  'movie', 'movies', 'film', 'films', 'a', 'an', 'the', 'some', 'something', 'good', 'best',
  'show', 'me', 'i', 'want', 'to', 'watch', 'with', 'and', 'of', 'for', 'tonight', 'like', 'vibe', 'vibes', 'mood',
]);

interface ParsedFacets {
  genres: number[];
  mood?: string;
  language?: { code: string; label: string };
}

/** Returns facets if the whole query reads as genre/mood/language words, otherwise null. */
export function parseFacets(query: string): ParsedFacets | null {
  let rest = ` ${normalize(query)} `;
  const facets: ParsedFacets = { genres: [] };
  const take = (alias: string) => {
    const needle = ` ${alias} `;
    if (!rest.includes(needle)) return false;
    rest = rest.replace(needle, ' ');
    return true;
  };
  const byLength = (o: object) => Object.keys(o).sort((a, b) => b.length - a.length);

  for (const alias of byLength(MOOD_ALIASES)) if (!facets.mood && take(alias)) facets.mood = MOOD_ALIASES[alias];
  for (const alias of byLength(GENRE_ALIASES)) {
    if (take(alias) && !facets.genres.includes(GENRE_ALIASES[alias])) facets.genres.push(GENRE_ALIASES[alias]);
  }
  for (const alias of byLength(LANGUAGE_ALIASES)) if (!facets.language && take(alias)) facets.language = LANGUAGE_ALIASES[alias];

  const leftover = rest.split(' ').filter((w) => w && !FILLER.has(w));
  const matched = facets.mood || facets.genres.length || facets.language;
  return matched && leftover.length === 0 ? facets : null;
}

/* ------------------------------------------------------------------------ */
/* Results                                                                   */
/* ------------------------------------------------------------------------ */

export type DiscoveryResult =
  | { kind: 'seed'; seed: SeedInfo; alternatives: Alternative[]; movies: Recommendation[] }
  | { kind: 'browse'; title: string; blurb: string; movies: RankedMovie[] }
  | { kind: 'none' };

type Bucket = { movie: MovieSummary; score: number; tags: Set<string> };

function collect(buckets: Map<number, Bucket>, list: MovieSummary[] | undefined, tag: string, weight: number, ranked = true) {
  list?.forEach((movie, i) => {
    const b = buckets.get(movie.id) ?? { movie, score: 0, tags: new Set<string>() };
    b.score += ranked ? weight * (1 - i / 25) : weight;
    b.tags.add(tag);
    buckets.set(movie.id, b);
  });
}

function settled<T>(r: PromiseSettledResult<T>): T | undefined {
  return r.status === 'fulfilled' ? r.value : undefined;
}

function qualityAdjustment(m: MovieSummary) {
  const v = m.vote_average;
  let s = Math.max(-1.5, Math.min(1.2, v >= 6.5 ? (v - 6.5) * 0.4 : (v - 6.5) * 0.9));
  if (m.vote_count < 30) s -= 1.5;
  else if (m.vote_count < 100) s -= 0.4;
  if (!m.poster_path) s -= 1;
  return s;
}

async function resolveKeywords(names: string[]) {
  const results = await Promise.allSettled(names.map((n) => searchKeyword(n)));
  return results
    .map((r, i) => {
      const list = settled(r)?.results ?? [];
      return (list.find((k) => normalize(k.name) === normalize(names[i])) ?? list[0])?.id;
    })
    .filter((id): id is number => typeof id === 'number');
}

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

/** Browse by genre, mood and/or language. */
export async function discoverByFacets(facets: ParsedFacets): Promise<DiscoveryResult> {
  const genres = await getGenres().catch(() => [] as Genre[]);
  const genreName = new Map(genres.map((g) => [g.id, g.name]));
  const mood = facets.mood ? MOODS[facets.mood] : undefined;

  const genreLabel = facets.genres.map((g) => genreName.get(g) ?? '').filter(Boolean).join(' ');
  const title = [mood?.label, facets.language?.label, genreLabel].filter(Boolean).join(' ') || 'Movies';
  const label = title.toLowerCase().replace(/\b(hindi|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|english|korean|japanese|spanish|french)\b/g, (w) => w[0].toUpperCase() + w.slice(1));

  const base = {
    with_genres: facets.genres.length ? facets.genres.join(',') : mood?.genres.join('|'),
    without_genres: mood?.withoutGenres?.join(','),
    with_original_language: facets.language?.code,
  };
  const minVotes = facets.language && facets.language.code !== 'en' ? 40 : 250;
  const keywordIds = mood ? await resolveKeywords(mood.keywords) : [];

  const [popular1, popular2, acclaimed, moodMatch] = await Promise.allSettled([
    discoverMovies({ ...base, sort_by: 'popularity.desc', 'vote_count.gte': minVotes, 'vote_average.gte': 6.3 }),
    discoverMovies({ ...base, sort_by: 'popularity.desc', 'vote_count.gte': minVotes, 'vote_average.gte': 6.3, page: 2 }),
    // Skip very recent releases here; their early ratings run high.
    discoverMovies({ ...base, sort_by: 'vote_average.desc', 'vote_count.gte': minVotes * 4, 'primary_release_date.lte': monthsAgo(6) }),
    keywordIds.length
      ? discoverMovies({
          with_keywords: keywordIds.join('|'),
          with_genres: facets.genres.length ? facets.genres.join(',') : undefined,
          without_genres: base.without_genres,
          with_original_language: base.with_original_language,
          sort_by: 'vote_count.desc',
          'vote_count.gte': Math.round(minVotes / 2),
        })
      : Promise.resolve(undefined),
  ]);

  if ([popular1, acclaimed].every((r) => r.status === 'rejected')) throw (popular1 as PromiseRejectedResult).reason;

  const buckets = new Map<number, Bucket>();
  collect(buckets, settled(popular1)?.results, 'popular', 2.2);
  collect(buckets, settled(popular2)?.results, 'popular', 1.2);
  collect(buckets, settled(acclaimed)?.results, 'acclaimed', 2.4);
  collect(buckets, settled(moodMatch)?.results, 'mood', 2.6);

  const movies: RankedMovie[] = [...buckets.values()].map(({ movie, score, tags }) => {
    let reason: string;
    if (tags.has('mood') && mood) reason = `Fits the ${mood.label} mood.`;
    else if (tags.has('acclaimed')) reason = `Among the highest-rated ${label} films.`;
    else reason = `Popular ${label} pick right now.`;
    return { ...movie, score: score + qualityAdjustment(movie), reason };
  });
  movies.sort((a, b) => b.score - a.score);

  const blurb =
    mood?.blurb ??
    (facets.genres.length
      ? `Popular and acclaimed ${label} films, mixed together.`
      : `Popular and acclaimed films in ${facets.language?.label}.`);
  return { kind: 'browse', title: title[0].toUpperCase() + title.slice(1), blurb, movies: movies.slice(0, 48) };
}

/** Turn a free-text query into results: genre/mood browse, or titles like the one named. */
export async function discover(query: string): Promise<DiscoveryResult> {
  const facets = parseFacets(query);
  if (facets) return discoverByFacets(facets);
  return fetchRecommendations({ q: query });
}

export const discoverTitle = (type: MediaType, id: number) => fetchRecommendations({ type, id: String(id) });

async function fetchRecommendations(params: Record<string, string>): Promise<DiscoveryResult> {
  let res: Response;
  try {
    res = await fetch(`/api/discover?${new URLSearchParams(params)}`);
  } catch {
    throw new ApiError('Could not connect. Check your internet connection and try again.', 0, 'network');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.message ?? 'Couldn’t load recommendations. Please try again.', res.status, body.error);
  if (body.kind === 'none') return { kind: 'none' };
  return { kind: 'seed', seed: body.seed, alternatives: body.alternatives ?? [], movies: body.results ?? [] };
}

/** A random, well-liked movie. Leans towards Indian cinema a third of the time. */
export async function randomMovie(excludeId?: number, forcePage?: number): Promise<MovieSummary> {
  const indian = Math.random() < 0.35;
  const page = forcePage ?? 1 + Math.floor(Math.random() * (indian ? 8 : 25));
  const res = await discoverMovies({
    sort_by: 'popularity.desc',
    'vote_count.gte': indian ? 80 : 400,
    'vote_average.gte': 7,
    with_origin_country: indian ? 'IN' : undefined,
    page,
  });
  const pool = res.results.filter((m) => m.poster_path && m.overview && m.id !== excludeId);
  if (!pool.length) {
    if (page !== 1) return randomMovie(excludeId, 1);
    throw new Error('No movies found.');
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
