/**
 * Weekly homepage-slot auction.
 *
 * Lifecycle of the week W (keyed by its Monday):
 *   bidding open until Sunday 20:00 IST before W → closed → the top eligible
 *   bid is asked to pay (24h payment link) → paid + approved = live during W.
 *   If the winner doesn't pay in time, or the ad is rejected, the next
 *   eligible bid is asked, and so on.
 *
 * State only moves forward inside tick(), which runs on page loads (throttled),
 * from the admin page and from a daily cron.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  AD_TEXT_MAX,
  BRAND_MAX,
  EMAIL_RE,
  MAX_BID,
  formatINR,
  isHttpUrl,
  minNextBid,
} from '../../src/lib/adRules.js';
import { ELIGIBLE, getDb, type Db, type DbEnv } from './db.js';
import { sendMail, type MailEnv } from './mailer.js';
import { cancelPaymentLink, createPaymentLink, paymentLinkStatus, razorpayConfigured, type RazorpayEnv } from './razorpay.js';
import { biddingClosesAt, biddingWeek, isBiddingOpen, weekEndsAt, weekKey } from './time.js';

export type AdsEnv = DbEnv &
  MailEnv &
  RazorpayEnv & {
    VITE_ADS_LIVE?: string;
    ADMIN_PASSWORD?: string;
    ADMIN_EMAIL?: string;
    SITE_URL?: string;
  };

export interface Bid {
  id: string;
  week_start: string;
  name: string;
  email: string;
  brand: string;
  website: string;
  ad_text: string;
  link_url: string;
  amount: number;
  created_at: Date;
  verified_at: Date | null;
  void_reason: string | null;
  review: 'pending' | 'approved' | 'rejected';
  payment_requested_at: Date | null;
  payment_deadline: Date | null;
  payment_link_id: string | null;
  payment_link_url: string | null;
  paid_at: Date | null;
  lapsed_at: Date | null;
}

const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 60 * 1000;
const RATE = { windowMs: 60 * 60 * 1000, perEmail: 5, perIp: 10 };
const PUBLIC_COLUMNS = `id, week_start, name, email, brand, website, ad_text, link_url, amount, created_at, verified_at,
  void_reason, review, payment_requested_at, payment_deadline, payment_link_id, payment_link_url, paid_at, lapsed_at`;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const weekLabel = (key: string) => {
  const start = new Date(`${key}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86400000);
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', ...(withMonth ? { month: 'short' } : {}), timeZone: 'UTC' });
  return `${fmt(start, start.getUTCMonth() !== end.getUTCMonth())} – ${fmt(end, true)}`;
};

async function topEligible(db: Db, week: string, excludeId?: string): Promise<Bid | undefined> {
  const rows = await db.query<Bid>(
    `SELECT ${PUBLIC_COLUMNS} FROM bids WHERE week_start = $1 AND ${ELIGIBLE} ${excludeId ? 'AND id <> $2' : ''}
     ORDER BY amount DESC, verified_at ASC LIMIT 1`,
    excludeId ? [week, excludeId] : [week],
  );
  return rows[0];
}

/* ------------------------------------------------------------------------ */
/* Public status                                                             */
/* ------------------------------------------------------------------------ */

