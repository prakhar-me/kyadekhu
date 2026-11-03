/**
 * Advertiser enquiries. Validates the form, drops honeypot submissions, saves
 * to data/enquiries.jsonl where the filesystem is writable (local/Node hosts)
 * and emails the enquiry through Resend when configured.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AD_TYPES, BUDGETS, EMAIL_RE } from '../src/lib/enquiryOptions';

export interface EnquiryEnv {
  RESEND_API_KEY?: string;
  ENQUIRY_TO_EMAIL?: string;
  ENQUIRY_FROM_EMAIL?: string;
}

export interface EnquiryResult {
  status: number;
  body: string;
}

const LIMITS = { name: 120, email: 200, company: 160, website: 300, message: 4000, startDate: 10 };

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const recent = new Map<string, number[]>();

const reply = (status: number, data: unknown): EnquiryResult => ({ status, body: JSON.stringify(data) });

function rateLimited(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > RATE_MAX;
}

export async function handleEnquiry(raw: unknown, ip: string, env: EnquiryEnv): Promise<EnquiryResult> {
  if (!raw || typeof raw !== 'object') return reply(400, { error: 'invalid_body' });
  const input = raw as Record<string, unknown>;
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string).trim() : '');

  // Honeypot: bots fill every field. Pretend it worked.
  if (str('fax')) return reply(200, { ok: true });
  if (rateLimited(ip)) return reply(429, { error: 'rate_limited', message: 'Too many enquiries. Try again in a few minutes.' });

  const enquiry = {
    name: str('name'),
    email: str('email'),
    company: str('company'),
    website: str('website'),
    message: str('message'),
    adType: str('adType'),
    budget: str('budget'),
    startDate: str('startDate'),
  };

  const errors: Record<string, string> = {};
  if (!enquiry.name) errors.name = 'Enter your name.';
  if (!enquiry.email) errors.email = 'Enter your email.';
  else if (!EMAIL_RE.test(enquiry.email)) errors.email = 'Enter a valid email address.';
  if (!enquiry.company) errors.company = 'Enter your company or brand.';
  if (!enquiry.message) errors.message = 'Tell us what you want to promote.';
  if (!(AD_TYPES as readonly string[]).includes(enquiry.adType)) errors.adType = 'Choose an ad type.';
  if (!(BUDGETS as readonly string[]).includes(enquiry.budget)) errors.budget = 'Choose a budget.';
  if (enquiry.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(enquiry.startDate)) errors.startDate = 'Enter a valid date.';
  for (const [k, max] of Object.entries(LIMITS)) {
    if (enquiry[k as keyof typeof enquiry].length > max) errors[k] = 'This is too long.';
  }
  if (Object.keys(errors).length) return reply(422, { error: 'validation', errors });

  const record = { ...enquiry, receivedAt: new Date().toISOString() };
  const [saved, emailed] = await Promise.all([save(record), sendEmail(record, env)]);

  if (!saved && !emailed) {
    return reply(503, { error: 'not_configured', message: 'We couldn’t send your enquiry. Please try again later.' });
  }
  return reply(200, { ok: true });
}

async function save(record: object) {
  try {
    const dir = join(process.cwd(), 'data');
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'enquiries.jsonl'), JSON.stringify(record) + '\n', 'utf8');
    return true;
  } catch {
    return false; // read-only filesystem (e.g. serverless) — rely on email
  }
}

async function sendEmail(e: Record<string, string>, env: EnquiryEnv) {
  const key = env.RESEND_API_KEY?.trim();
  const to = env.ENQUIRY_TO_EMAIL?.trim();
  if (!key || !to) return false;

  const text = [
    `Name: ${e.name}`,
    `Email: ${e.email}`,
    `Company: ${e.company}`,
    `Website: ${e.website || '–'}`,
    `Ad type: ${e.adType}`,
    `Budget: ${e.budget}`,
    `Preferred start: ${e.startDate || '–'}`,
    '',
    e.message,
    '',
    `Received ${e.receivedAt}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.ENQUIRY_FROM_EMAIL?.trim() || 'Kya Dekhu <onboarding@resend.dev>',
        to: to.split(',').map((s) => s.trim()),
        reply_to: e.email,
        subject: `Ad enquiry: ${e.company} (${e.budget})`,
        text,
      }),
    });
    if (!res.ok) console.error('[enquiry] Resend error', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('[enquiry] email failed', err);
    return false;
  }
}
