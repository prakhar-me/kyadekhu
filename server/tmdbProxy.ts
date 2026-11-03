/**
 * Server-side TMDB proxy. The browser calls /api/tmdb/<path>?<query>; this
 * module attaches credentials, restricts which endpoints can be reached and
 * caches responses in memory. Used by the Vite dev/preview server and by the
 * Vercel function in /api.
 */

const TMDB_BASE = 'https://api.themoviedb.org/3';

const ALLOWED_PATHS = [
  /^search\/(movie|keyword)$/,
  /^movie\/\d+$/,
  /^movie\/\d+\/(similar|recommendations|videos|reviews|watch\/providers|keywords|credits)$/,
  /^genre\/movie\/list$/,
  /^discover\/movie$/,
  /^trending\/movie\/(day|week)$/,
];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<string, { expires: number; body: string }>();

export interface TmdbEnv {
  TMDB_READ_ACCESS_TOKEN?: string;
  TMDB_API_KEY?: string;
}

export interface ProxyResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

function json(status: number, data: unknown, extra: Record<string, string> = {}): ProxyResult {
  return {
    status,
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  };
}

export async function handleTmdbRequest(
  rawPath: string,
  incoming: URLSearchParams,
  env: TmdbEnv,
): Promise<ProxyResult> {
  const path = rawPath.replace(/^\/+|\/+$/g, '');
  if (!ALLOWED_PATHS.some((re) => re.test(path))) {
    return json(404, { error: 'not_found', message: `Endpoint not available: ${path}` });
  }

  const token = env.TMDB_READ_ACCESS_TOKEN?.trim();
  const apiKey = env.TMDB_API_KEY?.trim();
  if (!token && !apiKey) {
    return json(500, {
      error: 'missing_credentials',
      message: 'TMDB credentials are not configured. Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY on the server.',
    });
  }

  const params = new URLSearchParams();
  incoming.forEach((value, key) => {
    if (key !== 'api_key' && key !== '__path') params.append(key, value);
  });
  params.sort();
  const query = params.toString();
  if (query.length > 2000) return json(414, { error: 'query_too_long' });

  const cacheKey = `${path}?${query}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    return {
      status: 200,
      body: hit.body,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'HIT', ...cacheHeaders() },
    };
  }

  if (!token && apiKey) params.set('api_key', apiKey);
  const url = `${TMDB_BASE}/${path}?${params.toString()}`;

  const init = {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  let res: Response;
  try {
    res = await fetchWithRetry(url, init);
  } catch (err) {
    console.error('[tmdb-proxy] fetch failed:', path, (err as { cause?: unknown }).cause ?? err);
    return json(502, { error: 'upstream_unreachable', message: 'Could not reach TMDB.' });
  }

  const body = await res.text();
  if (!res.ok) {
    let message = `TMDB responded with ${res.status}.`;
    try {
      const parsed = JSON.parse(body) as { status_message?: string };
      if (parsed.status_message) message = parsed.status_message;
    } catch {
      /* non-JSON error body */
    }
    return json(res.status === 401 ? 500 : res.status, { error: 'upstream_error', message });
  }

  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, body });

  return {
    status: 200,
    body,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'MISS', ...cacheHeaders() },
  };
}

/**
 * Retries on network errors only (not HTTP errors). Some Indian ISPs reset a
 * large share of connections to api.themoviedb.org, so a few quick retries
 * make local development usable on those networks.
 */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 5): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 120 * i));
    }
  }
}

function cacheHeaders() {
  return { 'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' };
}
