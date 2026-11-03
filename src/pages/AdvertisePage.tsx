import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot';
import { useAsync } from '../hooks/useAsync';
import { AD_TEXT_MAX, BRAND_MAX, EMAIL_RE, MAX_BID, formatINR, isHttpUrl } from '../lib/adRules';
import { AdsError, fetchAdStatus, submitBid, type AdStatus } from '../lib/ads';

type Field = 'name' | 'email' | 'brand' | 'website' | 'adText' | 'linkUrl' | 'amount';
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const EMPTY: Values = { name: '', email: '', brand: '', website: '', adText: '', linkUrl: '', amount: '' };
const ORDER: Field[] = ['name', 'email', 'brand', 'website', 'adText', 'linkUrl', 'amount'];

const BANNERS: Record<string, string> = {
  confirmed: 'Your bid is confirmed. We’ve emailed you a copy, and we’ll email you if someone outbids you.',
  outbid: 'Someone placed a higher bid before you confirmed yours. Place a new bid below.',
  expired: 'That confirmation link has expired. Place your bid again below.',
  invalid: 'That confirmation link isn’t valid. Place your bid again below.',
  closed: 'Bidding closed before you confirmed your bid.',
  paid: 'Thanks, your payment is in. Your ad goes live once we’ve approved it.',
};

function validate(v: Values, minBid: number): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = 'Enter your name.';
  if (!EMAIL_RE.test(v.email.trim())) e.email = v.email.trim() ? 'Enter a valid email address.' : 'Enter your email.';
  if (!v.brand.trim()) e.brand = 'Enter your brand.';
  if (!isHttpUrl(v.website.trim())) e.website = 'Enter a full URL, like https://example.com.';
  if (!v.adText.trim()) e.adText = 'Write your ad text.';
  else if (v.adText.trim().length > AD_TEXT_MAX) e.adText = `Keep it to ${AD_TEXT_MAX} characters.`;
  if (!isHttpUrl(v.linkUrl.trim())) e.linkUrl = 'Enter a full URL, like https://example.com.';
  const amount = Number(v.amount);
  if (!v.amount.trim() || !Number.isInteger(amount)) e.amount = 'Enter a whole number of rupees.';
  else if (amount < minBid) e.amount = `Bid at least ${formatINR(minBid)}.`;
  else if (amount > MAX_BID) e.amount = `Bids above ${formatINR(MAX_BID)} aren’t accepted online.`;
  return e;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function countdown(ms: number) {
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d) return `${d}d ${h}h ${min}m`;
  if (h) return `${h}h ${min}m`;
  return min ? `${min}m` : 'under a minute';
}

export function AdvertisePage() {
  const [params] = useSearchParams();
  const banner = BANNERS[params.get('bid') ?? ''];
  const status = useAsync(() => fetchAdStatus(), []);
  const [sentTo, setSentTo] = useState<{ email: string; amount: number } | null>(null);

  useEffect(() => {
    document.title = 'Advertise | Kya Dekhu';
  }, []);

  // Keep the highest bid fresh while the page is open.
  const { retry } = status;
  useEffect(() => {
    const t = setInterval(retry, 60_000);
    return () => clearInterval(t);
  }, [retry]);

  return (
    <div className="page pb-8 pt-10 sm:pt-16">
      <div className="mx-auto max-w-[520px]">
        <p className="-rotate-2 font-hand text-[1.75rem] leading-none text-muted sm:text-[2rem]">kya dekhu? for brands</p>
        <h1 className="display mt-3 text-4xl leading-tight sm:text-5xl">Advertise on Kya Dekhu</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          One sponsored line on the homepage each week. The highest bid wins, and you only pay if you win.
        </p>

        {banner && (
          <p role="status" className="mt-8 rounded-2xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-ink/90">
            {banner}
          </p>
        )}

        <div className="mt-8">
          {status.data ? (
            <SlotStatus status={status.data} />
          ) : status.status === 'error' ? (
            <p className="rounded-2xl border border-line px-5 py-4 text-[15px] text-muted">{status.error.message}</p>
          ) : (
            <div className="skeleton h-[148px] rounded-3xl" aria-busy="true" aria-label="Loading current bid" />
          )}
        </div>

        {sentTo ? (
          <div role="status" className="py-10">
            <p className="-rotate-2 font-hand text-[1.75rem] leading-none text-muted">almost there…</p>
            <h2 className="display mt-3 text-3xl">Check your inbox</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              We’ve sent a confirmation link to <span className="text-ink">{sentTo.email}</span>. Your {formatINR(sentTo.amount)} bid
              only counts once you click it. The link works for 1 hour.
            </p>
            <Link to="/" className="btn-ghost mt-8">
              Back to movies
            </Link>
          </div>
        ) : status.data?.next.open ? (
          <BidForm status={status.data} onRefresh={retry} onSent={setSentTo} />
        ) : status.data ? (
          <p className="mt-10 text-[15px] leading-relaxed text-muted">
            Bidding for next week has closed. A new round opens Monday at 00:00 IST.
          </p>
        ) : null}

        <Terms />
      </div>
    </div>
  );
}