export async function getStatus(env: AdsEnv, now = new Date()) {
  const db = await getDb(env);
  await tick(env, now);
  const next = biddingWeek(now);
  const top = await topEligible(db, next);
  const current = weekKey(now);
  const live = await db.query<Bid>(
    `SELECT ${PUBLIC_COLUMNS} FROM bids WHERE week_start = $1 AND ${ELIGIBLE} AND paid_at IS NOT NULL AND review = 'approved'
     ORDER BY amount DESC LIMIT 1`,
    [current],
  );
  return {
    next: {
      weekStart: next,
      label: weekLabel(next),
      closesAt: biddingClosesAt(next).toISOString(),
      open: isBiddingOpen(next, now),
      highest: top?.amount ?? null,
      minBid: minNextBid(top?.amount ?? null),
    },
    live: live[0] ? { brand: live[0].brand, text: live[0].ad_text, url: live[0].link_url } : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Placing and confirming bids                                               */
/* ------------------------------------------------------------------------ */

export interface Result {
  status: number;
  body: Record<string, unknown>;
}

export async function placeBid(env: AdsEnv, raw: Record<string, unknown>, ip: string, origin: string, now = new Date()): Promise<Result> {
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '');
  if (env.VITE_ADS_LIVE !== 'true') {
    return { status: 503, body: { error: 'coming_soon', message: 'Bidding opens soon.' } };
  }
  if (str('fax')) return { status: 200, body: { ok: true } }; // honeypot

  const input = {
    name: str('name'),
    email: str('email').toLowerCase(),
    brand: str('brand'),
    website: str('website'),
    adText: str('adText').replace(/\s+/g, ' '),
    linkUrl: str('linkUrl'),
    amount: Number(raw.amount),
  };

  const errors: Record<string, string> = {};
  if (!input.name) errors.name = 'Enter your name.';
  else if (input.name.length > 120) errors.name = 'This is too long.';
  if (!EMAIL_RE.test(input.email) || input.email.length > 200) errors.email = 'Enter a valid email address.';
  if (!input.brand) errors.brand = 'Enter your brand.';
  else if (input.brand.length > BRAND_MAX) errors.brand = `Keep it under ${BRAND_MAX} characters.`;
  if (!isHttpUrl(input.website) || input.website.length > 300) errors.website = 'Enter a full URL, like https://example.com.';
  if (!input.adText) errors.adText = 'Write your ad text.';
  else if (input.adText.length > AD_TEXT_MAX) errors.adText = `Keep it to ${AD_TEXT_MAX} characters.`;
  if (!isHttpUrl(input.linkUrl) || input.linkUrl.length > 500) errors.linkUrl = 'Enter a full URL, like https://example.com.';

  const db = await getDb(env);
  const week = biddingWeek(now);
  if (!isBiddingOpen(week, now)) {
    return { status: 409, body: { error: 'closed', message: 'Bidding for next week has closed. A new round opens Monday 00:00 IST.' } };
  }
  const top = await topEligible(db, week);
  const min = minNextBid(top?.amount ?? null);
  if (!Number.isInteger(input.amount)) errors.amount = 'Enter a whole number of rupees.';
  else if (input.amount < min) errors.amount = `Bid at least ${formatINR(min)}.`;
  else if (input.amount > MAX_BID) errors.amount = `Bids above ${formatINR(MAX_BID)} aren’t accepted online.`;
  if (Object.keys(errors).length) return { status: 422, body: { error: 'validation', errors, minBid: min } };

  const ipHash = sha256(`kd-bid:${ip}`);
  const since = new Date(now.getTime() - RATE.windowMs);
  const [{ n: byEmail }] = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM bids WHERE email = $1 AND created_at > $2`, [input.email, since]);
  const [{ n: byIp }] = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM bids WHERE ip_hash = $1 AND created_at > $2`, [ipHash, since]);
  if (byEmail >= RATE.perEmail || byIp >= RATE.perIp) {
    return { status: 429, body: { error: 'rate_limited', message: 'Too many bids in the last hour. Try again later.' } };
  }

  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO bids (id, week_start, name, email, brand, website, ad_text, link_url, amount, ip_hash, token_hash, token_expires_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, week, input.name, input.email, input.brand, input.website, input.adText, input.linkUrl, input.amount, ipHash, sha256(token), new Date(now.getTime() + TOKEN_TTL_MS), now],
  );

  const link = `${origin}/api/ads/verify?token=${token}`;
  const sent = await sendMail(
    {
      to: input.email,
      subject: `Confirm your ${formatINR(input.amount)} bid on Kya Dekhu`,
      text: [
        `Hi ${input.name},`,
        '',
        `You bid ${formatINR(input.amount)} for the Kya Dekhu homepage slot, week of ${weekLabel(week)}.`,
        'Your bid only counts once you confirm it:',
        '',
        link,
        '',
        'This link works for 1 hour. If you didn’t place this bid, ignore this email.',
        '',
        `Your ad: “${input.adText}” (${input.linkUrl})`,
      ].join('\n'),
    },
    env,
  );
  if (!sent) {
    await db.query(`UPDATE bids SET void_reason = 'email_failed', token_hash = NULL WHERE id = $1`, [id]);
    return { status: 503, body: { error: 'email_failed', message: 'We couldn’t send the confirmation email. Please try again later.' } };
  }
  return { status: 200, body: { ok: true } };
}

export type VerifyOutcome = 'confirmed' | 'outbid' | 'expired' | 'invalid' | 'closed';

