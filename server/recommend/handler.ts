/**
 * GET /api/discover?q=<text>            resolve a typed title, then recommend
 * GET /api/discover?type=movie|tv&id=N  recommend for a known title
 */
import type { TmdbEnv } from '../tmdbProxy.js';
import { recommend, resolveQuery, type MediaType } from './engine.js';

const RESULT_TTL_MS = 6 * 60 * 60 * 1000;
const results = new Map<string, { expires: number; body: string }>();

export async function handleDiscover(query: URLSearchParams, env: TmdbEnv): Promise<{ status: number; body: string }> {
  const json = (status: number, data: unknown) => ({ status, body: JSON.stringify(data) });
  try {
    let type = query.get('type') as MediaType | null;
    let id = Number(query.get('id'));
    let alternatives: { type: MediaType; id: number; title: string; year: number | null }[] = [];
    const q = query.get('q')?.trim();

    if (q) {
      if (q.length > 200) return json(400, { error: 'query_too_long' });
      const resolved = await resolveQuery(env, q);
      if (!resolved) return json(200, { kind: 'none' });
      ({ type, id } = resolved.match);
      alternatives = resolved.alternatives;
    }
    if ((type !== 'movie' && type !== 'tv') || !Number.isInteger(id) || id <= 0) {
      return json(400, { error: 'bad_request', message: 'Pass q, or type and id.' });
    }

    const key = `${type}:${id}`;
    const hit = results.get(key);
    let body: string;
    if (hit && hit.expires > Date.now()) body = hit.body;
    else {
      body = JSON.stringify(await recommend(env, type, id));
      if (results.size > 500) results.delete(results.keys().next().value!);
      results.set(key, { expires: Date.now() + RESULT_TTL_MS, body });
    }
    const data = JSON.parse(body);
    return json(200, { kind: 'seed', ...data, alternatives });
  } catch (err) {
    const e = err as { status?: number; code?: string; message?: string };
    if (e.code === 'missing_credentials') return json(500, { error: 'missing_credentials', message: e.message });
    if (e.status === 404) return json(404, { error: 'not_found', message: 'TMDB has no title with this ID.' });
    console.error('[discover]', err);
    return json(502, { error: 'upstream_error', message: 'Couldn’t load recommendations. Please try again.' });
  }
}
