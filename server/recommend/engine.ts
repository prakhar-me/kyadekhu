/**
 * Recommendations for a seed movie or series, in two steps:
 *
 *   A. Candidate pool: TMDB recommendations (pages 1-2), /similar, other work
 *      by the same director/writer/creator, /discover on the seed's most
 *      specific keywords, the seed's collection (max 2), same-language titles
 *      for non-English seeds, and a smaller pool of the other media type.
 *   B. Scoring: every candidate's details, keywords and credits are fetched
 *      (one call each via append_to_response) and scored on the signals in W.
 *      A diversity pass then stops one director or franchise filling the top.
 *
 * All TMDB calls go through the caching proxy, so repeat searches are cheap.
 */
import { handleTmdbRequest, type TmdbEnv } from '../tmdbProxy.js';
import { DOCUMENTARY, NON_STORY_TV_GENRES, nativeGenres, toMovieGenres } from './genres.js';

export type MediaType = 'movie' | 'tv';

/** Scoring weights. See README for what each one does. */
export const W = {
  recBase: 0.7, // appears in TMDB recommendations…
  recRank: 1.5, // …plus up to this much more in its top 20 (linear decay)
  similar: 0.5, // appears in TMDB /similar (weak signal)
  keywords: 12, // × IDF-weighted keyword similarity (0–1): half cosine, half coverage of the seed's themes
  genre: 0.8, // × Jaccard overlap of genres
  genreNone: -1.0, // no genre in common at all
  director: 1.6,
  writer: 1.0,
  creator: 1.6,
  castEach: 0.35, // per shared top-5 cast member, max 3
  language: 0.5, // same original language (English seeds)
  languageRegional: 0.7, // same language, other non-English seed
  languageIndian: 2.4, // same language, Indian seed
  languageMismatch: -0.3, // different language, other non-English seed
  languageMismatchIndian: -2.4, // different language, Indian seed
  country: 0.4, // shares a production / origin country
  quality: 1.2, // × (weighted rating − prior mean)
  recContentFloor: 0.5, // a recommendation with no keyword overlap keeps this share of its boost
  popularity: 0.8, // × log10(votes / reference), clamped to [-1, 1.5]
  era: 0.5, // × closeness of release year (within 15 years)
  animationMismatch: -2.5, // animated title for a live-action seed
  liveActionMismatch: -1.0, // live-action title for an animated seed
  crossType: -0.6, // series for a movie seed, or vice versa
  toneKeyword: 0.35, // tone tags ("suspenseful", "excited") count this much of a theme keyword
  // diversity pass
  similarityPenalty: 4, // × keyword Jaccard with the closest already-picked title
  sameDirectorPenalty: 1.0,
  sameCollectionPenalty: 2.5,
};