export async function verifyBid(env: AdsEnv, token: string, origin: string, now = new Date()): Promise<VerifyOutcome> {
  if (!token || token.length > 100) return 'invalid';
  const db = await getDb(env);
  const [bid] = await db.query<Bid & { token_expires_at: Date }>(
    `SELECT ${PUBLIC_COLUMNS}, token_expires_at FROM bids WHERE token_hash = $1`,
    [sha256(token)],
  );
  if (!bid) return 'invalid';
  if (bid.verified_at) return 'confirmed';
  if (bid.void_reason) return 'invalid';
  if (new Date(bid.token_expires_at) < now) return 'expired';
  if (!isBiddingOpen(bid.week_start, now)) return 'closed';

  const previousTop = await topEligible(db, bid.week_start);
  if (bid.amount < minNextBid(previousTop?.amount ?? null)) {
    await db.query(`UPDATE bids SET void_reason = 'outbid_before_confirmation', token_hash = NULL WHERE id = $1`, [bid.id]);
    return 'outbid';
  }
  const updated = await db.query(`UPDATE bids SET verified_at = $2, token_hash = NULL WHERE id = $1 AND verified_at IS NULL RETURNING id`, [bid.id, now]);
  if (!updated.length) return 'confirmed';

  const label = weekLabel(bid.week_start);
  const closes = biddingClosesAt(bid.week_start).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  await sendMail(
    {
      to: bid.email,
      subject: `Your ${formatINR(bid.amount)} bid is in`,
      text: [
        `Hi ${bid.name},`,
        '',
        `Your bid of ${formatINR(bid.amount)} for the week of ${label} is confirmed and is currently the highest.`,
        `Bidding closes ${closes} IST. We’ll email you if someone outbids you.`,
        '',
        'If you win, we’ll email you a payment link. You only pay if you win.',
      ].join('\n'),
    },
    env,
  );
  if (previousTop && previousTop.email !== bid.email) {
    await sendMail(
      {
        to: previousTop.email,
        subject: `You’ve been outbid on Kya Dekhu`,
        text: [
          `Hi ${previousTop.name},`,
          '',
          `Someone bid ${formatINR(bid.amount)} for the week of ${label}, above your ${formatINR(previousTop.amount)}.`,
          `To win the slot, bid at least ${formatINR(bid.amount + 100)} before ${closes} IST:`,
          '',
          `${origin}/advertise`,
        ].join('\n'),
      },
      env,
    );
  }
  return 'confirmed';
}

/* ------------------------------------------------------------------------ */
/* Moving auctions forward                                                   */
/* ------------------------------------------------------------------------ */

let lastTick = 0;

export async function tick(env: AdsEnv, now = new Date(), force = false) {
  if (!force && Date.now() - lastTick < 30_000) return;
  lastTick = Date.now();
  const db = await getDb(env);
  const origin = env.SITE_URL?.trim().replace(/\/$/, '') || '';

  // Closed weeks that haven't ended yet (plus the one about to start).
  const weeks = [weekKey(now), biddingWeek(now)].filter((w) => biddingClosesAt(w) <= now && weekEndsAt(w) > now);

  for (const week of weeks) {
    for (let guard = 0; guard < 50; guard++) {
      const winner = await topEligible(db, week);
      if (!winner || winner.paid_at) break;

      if (!winner.payment_requested_at) {
        const deadline = new Date(now.getTime() + PAYMENT_WINDOW_MS);
        const claimed = await db.query(
          `UPDATE bids SET payment_requested_at = $2, payment_deadline = $3 WHERE id = $1 AND payment_requested_at IS NULL RETURNING id`,
          [winner.id, now, deadline],
        );
        if (!claimed.length) break; // another run got here first
        await requestPayment(db, env, winner, deadline, origin);
        break;
      }

      if (winner.payment_link_id) {
        const status = await paymentLinkStatus(env, winner.payment_link_id);
        if (status === 'paid') {
          await markPaid(db, env, winner, now);
          break;
        }
      }

      if (winner.payment_deadline && new Date(winner.payment_deadline) <= now) {
        await db.query(`UPDATE bids SET lapsed_at = $2 WHERE id = $1 AND paid_at IS NULL`, [winner.id, now]);
        if (winner.payment_link_id) await cancelPaymentLink(env, winner.payment_link_id);
        await sendMail(
          {
            to: winner.email,
            subject: 'Your Kya Dekhu payment window has closed',
            text: `Hi ${winner.name},\n\nWe didn’t receive payment for your ${formatINR(winner.amount)} bid (week of ${weekLabel(week)}) within 24 hours, so the slot has gone to the next bidder.`,
          },
          env,
        );
        continue; // offer it to the next bidder
      }
      break;
    }
  }
}

async function requestPayment(db: Db, env: AdsEnv, bid: Bid, deadline: Date, origin: string) {
  const link = await createPaymentLink(env, {
    bidId: bid.id,
    amountRupees: bid.amount,
    name: bid.name,
    email: bid.email,
    description: `Kya Dekhu homepage slot, week of ${weekLabel(bid.week_start)}`,
    expiresAt: deadline,
    callbackUrl: `${origin || 'https://kyadekhu.vercel.app'}/advertise?bid=paid`,
  });
  if (link) await db.query(`UPDATE bids SET payment_link_id = $2, payment_link_url = $3 WHERE id = $1`, [bid.id, link.id, link.url]);

  const due = deadline.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  await sendMail(
    {
      to: bid.email,
      subject: `You won the Kya Dekhu homepage slot`,
      text: [
        `Hi ${bid.name},`,
        '',
        `Your ${formatINR(bid.amount)} bid won the homepage slot for the week of ${weekLabel(bid.week_start)}.`,
        link
          ? `Please pay by ${due} IST using this link:\n\n${link.url}\n`
          : `We’ll send you payment details shortly. You’ll have until ${due} IST to pay.\n`,
        'If payment isn’t received in time, the slot goes to the next highest bidder.',
        'Your ad goes live once it’s paid for and approved.',
      ].join('\n'),
    },
    env,
  );
  await notifyAdmin(env, `Auction closed: ${bid.brand} won at ${formatINR(bid.amount)}`, [
    `Week of ${weekLabel(bid.week_start)}`,
    `Winner: ${bid.name} <${bid.email}>, ${bid.brand}`,
    `Ad: “${bid.ad_text}” → ${bid.link_url}`,
    link ? `Payment link: ${link.url}` : 'Razorpay is not configured, so no payment link was created. Send payment details yourself.',
    '',
    `Review it at ${origin}/admin`,
  ]);
}

