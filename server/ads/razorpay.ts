/** Razorpay Payment Links (test or live keys, decided by the keys themselves). */
export interface RazorpayEnv {
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
}

const API = 'https://api.razorpay.com/v1/payment_links';

function auth(env: RazorpayEnv) {
  const id = env.RAZORPAY_KEY_ID?.trim();
  const secret = env.RAZORPAY_KEY_SECRET?.trim();
  return id && secret ? `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` : null;
}

export const razorpayConfigured = (env: RazorpayEnv) => auth(env) !== null;

export async function createPaymentLink(
  env: RazorpayEnv,
  opts: { bidId: string; amountRupees: number; name: string; email: string; description: string; expiresAt: Date; callbackUrl: string },
): Promise<{ id: string; url: string } | null> {
  const authorization = auth(env);
  if (!authorization) return null;
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: opts.amountRupees * 100,
        currency: 'INR',
        accept_partial: false,
        reference_id: opts.bidId,
        description: opts.description,
        customer: { name: opts.name, email: opts.email },
        notify: { sms: false, email: false },
        reminder_enable: false,
        expire_by: Math.floor(opts.expiresAt.getTime() / 1000),
        callback_url: opts.callbackUrl,
        callback_method: 'get',
      }),
    });
    const body = (await res.json()) as { id?: string; short_url?: string; error?: { description?: string } };
    if (!res.ok || !body.id || !body.short_url) {
      console.error('[razorpay] create failed', res.status, body.error?.description);
      return null;
    }
    return { id: body.id, url: body.short_url };
  } catch (err) {
    console.error('[razorpay] create failed', err);
    return null;
  }
}

export async function paymentLinkStatus(env: RazorpayEnv, id: string): Promise<string | null> {
  const authorization = auth(env);
  if (!authorization) return null;
  try {
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, { headers: { Authorization: authorization } });
    if (!res.ok) return null;
    return ((await res.json()) as { status?: string }).status ?? null;
  } catch {
    return null;
  }
}

export async function cancelPaymentLink(env: RazorpayEnv, id: string) {
  const authorization = auth(env);
  if (!authorization) return;
  await fetch(`${API}/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { Authorization: authorization } }).catch(() => {});
}
