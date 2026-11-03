/**
 * Routes for /api/ads/*. Framework-agnostic: the Vite dev server and the
 * Vercel function both translate their requests into AdsRequest.
 */
import { DbNotConfiguredError } from './db.js';
import { adminAction, adminOverview, checkAdminPassword, getStatus, placeBid, tick, verifyBid, type AdsEnv } from './service.js';

export interface AdsRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  ip: string;
  origin: string;
  adminPassword?: string;
}

export interface AdsResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const json = (status: number, data: unknown, headers: Record<string, string> = {}): AdsResponse => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  body: JSON.stringify(data),
});

const failedAdminLogins = new Map<string, number[]>();

export async function handleAdsRequest(req: AdsRequest, env: AdsEnv): Promise<AdsResponse> {
  const path = req.path.replace(/^\/+|\/+$/g, '');
  try {
    if (req.method === 'GET' && path === 'status') return json(200, await getStatus(env));

    if (req.method === 'POST' && path === 'bid') {
      const r = await placeBid(env, (req.body ?? {}) as Record<string, unknown>, req.ip, req.origin);
      return json(r.status, r.body);
    }

    if (req.method === 'GET' && path === 'verify') {
      const outcome = await verifyBid(env, req.query.get('token') ?? '', req.origin);
      return { status: 302, headers: { Location: `/advertise?bid=${outcome}`, 'Cache-Control': 'no-store' }, body: '' };
    }

    // Daily Vercel cron and manual nudges. Idempotent and throttled.
    if (req.method === 'GET' && path === 'tick') {
      await tick(env);
      return json(200, { ok: true });
    }

    if (path.startsWith('admin/')) {
      if (!env.ADMIN_PASSWORD) return json(503, { error: 'admin_not_configured', message: 'Set ADMIN_PASSWORD on the server.' });
      const recent = (failedAdminLogins.get(req.ip) ?? []).filter((t) => Date.now() - t < 15 * 60 * 1000);
      if (recent.length >= 10) return json(429, { error: 'rate_limited', message: 'Too many attempts. Try again in 15 minutes.' });
      if (!checkAdminPassword(env, req.adminPassword)) {
        failedAdminLogins.set(req.ip, [...recent, Date.now()]);
        return json(401, { error: 'unauthorized', message: 'Wrong password.' });
      }
      if (req.method === 'GET' && path === 'admin/overview') return json(200, await adminOverview(env));
      if (req.method === 'POST' && path === 'admin/action') {
        const { id, action } = (req.body ?? {}) as { id?: string; action?: string };
        const r = await adminAction(env, String(id ?? ''), String(action ?? ''));
        return json(r.status, r.body);
      }
    }

    return json(404, { error: 'not_found' });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return json(503, { error: 'db_not_configured', message: 'Advertising isn’t set up yet. Please check back soon.' });
    }
    console.error('[ads]', err);
    return json(500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
  }
}

export function adsEnvFrom(source: Record<string, string | undefined>): AdsEnv {
  const keys = [
    'DATABASE_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM',
    'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'ADMIN_PASSWORD', 'ADMIN_EMAIL', 'SITE_URL',
  ] as const;
  return Object.fromEntries(keys.map((k) => [k, source[k]])) as AdsEnv;
}
