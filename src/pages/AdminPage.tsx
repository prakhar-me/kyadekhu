import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { formatINR } from '../lib/adRules';
import { AdsError, adminAction, fetchAdminOverview, type AdminBid, type AdminWeek } from '../lib/ads';

const KEY = 'kd:admin';
const PHASE: Record<AdminWeek['phase'], string> = {
  bidding: 'Bidding open',
  closed: 'Bidding closed',
  live: 'This week',
  past: 'Past',
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : '';

function readPassword() {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function AdminPage() {
  const [password, setPassword] = useState(readPassword);
  const [draft, setDraft] = useState('');
  const [data, setData] = useState<{ weeks: AdminWeek[]; razorpay: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Admin | Kya Dekhu';
  }, []);

  const load = useCallback(async (pw: string) => {
    setError('');
    try {
      const overview = await fetchAdminOverview(pw);
      setData(overview);
      try {
        sessionStorage.setItem(KEY, pw);
      } catch {
        /* session only */
      }
    } catch (err) {
      const e = err as AdsError;
      if (e.status === 401) {
        setPassword('');
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
      }
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (password) load(password);
  }, [password, load]);

  async function act(bid: AdminBid, action: 'approve' | 'reject' | 'mark_paid') {
    if (action === 'reject' && !window.confirm(`Reject ${bid.brand}’s ad? ${bid.paid_at ? 'They’ve paid, so refund them in Razorpay.' : ''}`)) return;
    setBusy(bid.id + action);
    try {
      await adminAction(password, bid.id, action);
      await load(password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!password || !data) {
    return (
      <div className="page pt-10 sm:pt-16">
        <form
          className="mx-auto flex max-w-[360px] flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setPassword(draft);
          }}
        >
          <h1 className="display text-4xl">Admin</h1>
          <label htmlFor="admin-pw" className="pl-1 text-[13px] text-muted">
            Password
          </label>
          <input id="admin-pw" type="password" autoComplete="current-password" className="field" value={draft} onChange={(e) => setDraft(e.target.value)} />
          {error && (
            <p role="alert" className="pl-1 text-[13px] text-[#f0a3a3]">
              {error}
            </p>
          )}
          <button type="submit" className="h-12 rounded-full bg-ink text-[15px] font-medium text-bg hover:bg-white/85">
            {password && !error ? 'Loading…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="page pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">Ad slots</h1>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => load(password)}>
            Refresh
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              sessionStorage.removeItem(KEY);
              setPassword('');
              setData(null);
            }}
          >
            Sign out
          </button>
        </div>
      </div>
      {!data.razorpay && (
        <p className="mt-4 text-[13px] text-[#f0a3a3]">Razorpay keys aren’t set, so winners won’t get payment links. Mark payments as paid by hand.</p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[13px] text-[#f0a3a3]">
          {error}
        </p>
      )}

      <div className="mt-10 flex flex-col gap-12">
        {data.weeks.map((week) => (
          <section key={week.weekStart} aria-labelledby={`w-${week.weekStart}`}>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 id={`w-${week.weekStart}`} className="section-title">
                {week.label}
              </h2>
              <span className="text-[13px] text-muted">
                {PHASE[week.phase]}
                {week.phase === 'bidding' && `, closes ${when(week.closesAt)}`}
              </span>
            </div>
            {week.bids.length === 0 ? (
              <p className="mt-3 text-[15px] text-faint">No bids.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
                <table className="w-full min-w-[860px] text-left text-[13px]">
                  <thead className="text-faint">
                    <tr className="border-b border-line">
                      <th className="px-4 py-3 font-normal">Bid</th>
                      <th className="px-4 py-3 font-normal">Ad</th>
                      <th className="px-4 py-3 font-normal">Bidder</th>
                      <th className="px-4 py-3 font-normal">Status</th>
                      <th className="px-4 py-3 font-normal">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {week.bids.map((b) => (
                      <BidRow key={b.id} bid={b} winner={b.id === week.winnerId} busy={busy} onAct={act} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function BidRow({
  bid,
  winner,
  busy,
  onAct,
}: {
  bid: AdminBid;
  winner: boolean;
  busy: string | null;
  onAct: (bid: AdminBid, action: 'approve' | 'reject' | 'mark_paid') => void;
}) {
  const states: string[] = [];
  if (!bid.verified_at) states.push(bid.void_reason ? `Void (${bid.void_reason.replace(/_/g, ' ')})` : 'Unconfirmed');
  else if (bid.void_reason) states.push(`Void (${bid.void_reason.replace(/_/g, ' ')})`);
  else states.push('Confirmed');
  if (winner) states.push('Winner');
  if (bid.verified_at) states.push(bid.review === 'approved' ? 'Approved' : bid.review === 'rejected' ? 'Rejected' : 'Not reviewed');
  if (bid.paid_at) states.push(`Paid ${when(bid.paid_at)}`);
  else if (bid.lapsed_at) states.push('Didn’t pay in time');
  else if (bid.payment_requested_at) states.push(`Payment due ${when(bid.payment_deadline)}`);
  if (bid.paid_at && bid.review === 'rejected') states.push('Refund in Razorpay');
  const canAct = !!bid.verified_at && !bid.void_reason;

  return (
    <tr className={`border-b border-line align-top last:border-0 ${winner ? 'bg-white/[0.03]' : ''} ${canAct ? '' : 'text-faint'}`}>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-[14px] text-ink">{formatINR(bid.amount)}</td>
      <td className="max-w-[300px] px-4 py-3">
        <p className="font-medium text-ink">{bid.brand}</p>
        <p className="mt-0.5 text-muted">{bid.ad_text}</p>
        <a href={bid.link_url} target="_blank" rel="noopener noreferrer" className="text-link mt-1 inline-block break-all text-faint">
          {bid.link_url}
        </a>
      </td>
      <td className="px-4 py-3">
        <p className="text-ink">{bid.name}</p>
        <a href={`mailto:${bid.email}`} className="text-link text-muted">
          {bid.email}
        </a>
        <p className="mt-1 font-mono text-xs text-faint">{when(bid.created_at)}</p>
      </td>
      <td className="px-4 py-3">
        <ul className="flex flex-col gap-1">
          {states.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {bid.payment_link_url && !bid.paid_at && !bid.lapsed_at && (
          <a href={bid.payment_link_url} target="_blank" rel="noopener noreferrer" className="text-link mt-1 inline-block text-faint">
            Payment link
          </a>
        )}
      </td>
      <td className="px-4 py-3">
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {bid.review !== 'approved' && (
              <button type="button" disabled={!!busy} onClick={() => onAct(bid, 'approve')} className="pill disabled:opacity-50">
                Approve
              </button>
            )}
            {bid.review !== 'rejected' && (
              <button type="button" disabled={!!busy} onClick={() => onAct(bid, 'reject')} className="pill disabled:opacity-50">
                Reject
              </button>
            )}
            {winner && !bid.paid_at && bid.payment_requested_at && (
              <button type="button" disabled={!!busy} onClick={() => onAct(bid, 'mark_paid')} className="pill disabled:opacity-50">
                Mark paid
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
