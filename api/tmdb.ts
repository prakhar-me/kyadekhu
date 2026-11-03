// Vercel serverless function. vercel.json rewrites /api/tmdb/<path> to
// /api/tmdb?__path=<path>.
import { handleTmdbRequest } from '../server/tmdbProxy.js';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get('__path') ?? '';
  const result = await handleTmdbRequest(path, url.searchParams, {
    TMDB_READ_ACCESS_TOKEN: process.env.TMDB_READ_ACCESS_TOKEN,
    TMDB_API_KEY: process.env.TMDB_API_KEY,
  });
  return new Response(result.body, { status: result.status, headers: result.headers });
}
