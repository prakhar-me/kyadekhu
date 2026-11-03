// Vercel function for the ad auction. vercel.json rewrites /api/ads/<path>
// to /api/ads?__path=<path>.
import { adsEnvFrom, handleAdsRequest } from '../server/ads/router.js';

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let body: unknown = null;
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > 20_000) return Response.json({ error: 'too_large' }, { status: 413 });
    try {
      body = JSON.parse(text || '{}');
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }
  }
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const result = await handleAdsRequest(
    {
      method: request.method,
      path: url.searchParams.get('__path') ?? '',
      query: url.searchParams,
      body,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown',
      origin: process.env.SITE_URL?.replace(/\/$/, '') || `${proto}://${host}`,
      adminPassword: request.headers.get('x-admin-password') ?? undefined,
    },
    adsEnvFrom(process.env),
  );
  return new Response(result.body || null, { status: result.status, headers: result.headers });
}

export const GET = handle;
export const POST = handle;
