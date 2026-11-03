import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AD_TYPES, BUDGETS, EMAIL_RE } from '../lib/enquiryOptions';

type Field = 'name' | 'email' | 'company' | 'website' | 'message' | 'adType' | 'budget' | 'startDate';
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const EMPTY: Values = { name: '', email: '', company: '', website: '', message: '', adType: '', budget: '', startDate: '' };
const ORDER: Field[] = ['name', 'email', 'company', 'website', 'message', 'adType', 'budget', 'startDate'];

function validate(v: Values): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = 'Enter your name.';
  if (!v.email.trim()) e.email = 'Enter your email.';
  else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email address.';
  if (!v.company.trim()) e.company = 'Enter your company or brand.';
  if (!v.message.trim()) e.message = 'Tell us what you want to promote.';
  if (!v.adType) e.adType = 'Choose an ad type.';
  if (!v.budget) e.budget = 'Choose a budget.';
  return e;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Web3Forms' free plan only accepts submissions from the browser, and its
 * access key is public by design, so it is read from a VITE_ variable.
 * Without it, enquiries go to our own /api/enquiry endpoint (Resend).
 */
const WEB3FORMS_KEY = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY?.trim();

function sendViaWeb3Forms(v: Values) {
  return fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: WEB3FORMS_KEY,
      subject: `Ad enquiry: ${v.company.trim()} (${v.budget})`,
      from_name: 'Kya Dekhu',
      replyto: v.email.trim(),
      Name: v.name.trim(),
      Email: v.email.trim(),
      Company: v.company.trim(),
      Website: v.website.trim() || '–',
      'Ad type': v.adType,
      'Monthly budget': v.budget,
      'Preferred start': v.startDate || '–',
      Message: v.message.trim(),
    }),
  });
}

function sendViaApi(v: Values, honeypot: string) {
  return fetch('/api/enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...v, fax: honeypot }),
  });
}

export function EnquiryPage() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [formError, setFormError] = useState('');
  const [honeypot, setHoneypot] = useState('');

  useEffect(() => {
    document.title = 'Advertise | Kya Dekhu';
  }, []);

  const errors = { ...serverErrors, ...validate(values) };
  const errorFor = (f: Field) => (submitted || touched[f] ? errors[f] : undefined);

  const bind = (f: Field) => ({
    id: `f-${f}`,
    name: f,
    value: values[f],
    'aria-invalid': errorFor(f) ? true : undefined,
    'aria-describedby': errorFor(f) ? `f-${f}-error` : undefined,
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
    const clientErrors = validate(values);
    const first = ORDER.find((f) => clientErrors[f]);
    if (first) {
      document.getElementById(`f-${first}`)?.focus();
      return;
    }

    // Honeypot filled: almost certainly a bot. Look successful, send nothing.
    if (honeypot) {
      setStatus('sent');
      return;
    }

    setStatus('sending');
    try {
      const res = WEB3FORMS_KEY ? await sendViaWeb3Forms(values) : await sendViaApi(values, honeypot);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success !== false) {
        setStatus('sent');
        window.scrollTo(0, 0);
        return;
      }
      setStatus('idle');
      if (res.status === 422 && body.errors) {
        setServerErrors(body.errors);
        const firstServer = ORDER.find((f) => body.errors[f]);
        if (firstServer) document.getElementById(`f-${firstServer}`)?.focus();
      } else {
        console.error('[advertise] enquiry not sent', res.status, body);
        setFormError('We couldn’t send your enquiry. Please try again later.');
      }
    } catch {
      setStatus('idle');
      setFormError('Couldn’t connect. Check your internet connection and try again.');
    }
  }

  return (
    <div className="page pb-8 pt-10 sm:pt-16">
      <div className="mx-auto max-w-[520px]">
        {status === 'sent' ? (
          <div role="status" className="py-10">
            <p className="-rotate-2 font-hand text-[1.75rem] leading-none text-muted">thank you!</p>
            <h1 className="display mt-3 text-4xl leading-tight sm:text-5xl">Enquiry sent</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Thanks, {values.name.trim().split(' ')[0]}. We’ll reply to {values.email.trim()} within 2 working days.
            </p>
            <Link to="/" className="btn-ghost mt-8">
              Back to movies
            </Link>
          </div>
        ) : (
          <>
            <p className="-rotate-2 font-hand text-[1.75rem] leading-none text-muted sm:text-[2rem]">kya dekhu? for brands</p>
            <h1 className="display mt-3 text-4xl leading-tight sm:text-5xl">Advertise on Kya Dekhu</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Tell us what you want to promote and we’ll get back within 2 working days.
            </p>

            <form noValidate onSubmit={onSubmit} className="mt-10 flex flex-col gap-5">
              <FormField id="name" label="Name" error={errorFor('name')}>
                <input type="text" autoComplete="name" className="field" {...bind('name')} />
              </FormField>
              <FormField id="email" label="Email" error={errorFor('email')}>
                <input type="email" autoComplete="email" inputMode="email" className="field" {...bind('email')} />
              </FormField>
              <FormField id="company" label="Company or brand" error={errorFor('company')}>
                <input type="text" autoComplete="organization" className="field" {...bind('company')} />
              </FormField>
              <FormField id="website" label="Website" optional error={errorFor('website')}>
                <input type="url" autoComplete="url" inputMode="url" placeholder="https://" className="field" {...bind('website')} />
              </FormField>
              <FormField id="message" label="What do you want to promote?" error={errorFor('message')}>
                <textarea rows={5} className="field field-area" {...bind('message')} />
              </FormField>
              <FormField id="adType" label="Ad type" error={errorFor('adType')}>
                <select className="field field-select" data-empty={!values.adType} {...bind('adType')}>
                  <option value="" disabled>
                    Choose one
                  </option>
                  {AD_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </FormField>
              <FormField id="budget" label="Monthly budget" error={errorFor('budget')}>
                <select className="field field-select" data-empty={!values.budget} {...bind('budget')}>
                  <option value="" disabled>
                    Choose one
                  </option>
                  {BUDGETS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </FormField>
              <FormField id="startDate" label="Preferred start date" optional error={errorFor('startDate')}>
                <input type="date" min={today()} className="field" {...bind('startDate')} />
              </FormField>

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
                disabled={status === 'sending'}
                className="mt-2 h-12 w-full rounded-full bg-ink text-[15px] font-medium text-bg transition-colors hover:bg-white/85 disabled:opacity-60"
              >
                {status === 'sending' ? 'Sending…' : 'Send enquiry'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function FormField({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: Field;
  label: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`f-${id}`} className="pl-1 text-[13px] text-muted">
        {label}
        {optional && <span className="text-faint"> (optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`f-${id}-error`} className="pl-1 text-[13px] text-[#f0a3a3]">
          {error}
        </p>
      )}
    </div>
  );
}