const INDIAN_LANGUAGES = new Set(['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu', 'or', 'as', 'ur']);
const GENERIC_KEYWORDS = new Set([
  'based on novel or book', 'based on novel', 'sequel', 'prequel', 'duringcreditsstinger', 'aftercreditsstinger',
  'woman director', 'remake', 'based on true story', 'based on a true story', 'biography', 'based on comic',
  'based on manga', 'based on young adult novel', 'based on play or musical', 'based on video game',
  'based on tv series', 'live action remake', 'miniseries', 'anime', 'sitcom', 'hindi', 'bollywood', 'tamil',
  'telugu', 'malayalam', 'kannada', 'web series', 'tvf', 'ott', 'netflix', 'amazon prime video', 'british',
  'american', 'germany', 'india', 'usa', 'new york city', 'los angeles, california', 'mumbai (bombay), india',
  'parent child relationship', 'father son relationship', 'mother son relationship', 'husband wife relationship',
  'friendship', 'love', 'murder', 'death', 'violence', 'family', 'drama', 'comedy', 'thriller', 'hero',
]);
/** TMDB's mood/tone tags: weak evidence of similarity, never shown as a theme. */
const TONE_KEYWORDS = new Set([
  'amused', 'excited', 'suspenseful', 'intense', 'dramatic', 'playful', 'hopeful', 'inspirational', 'admiring', 'bold',
  'cheerful', 'cautionary', 'comforting', 'compassionate', 'complex', 'defiant', 'desperate', 'dignified', 'earnest',
  'empathetic', 'enchant', 'exhilarated', 'foreboding', 'frightened', 'gloomy', 'grim', 'hilarious', 'horrified', 'ironic',
  'joyful', 'joyous', 'melancholy', 'mean spirited', 'mischievous', 'nostalgic', 'ominous', 'optimistic', 'powerful',
  'provocative', 'reflective', 'romantic', 'sad', 'sarcastic', 'sentimental', 'serious', 'sincere', 'somber', 'sympathetic',
  'tense', 'thoughtful', 'tragic', 'vibrant', 'witty', 'whimsical', 'wry', 'angry', 'anxious', 'appreciative', 'audacious',
  'awestruck', 'baffled', 'bewildered', 'callous', 'celebratory', 'chilling', 'critical', 'curious', 'depressing',
  'disgusted', 'distressing', 'dreary', 'embarrassed', 'enthusiastic', 'familiar', 'frustrated', 'harsh', 'inquisitive',
  'introspective', 'lighthearted', 'loving', 'malicious', 'mocking', 'outrageous', 'pessimistic', 'philosophical',
  'pretentious', 'proud', 'questioning', 'regretful', 'relaxed', 'respectful', 'sardonic', 'scared', 'shocking', 'sinister',
  'skeptical', 'spirited', 'straightforward', 'sweet', 'gritty', 'dark', 'absurd', 'aggressive', 'antagonistic', 'arrogant',
  'assertive', 'authoritarian', 'cliché', 'cynical', 'demeaning', 'disrespectful', 'enraged', 'factual', 'farcical',
  'informative', 'kind', 'righteous', 'sensational', 'shocked', 'urgent', 'vindictive', 'zealous', 'meditative', 'adoring',
  'tender', 'touching', 'heartfelt', 'uplifting', 'feel-good', 'quirky', 'eerie', 'atmospheric', 'haunting', 'unsettling',
]);
const isTone = (name: string) => TONE_KEYWORDS.has(name.toLowerCase());
const isTheme = (name: string) => !isTone(name) && !GENERIC_KEYWORDS.has(name.toLowerCase());

const GENRE_NAMES: Record<number, string> = {
  28: 'action', 12: 'adventure', 16: 'animated', 35: 'comedy', 80: 'crime', 99: 'documentary', 18: 'drama',
  10751: 'family', 14: 'fantasy', 36: 'historical', 27: 'horror', 10402: 'music', 9648: 'mystery', 10749: 'romance',
  878: 'sci-fi', 53: 'thriller', 10752: 'war', 37: 'western', 10766: 'soap', 10767: 'talk', 10764: 'reality',
};
const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const CREW_JOBS = new Set(['Director', 'Screenplay', 'Writer', 'Story', 'Creator', 'Teleplay', 'Novel']);
const NON_STORY = /\b(making of|behind the scenes|in concert|concert film|the concert|live at|live in)\b/i;

const minVotes = (type: MediaType, lang: string) =>
  type === 'movie' ? (lang === 'en' ? 150 : INDIAN_LANGUAGES.has(lang) ? 25 : 60) : lang === 'en' ? 60 : INDIAN_LANGUAGES.has(lang) ? 4 : 20;

/* ------------------------------------------------------------------------ */
/* TMDB access                                                               */
/* ------------------------------------------------------------------------ */

type Params = Record<string, string | number | undefined>;

function makeClient(env: TmdbEnv, concurrency = 12) {
  let active = 0;
  const queue: (() => void)[] = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < concurrency) {
        active++;
        resolve();
      } else queue.push(() => (active++, resolve()));
    });
  const release = () => {
    active--;
    queue.shift()?.();
  };

  return async function get<T = any>(path: string, params: Params = {}): Promise<T> {
    const search = new URLSearchParams({ language: 'en-US' });
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') search.set(k, String(v));
    await acquire();
    try {
      const r = await handleTmdbRequest(path, search, env);
      if (r.status !== 200) {
        const err = new Error(JSON.parse(r.body)?.message ?? `TMDB ${r.status}`) as Error & { status: number; code?: string };
        err.status = r.status;
        err.code = JSON.parse(r.body)?.error;
        throw err;
      }
      return JSON.parse(r.body) as T;
    } finally {
      release();
    }
  };
}
const safe = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

/* ------------------------------------------------------------------------ */
/* Normalised titles                                                         */
/* ------------------------------------------------------------------------ */