function SlotStatus({ status }: { status: AdStatus }) {
  const now = useNow(15_000);
  const { next } = status;
  const closes = new Date(next.closesAt);
  const closesLabel = closes.toLocaleString('en-IN', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

  return (
    <section aria-labelledby="slot-title" className="rounded-3xl border border-line bg-surface px-5 py-5 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="slot-title" className="text-[15px] font-medium">
          Next week’s slot
        </h2>
        <span className="font-mono text-xs text-muted">{next.label}</span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-[13px] text-muted">Highest bid</dt>
          <dd className="display mt-1 text-[1.9rem] leading-none">{next.highest ? formatINR(next.highest) : 'No bids yet'}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">{next.open ? 'Bidding closes in' : 'Bidding'}</dt>
          <dd className="display mt-1 text-[1.9rem] leading-none">{next.open ? countdown(closes.getTime() - now) : 'Closed'}</dd>
        </div>
      </dl>
      <p className="mt-4 font-mono text-xs text-faint">
        {next.open ? `${closesLabel} IST. Next bid from ${formatINR(next.minBid)}.` : 'The winner is being contacted.'}
      </p>
    </section>
  );
}

function BidForm({
  status,
  onRefresh,
  onSent,
}: {
  status: AdStatus;
  onRefresh: () => void;
  onSent: (s: { email: string; amount: number }) => void;
}) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const minBid = status.next.minBid;

  const errors = { ...validate(values, minBid), ...serverErrors };
  const errorFor = (f: Field) => (submitted || touched[f] ? errors[f] : undefined);

  const bind = (f: Field) => ({
    id: `f-${f}`,
    name: f,
    value: values[f],
    'aria-invalid': errorFor(f) ? true : undefined,
    'aria-describedby':
      [errorFor(f) ? `f-${f}-error` : '', f === 'adText' || f === 'amount' ? `f-${f}-hint` : ''].filter(Boolean).join(' ') || undefined,
    onChange: (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [f]: e.target.value }));
      if (serverErrors[f]) setServerErrors(({ [f]: _, ...rest }) => rest);
    },
    onBlur: () => setTouched((t) => ({ ...t, [f]: true })),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError('');
    const first = ORDER.find((f) => errors[f]);
    if (first) {
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    const sent = { email: values.email.trim(), amount: Number(values.amount) };
    if (honeypot) {
      onSent(sent);
      return;
    }
    setSending(true);
    try {
      await submitBid({ ...values, amount: Number(values.amount), fax: honeypot });
      onSent(sent);
      window.scrollTo(0, 0);
    } catch (err) {
      const e = err as AdsError;
      const fieldErrors = e.body?.errors as Errors | undefined;
      if (e.status === 422 && fieldErrors) {
        setServerErrors(fieldErrors);
        onRefresh();
        const firstServer = ORDER.find((f) => fieldErrors[f]);
        if (firstServer) document.getElementById(`f-${firstServer}`)?.focus();
      } else {
        setFormError(e.message);
      }
    } finally {
      setSending(false);
    }
  }

  const adLength = values.adText.trim().length;

  return (
    <form noValidate onSubmit={onSubmit} className="mt-12 flex flex-col gap-5" aria-labelledby="bid-title">
      <h2 id="bid-title" className="section-title">
        Place a bid
      </h2>

      <FormField id="name" label="Name" error={errorFor('name')}>
        <input type="text" autoComplete="name" className="field" {...bind('name')} />
      </FormField>
      <FormField id="email" label="Email" error={errorFor('email')}>
        <input type="email" autoComplete="email" inputMode="email" className="field" {...bind('email')} />
      </FormField>
      <FormField id="brand" label="Brand" error={errorFor('brand')}>
        <input type="text" autoComplete="organization" maxLength={BRAND_MAX} className="field" {...bind('brand')} />
      </FormField>
      <FormField id="website" label="Website" error={errorFor('website')}>
        <input type="url" autoComplete="url" inputMode="url" placeholder="https://" className="field" {...bind('website')} />
      </FormField>
      <FormField
        id="adText"
        label="Ad text"
        error={errorFor('adText')}
        hint={<span className={adLength > AD_TEXT_MAX ? 'text-[#f0a3a3]' : ''}>{`${adLength}/${AD_TEXT_MAX}`}</span>}
      >
        <input type="text" className="field" placeholder="One short line about what you offer" {...bind('adText')} />
      </FormField>
      <FormField id="linkUrl" label="Link URL" error={errorFor('linkUrl')}>
        <input type="url" inputMode="url" placeholder="https://" className="field" {...bind('linkUrl')} />
      </FormField>
      <FormField id="amount" label="Your bid (₹)" error={errorFor('amount')} hint={`At least ${formatINR(minBid)}`}>
        <input type="text" inputMode="numeric" placeholder={String(minBid)} className="field font-mono" {...bind('amount')} />
      </FormField>

      <div className="mt-2">
        <p className="mb-2 pl-1 text-[13px] text-muted">Preview</p>
        <AdSlot preview text={values.adText.trim() || 'Your ad text appears here.'} linkText={values.brand.trim() || 'Your brand'} />
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="f-fax">Fax</label>
        <input id="f-fax" name="fax" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>

      {formError && (
        <p role="alert" className="text-[13px] text-[#f0a3a3]">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="mt-2 h-12 w-full rounded-full bg-ink text-[15px] font-medium text-bg transition-colors hover:bg-white/85 disabled:opacity-60"
      >
        {sending ? 'Placing bid…' : 'Place bid'}
      </button>
      <p className="-mt-1 text-center text-[13px] text-faint">We’ll email you a link to confirm your bid. No payment now.</p>
    </form>
  );
}

function Terms() {
  return (
    <section aria-labelledby="terms-title" className="mt-16 border-t border-line pt-8">
      <h2 id="terms-title" className="text-[15px] font-medium">
        Terms
      </h2>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[13px] leading-relaxed text-muted marker:text-faint">
        <li>The highest confirmed bid when bidding closes (Sunday 20:00 IST) wins the following week’s slot, Monday to Sunday.</li>
        <li>Bidding is free. Only the winner pays, and pays the amount they bid. There’s no charge for losing bids.</li>
        <li>The winner gets a payment link by email and has 24 hours to pay. Otherwise the slot goes to the next highest bidder.</li>
        <li>Ads must not promote gambling or betting, adult content, or anything misleading.</li>
        <li>We review every ad before it goes live and can reject any ad. If we reject an ad you’ve paid for, you get a full refund.</li>
      </ul>
    </section>
  );
}

function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: Field;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <label htmlFor={`f-${id}`} className="text-[13px] text-muted">
          {label}
        </label>
        {hint && (
          <span id={`f-${id}-hint`} className="font-mono text-xs text-faint">
            {hint}
          </span>
        )}
      </div>
      {children}
      {error && (
        <p id={`f-${id}-error`} className="pl-1 text-[13px] text-[#f0a3a3]">
          {error}
        </p>
      )}
    </div>
  );
}
