// Vercel function for recommendations.
import { handleDiscover } from '../server/recommend/handler.js';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const result = await handleDiscover(url.searchParams, {
    TMDB_READ_ACCESS_TOKEN: process.env.TMDB_READ_ACCESS_TOKEN,
    TMDB_API_KEY: process.env.TMDB_API_KEY,
  });
  return new Response(result.body, {
    status: result.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': result.status === 200 ? 'public, max-age=600, s-maxage=21600, stale-while-revalidate=86400' : 'no-store',
    },
  });
}