interface Person {
  id: number;
  name: string;
}

export interface Title {
  type: MediaType;
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  date: string;
  year: number | null;
  voteAverage: number;
  voteCount: number;
  popularity: number;
  language: string;
  countries: string[];
  genres: number[]; // movie genre space
  nativeGenreNames: string[];
  keywords: { id: number; name: string }[];
  directors: Person[];
  writers: Person[];
  creators: Person[];
  cast: Person[];
  runtime: number | null;
  collectionId: number | null;
  networks: string[];
}

function fromList(raw: any, type: MediaType): Title {
  const date = (type === 'movie' ? raw.release_date : raw.first_air_date) || '';
  return {
    type,
    id: raw.id,
    title: (type === 'movie' ? raw.title : raw.name) ?? '',
    originalTitle: (type === 'movie' ? raw.original_title : raw.original_name) ?? '',
    overview: raw.overview ?? '',
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    date,
    year: date ? Number(date.slice(0, 4)) : null,
    voteAverage: raw.vote_average ?? 0,
    voteCount: raw.vote_count ?? 0,
    popularity: raw.popularity ?? 0,
    language: raw.original_language ?? '',
    countries: raw.origin_country ?? [],
    genres: toMovieGenres(type, raw.genre_ids ?? []),
    nativeGenreNames: [],
    keywords: [],
    directors: [],
    writers: [],
    creators: [],
    cast: [],
    runtime: null,
    collectionId: null,
    networks: [],
  };
}

function fromDetails(raw: any, type: MediaType): Title {
  const t = fromList({ ...raw, genre_ids: (raw.genres ?? []).map((g: any) => g.id) }, type);
  t.nativeGenreNames = (raw.genres ?? []).map((g: any) => g.name);
  t.keywords = (raw.keywords?.keywords ?? raw.keywords?.results ?? []).map((k: any) => ({ id: k.id, name: k.name }));
  if (type === 'movie') {
    const crew: any[] = raw.credits?.crew ?? [];
    t.directors = uniq(crew.filter((c) => c.job === 'Director'));
    t.writers = uniq(crew.filter((c) => ['Screenplay', 'Writer', 'Story', 'Novel'].includes(c.job)));
    t.cast = (raw.credits?.cast ?? []).slice(0, 5).map((c: any) => ({ id: c.id, name: c.name }));
    t.runtime = raw.runtime || null;
    t.collectionId = raw.belongs_to_collection?.id ?? null;
    t.countries = (raw.production_countries ?? []).map((c: any) => c.iso_3166_1);
    if (raw.origin_country?.length) t.countries = [...new Set([...raw.origin_country, ...t.countries])];
  } else {
    t.creators = (raw.created_by ?? []).map((c: any) => ({ id: c.id, name: c.name }));
    t.cast = (raw.aggregate_credits?.cast ?? []).slice(0, 5).map((c: any) => ({ id: c.id, name: c.name }));
    t.runtime = raw.episode_run_time?.[0] ?? raw.last_episode_to_air?.runtime ?? null;
    t.countries = raw.origin_country ?? [];
    t.networks = (raw.networks ?? []).map((n: any) => n.name);
  }
  return t;
}

const uniq = (people: any[]): Person[] => {
  const seen = new Map<number, Person>();
  for (const p of people) if (!seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name });
  return [...seen.values()];
};

const detailsAppend = (type: MediaType, extra = '') =>
  (type === 'movie' ? 'keywords,credits' : 'keywords,aggregate_credits') + (extra ? `,${extra}` : '');

/* ------------------------------------------------------------------------ */
/* Recommend                                                                 */
/* ------------------------------------------------------------------------ */

interface Sources {
  rec?: number; // best rank in recommendations (0-based)
  similar?: number;
  crew: { person: Person; role: 'director' | 'writer' | 'creator' }[];
  keyword?: boolean;
  collection?: boolean;
  regional?: boolean;
}

interface Candidate {
  item: Title;
  sources: Sources;
}

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
  genre_ids: number[];
  reason: string;
  score: number;
  why?: Record<string, number>;
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