async function markPaid(db: Db, env: AdsEnv, bid: Bid, now: Date) {
  const updated = await db.query(`UPDATE bids SET paid_at = $2 WHERE id = $1 AND paid_at IS NULL RETURNING id`, [bid.id, now]);
  if (!updated.length) return;
  await notifyAdmin(env, `Paid: ${bid.brand} ${formatINR(bid.amount)}`, [
    `Week of ${weekLabel(bid.week_start)}. Review status: ${bid.review}.`,
    bid.review === 'approved' ? 'The ad is approved and will show on the homepage.' : 'Approve the ad in /admin to put it live.',
  ]);
}

async function notifyAdmin(env: AdsEnv, subject: string, lines: string[]) {
  const to = env.ADMIN_EMAIL?.trim();
  if (to) await sendMail({ to, subject, text: lines.join('\n') }, env);
}

/* ------------------------------------------------------------------------ */
/* Admin                                                                     */
/* ------------------------------------------------------------------------ */

export function checkAdminPassword(env: AdsEnv, given: string | undefined) {
  const expected = env.ADMIN_PASSWORD;
  if (!expected || !given) return false;
  return timingSafeEqual(Buffer.from(sha256(expected)), Buffer.from(sha256(given)));
}

export async function adminOverview(env: AdsEnv, now = new Date()) {
  await tick(env, now, true);
  const db = await getDb(env);
  const bids = await db.query<Bid>(
    `SELECT ${PUBLIC_COLUMNS} FROM bids WHERE void_reason IS DISTINCT FROM 'email_failed' ORDER BY week_start DESC, amount DESC LIMIT 1000`,
  );
  const current = weekKey(now);
  const weekKeys = [...new Set([biddingWeek(now), current, ...bids.map((b) => b.week_start)])].sort().reverse();

  const weeks = await Promise.all(
    weekKeys.map(async (key) => {
      const winner = biddingClosesAt(key) <= now ? await topEligible(db, key) : undefined;
      const phase =
        key === biddingWeek(now) && isBiddingOpen(key, now)
          ? 'bidding'
          : key === current
            ? 'live'
            : key > current
              ? 'closed'
              : 'past';
      return {
        weekStart: key,
        label: weekLabel(key),
        phase,
        closesAt: biddingClosesAt(key).toISOString(),
        winnerId: winner?.id ?? null,
        bids: bids.filter((b) => b.week_start === key),
      };
    }),
  );
  return { weeks, razorpay: razorpayConfigured(env), now: now.toISOString() };
}

export async function adminAction(env: AdsEnv, id: string, action: string, now = new Date()): Promise<Result> {
  const db = await getDb(env);
  const [bid] = await db.query<Bid>(`SELECT ${PUBLIC_COLUMNS} FROM bids WHERE id = $1`, [id]);
  if (!bid) return { status: 404, body: { error: 'not_found' } };

  if (action === 'approve') {
    await db.query(`UPDATE bids SET review = 'approved' WHERE id = $1`, [id]);
  } else if (action === 'reject') {
    await db.query(`UPDATE bids SET review = 'rejected' WHERE id = $1`, [id]);
    if (bid.payment_link_id && !bid.paid_at) await cancelPaymentLink(env, bid.payment_link_id);
    if (bid.payment_requested_at) {
      await sendMail(
        {
          to: bid.email,
          subject: 'Your Kya Dekhu ad wasn’t approved',
          text: `Hi ${bid.name},\n\nWe couldn’t approve your ad for the week of ${weekLabel(bid.week_start)}, so the slot has gone to the next bidder.${
            bid.paid_at ? ' Your payment will be refunded in full.' : ' You won’t be charged.'
          }`,
        },
        env,
      );
    }
  } else if (action === 'mark_paid') {
    await markPaid(db, env, bid, now);
  } else {
    return { status: 400, body: { error: 'unknown_action' } };
  }
  await tick(env, now, true);
  return { status: 200, body: { ok: true } };
}