export async function recommend(env: TmdbEnv, type: MediaType, id: number, opts: { debug?: boolean } = {}) {
  const get = makeClient(env);
  const other: MediaType = type === 'movie' ? 'tv' : 'movie';
  const today = new Date().toISOString().slice(0, 10);

  const seedRaw = await get(`${type}/${id}`, { append_to_response: detailsAppend(type, 'recommendations,similar') });
  const seed = fromDetails(seedRaw, type);
  const lang = seed.language;
  const nonEnglish = lang !== 'en';
  const isIndian = seed.countries.includes('IN') || INDIAN_LANGUAGES.has(lang);
  const seedNative = nativeGenres(type, seed.genres);
  const seedIsNonStory =
    seed.genres.includes(DOCUMENTARY) || (type === 'tv' && (seedRaw.genres ?? []).some((g: any) => NON_STORY_TV_GENRES.has(g.id)));

  // Keyword specificity: how many titles of this type carry each keyword.
  const seedKeywords = seed.keywords.slice(0, 40);
  // TMDB caps total_results for unfiltered discover, so use catalogue sizes.
  const N = type === 'movie' ? 900_000 : 180_000;
  const dfs = await Promise.all(
    seedKeywords.map((k) => safe(get(`discover/${type}`, { with_keywords: k.id }), { total_results: -1 })),
  );
  const idf = new Map<number, number>();
  // Keywords whose frequency lookup failed get the average weight below.
  seedKeywords.forEach((k, i) =>
    dfs[i].total_results >= 0 &&
    idf.set(k.id, Math.log(1 + N / (dfs[i].total_results + 1)) * (isTone(k.name) ? W.toneKeyword : GENERIC_KEYWORDS.has(k.name.toLowerCase()) ? 0.5 : 1)),
  );
  const df = new Map(seedKeywords.map((k, i) => [k.id, dfs[i].total_results]));
  const band = type === 'movie' ? { min: 20, core: 150, max: 3000 } : { min: 8, core: 40, max: 800 };
  const avgIdf = idf.size ? [...idf.values()].reduce((a, b) => a + b, 0) / idf.size : Math.log(1 + N / 1000);
  // Theme keywords that are specific but not unique (keywords only the seed
  // has find nothing), rarest first, in up to three discover queries of five.
  const themed = seedKeywords
    .filter((k) => isTheme(k.name) && (df.get(k.id) ?? 0) >= band.min && (df.get(k.id) ?? 0) <= band.max)
    .sort((a, b) => (idf.get(b.id) ?? 0) - (idf.get(a.id) ?? 0));
  const keywordGroups = [themed.slice(0, 5), themed.slice(5, 10), themed.slice(10, 15)].filter((g) => g.length);

  // Step A: candidate pool.
  const pool = new Map<string, Candidate>();
  const add = (raw: any, t: MediaType, mark: (s: Sources) => void) => {
    if (!raw?.id || (t === type && raw.id === id)) return;
    const key = `${t}:${raw.id}`;
    let c = pool.get(key);
    if (!c) pool.set(key, (c = { item: fromList(raw, t), sources: { crew: [] } }));
    mark(c.sources);
  };

  const recs1: any[] = seedRaw.recommendations?.results ?? [];
  const similar: any[] = seedRaw.similar?.results ?? [];
  const people: { person: Person; role: 'director' | 'writer' | 'creator' }[] =
    type === 'movie'
      ? [
          ...seed.directors.slice(0, 2).map((p) => ({ person: p, role: 'director' as const })),
          ...seed.writers.filter((w) => !seed.directors.some((d) => d.id === w.id)).slice(0, 2).map((p) => ({ person: p, role: 'writer' as const })),
        ]
      : seed.creators.slice(0, 3).map((p) => ({ person: p, role: 'creator' as const }));

  const kwIds = themed.slice(0, 8).map((k) => k.id).join('|');
  const minSame = minVotes(type, lang);
  const minOther = minVotes(other, lang);
  const sameOriginIN = isIndian ? 'IN' : undefined;

  const regionalBase = { with_original_language: lang, with_origin_country: sameOriginIN, sort_by: 'vote_count.desc', 'vote_count.gte': minSame };
  const [g0, g1] = seedNative;
  const [recs2, crewCredits, keywordHits, collection, reg1, reg2, crossKw, crossReg, regKw] = await Promise.all([
    safe(get(`${type}/${id}/recommendations`, { page: 2 }), { results: [] }),
    Promise.all(people.map((p) => safe(get(`person/${p.person.id}/combined_credits`), { crew: [] }))),
    Promise.all(
      keywordGroups.map((g) =>
        safe(get(`discover/${type}`, { with_keywords: g.map((k) => k.id).join('|'), with_genres: seedNative.join('|'), sort_by: 'vote_count.desc', 'vote_count.gte': Math.round(minSame / 2) }), { results: [] }),
      ),
    ),
    type === 'movie' && seed.collectionId ? safe(get(`collection/${seed.collectionId}`), { parts: [] }) : { parts: [] },
    nonEnglish && g0 ? safe(get(`discover/${type}`, { ...regionalBase, with_genres: g1 ? `${g0},${g1}` : `${g0}` }), { results: [] }) : { results: [] },
    nonEnglish && g0 ? safe(get(`discover/${type}`, { ...regionalBase, with_genres: `${g0}` }), { results: [] }) : { results: [] },
    kwIds ? safe(get(`discover/${other}`, { with_keywords: kwIds, with_genres: nativeGenres(other, seed.genres).join('|'), sort_by: 'vote_count.desc', 'vote_count.gte': minOther }), { results: [] }) : { results: [] },
    nonEnglish ? safe(get(`discover/${other}`, { with_original_language: lang, with_origin_country: sameOriginIN, with_genres: nativeGenres(other, seed.genres).join('|'), sort_by: 'vote_count.desc', 'vote_count.gte': minOther }), { results: [] }) : { results: [] },
    nonEnglish && kwIds ? safe(get(`discover/${type}`, { with_original_language: lang, with_keywords: kwIds, sort_by: 'vote_count.desc', 'vote_count.gte': Math.round(minSame / 2) }), { results: [] }) : { results: [] },
  ]);

  [...recs1, ...(recs2.results ?? [])].forEach((r, i) => add(r, type, (s) => (s.rec = Math.min(s.rec ?? i, i))));
  similar.forEach((r, i) => add(r, type, (s) => (s.similar = Math.min(s.similar ?? i, i))));
  crewCredits.forEach((credits: any, i) => {
    const seen = new Set<string>();
    for (const c of credits.crew ?? []) {
      if (!CREW_JOBS.has(c.job) || (c.media_type !== 'movie' && c.media_type !== 'tv')) continue;
      const key = `${c.media_type}:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      add(c, c.media_type, (s) => s.crew.push(people[i]));
    }
  });
  keywordHits.flatMap((h: any) => h.results ?? []).forEach((r: any) => add(r, type, (s) => (s.keyword = true)));
  [...(reg1.results ?? []), ...(reg2.results ?? [])].forEach((r) => add(r, type, (s) => (s.regional = true)));
  (regKw.results ?? []).forEach((r: any) => add(r, type, (s) => ((s.regional = true), (s.keyword = true))));
  (crossKw.results ?? []).forEach((r: any) => add(r, other, (s) => (s.keyword = true)));
  (crossReg.results ?? []).forEach((r: any) => add(r, other, (s) => (s.regional = true)));
  const parts = ((collection as any).parts ?? []).filter((p: any) => p.id !== id && p.release_date && p.release_date <= today);
  parts
    .sort((a: any, b: any) => Math.abs(Number(a.release_date.slice(0, 4)) - (seed.year ?? 0)) - Math.abs(Number(b.release_date.slice(0, 4)) - (seed.year ?? 0)))
    .slice(0, 2)
    .forEach((p: any) => add(p, 'movie', (s) => (s.collection = true)));

  // Cheap filters on list data, then keep the most promising for detail fetches.
  const passesBasic = (c: Candidate) => {
    const t = c.item;
    if (!t.date || t.date > today) return false;
    if (t.voteCount < minVotes(t.type, t.language)) return false;
    if (!seedIsNonStory && t.genres.includes(DOCUMENTARY)) return false;
    return true;
  };
  const prescore = (c: Candidate) =>
    (c.sources.rec !== undefined ? 10 - c.sources.rec * 0.15 : 0) +
    (c.sources.similar !== undefined ? 2 : 0) +
    (c.sources.crew.length ? 3 : 0) +
    (c.sources.keyword ? 2.5 : 0) +
    (c.sources.collection ? 4 : 0) +
    (c.sources.regional ? 2 : 0) +
    (c.item.language === lang ? (nonEnglish ? 3 : 0.5) : 0) +
    Math.log10(c.item.voteCount + 1) * 0.6;

  const eligible = [...pool.values()].filter(passesBasic);
  const top = (t: MediaType, n: number) =>
    eligible.filter((c) => c.item.type === t).sort((a, b) => prescore(b) - prescore(a)).slice(0, n);
  const shortlist = [...top(type, 90), ...top(other, 25)];

  // Step B: details for each candidate (one call each), then filter and score.
  const detailed = await Promise.all(
    shortlist.map(async (c) => {
      const raw = await safe(get(`${c.item.type}/${c.item.id}`, { append_to_response: detailsAppend(c.item.type) }), null);
      if (!raw) return null;
      const item = fromDetails(raw, c.item.type);
      const nonStoryTv = c.item.type === 'tv' && (raw.genres ?? []).some((g: any) => NON_STORY_TV_GENRES.has(g.id));
      if (!seedIsNonStory) {
        if (item.genres.includes(DOCUMENTARY) || nonStoryTv) return null;
        if (item.type === 'movie' && item.runtime !== null && item.runtime < 60) return null;
        if (NON_STORY.test(item.title) || item.keywords.some((k) => /concert|making of/i.test(k.name))) return null;
      }
      if (item.type === 'movie' && raw.status && raw.status !== 'Released') return null;
      return { ...c, item };
    }),
  );

  const seedKw = new Set(seedKeywords.map((k) => k.id));
  const seedNorm = Math.sqrt(seedKeywords.reduce((s, k) => s + (idf.get(k.id) ?? avgIdf) ** 2, 0)) || 1;
  const seedCast = new Set(seed.cast.map((p) => p.id));
  const seedPeople = new Map<number, 'director' | 'writer' | 'creator'>();
  seed.directors.forEach((p) => seedPeople.set(p.id, 'director'));
  seed.writers.forEach((p) => seedPeople.has(p.id) || seedPeople.set(p.id, 'writer'));
  seed.creators.forEach((p) => seedPeople.set(p.id, 'creator'));

  const scored = detailed
    .filter((c): c is Candidate => c !== null)
    .map((c) => {
      const t = c.item;
      const why: Record<string, number> = {};
      if (c.sources.rec !== undefined) why.rec = W.recBase + W.recRank * Math.max(0, 1 - c.sources.rec / 20);
      if (c.sources.similar !== undefined) why.similar = W.similar * Math.max(0.3, 1 - c.sources.similar / 20);

      const shared = t.keywords.filter((k) => seedKw.has(k.id));
      const candNorm = Math.sqrt(t.keywords.reduce((s, k) => s + (idf.get(k.id) ?? avgIdf) ** 2, 0)) || 1;
      const sharedMass = shared.reduce((s, k) => s + (idf.get(k.id) ?? avgIdf) ** 2, 0);
      // Cosine alone penalises well-tagged titles; coverage alone favours tag-heavy ones.
      const kwSim = 0.5 * (sharedMass / (seedNorm * candNorm)) + 0.5 * (sharedMass / seedNorm ** 2);
      if (kwSim > 0) why.keywords = W.keywords * kwSim;
      // Co-watched but thematically unrelated titles keep only part of the boost.
      if (why.rec) why.rec *= W.recContentFloor + (1 - W.recContentFloor) * Math.min(1, kwSim / 0.15);

      const gUnion = new Set([...seed.genres, ...t.genres]);
      const gShared = t.genres.filter((g) => seed.genres.includes(g)).length;
      if (gUnion.size) why.genre = gShared ? W.genre * (gShared / gUnion.size) : W.genreNone;

      // Same director in an unrelated genre (Nolan: Interstellar vs The Dark Knight) counts half.
      const genreFit = gUnion.size ? 0.5 + 0.5 * Math.min(1, (2 * gShared) / gUnion.size) : 1;
      let crewName: { role: string; name: string } | null = null;
      for (const p of [...t.directors, ...t.writers, ...t.creators]) {
        const role = seedPeople.get(p.id);
        if (!role) continue;
        const v = (role === 'director' ? W.director : role === 'creator' ? W.creator : W.writer) * genreFit;
        if (!crewName || v > (why.crew ?? 0)) {
          why.crew = v;
          crewName = { role, name: p.name };
        }
      }
      const sharedCast = t.cast.filter((p) => seedCast.has(p.id));
      if (sharedCast.length) why.cast = W.castEach * Math.min(3, sharedCast.length);

      if (t.language === lang) why.language = isIndian ? W.languageIndian : nonEnglish ? W.languageRegional : W.language;
      else if (nonEnglish) why.language = isIndian ? W.languageMismatchIndian : W.languageMismatch;
      if (t.countries.some((c) => seed.countries.includes(c))) why.country = W.country;

      const m = minVotes(t.type, t.language) * 4;
      const C = 6.5;
      const wr = (t.voteCount / (t.voteCount + m)) * t.voteAverage + (m / (t.voteCount + m)) * C;
      why.quality = W.quality * (wr - C);
      why.popularity = W.popularity * Math.max(-1, Math.min(1.5, Math.log10((t.voteCount + 1) / (minVotes(t.type, t.language) * 10))));
      const seedAnimated = seed.genres.includes(16);
      if (!seedAnimated && t.genres.includes(16)) why.format = W.animationMismatch;
      if (seedAnimated && !t.genres.includes(16)) why.format = W.liveActionMismatch;

      if (seed.year && t.year) {
        const gap = Math.abs(seed.year - t.year);
        if (gap <= 15) why.era = W.era * (1 - gap / 15);
      }
      if (t.type !== type) why.crossType = W.crossType;

      const score = Object.values(why).reduce((a, b) => a + b, 0);
      const themes = [
        ...new Set(
          shared
            .filter((k) => isTheme(k.name))
            .sort((a, b) => (idf.get(b.id) ?? 0) - (idf.get(a.id) ?? 0))
            .map((k) => k.name.toLowerCase()),
        ),
      ].slice(0, 3);
      return { c, t, why, score, crewName, castName: sharedCast[0]?.name ?? null, themes };
    });

  // Diversity: penalise repeats of the same director or collection.
  const diversify = (list: typeof scored) => {
    const remaining = [...list].sort((a, b) => b.score - a.score);
    const picked: typeof scored = [];
    const directorCount = new Map<number, number>();
    const collectionCount = new Map<number, number>();
    const keywordSets = new Map(list.map((r) => [r, new Set(r.t.keywords.filter((k) => isTheme(k.name)).map((k) => k.id))]));
    while (remaining.length && picked.length < 40) {
      let best = 0;
      let bestValue = -Infinity;
      remaining.forEach((r, i) => {
        if (i > 30) return;
        const dirPenalty = Math.max(0, ...r.t.directors.map((d) => directorCount.get(d.id) ?? 0), ...r.t.creators.map((d) => directorCount.get(d.id) ?? 0));
        const colPenalty = r.t.collectionId ? collectionCount.get(r.t.collectionId) ?? 0 : 0;
        const kw = keywordSets.get(r) ?? new Set<number>();
        let maxSim = 0;
        for (const p of picked) {
          const pk = keywordSets.get(p) ?? new Set<number>();
          if (!kw.size || !pk.size) continue;
          let inter = 0;
          kw.forEach((k) => pk.has(k) && inter++);
          maxSim = Math.max(maxSim, inter / (kw.size + pk.size - inter));
        }
        const v = r.score - W.sameDirectorPenalty * dirPenalty - W.sameCollectionPenalty * colPenalty - W.similarityPenalty * maxSim;
        if (v > bestValue) {
          bestValue = v;
          best = i;
        }
      });
      const [r] = remaining.splice(best, 1);
      picked.push(r);
      [...r.t.directors, ...r.t.creators].forEach((d) => directorCount.set(d.id, (directorCount.get(d.id) ?? 0) + 1));
      if (r.t.collectionId) collectionCount.set(r.t.collectionId, (collectionCount.get(r.t.collectionId) ?? 0) + 1);
    }
    return picked;
  };

  const seedLabel = seed.title;
  const reasonFor = (r: (typeof scored)[number]) => {
    const options: [number, string][] = [];
    if (r.why.rec) options.push([r.why.rec, `Popular with fans of ${seedLabel}`]);
    if (r.why.keywords && r.themes.length) options.push([r.why.keywords, `Same themes: ${r.themes.join(', ')}`]);
    if (r.why.crew && r.crewName) {
      const text =
        r.crewName.role === 'director'
          ? `Also directed by ${r.crewName.name}`
          : r.crewName.role === 'writer'
            ? `Also written by ${r.crewName.name}`
            : `From ${r.crewName.name}, creator of ${seedLabel}`;
      options.push([r.why.crew + 0.6, text]); // people are the most legible reason
    }
    if (r.why.cast && r.castName) options.push([r.why.cast + 0.3, `Also stars ${r.castName}`]);
    options.sort((a, b) => b[0] - a[0]);
    let reason = options[0]?.[1];
    if (!reason) {
      const g = r.t.genres.find((id) => seed.genres.includes(id) && GENRE_NAMES[id]);
      const kind = r.t.type === 'tv' ? 'series' : 'film';
      reason =
        r.t.language === lang && nonEnglish
          ? `Popular ${languageName(lang)} ${g ? `${GENRE_NAMES[g]} ` : ''}${kind}`
          : g
            ? `Another well-liked ${GENRE_NAMES[g]} ${kind}`
            : `Similar to ${seedLabel}`;
    }
    if (!reason.startsWith('Same themes') && r.themes.length >= 2 && (r.why.keywords ?? 0) > 1) {
      reason += `. Same themes: ${r.themes.slice(0, 2).join(', ')}`;
    }
    return reason;
  };

  const toResult = (r: (typeof scored)[number]): Recommendation => ({
    type: r.t.type,
    id: r.t.id,
    title: r.t.title,
    release_date: r.t.date,
    overview: r.t.overview,
    poster_path: r.t.poster_path,
    backdrop_path: r.t.backdrop_path,
    vote_average: r.t.voteAverage,
    vote_count: r.t.voteCount,
    original_language: r.t.language,
    genre_ids: r.t.genres,
    reason: reasonFor(r),
    score: Math.round(r.score * 100) / 100,
    ...(opts.debug ? { why: Object.fromEntries(Object.entries(r.why).map(([k, v]) => [k, Math.round(v * 100) / 100])) } : {}),
  });

  const results = [
    ...diversify(scored.filter((r) => r.t.type === type)).map(toResult),
    ...diversify(scored.filter((r) => r.t.type === other)).slice(0, 20).map(toResult),
  ];

  const people_ =
    type === 'movie'
      ? seed.directors.length
        ? `Directed by ${seed.directors.map((d) => d.name).slice(0, 2).join(' and ')}`
        : ''
      : seed.creators.length
        ? `Created by ${seed.creators.map((d) => d.name).slice(0, 2).join(' and ')}`
        : '';
  const seedInfo: SeedInfo = {
    type,
    id,
    title: seed.title,
    year: seed.year,
    poster_path: seed.poster_path,
    genres: seed.nativeGenreNames.slice(0, 3),
    people: people_,
  };
  return { seed: seedInfo, results, ...(opts.debug ? { debug: { keywords: keywordGroups.flat().map((k) => k.name), pool: pool.size, scored: scored.length } } : {}) };
}

/* ------------------------------------------------------------------------ */
/* Resolving a typed query to a seed                                          */
/* ------------------------------------------------------------------------ */

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function resolveQuery(env: TmdbEnv, query: string) {
  const get = makeClient(env);
  const year = query.match(/\b(19|20)\d{2}\b/)?.[0];
  const q = query.replace(/\b(19|20)\d{2}\b/, '').trim() || query;
  const res = await get<{ results: any[] }>('search/multi', { query: q, include_adult: 'false' });
  const items = (res.results ?? [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => fromList(r, r.media_type));
  if (!items.length) return null;

  const nq = normalize(q);
  const exact = items.filter((t) => normalize(t.title) === nq || normalize(t.originalTitle) === nq);
  const pool = exact.length ? exact : items.slice(0, 3);
  const match = (year && pool.find((t) => t.date.startsWith(year))) || [...pool].sort((a, b) => b.voteCount - a.voteCount)[0];

  const alternatives = items
    .filter((t) => !(t.type === match.type && t.id === match.id))
    .filter((t) => t.poster_path && !t.genres.includes(DOCUMENTARY) && t.voteCount >= (INDIAN_LANGUAGES.has(t.language) ? 10 : 50))
    .slice(0, 3)
    .map((t) => ({ type: t.type, id: t.id, title: t.title, year: t.year }));
  return { match: { type: match.type, id: match.id }, alternatives };
}
