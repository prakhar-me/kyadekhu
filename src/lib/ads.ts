// Client for /api/ads.

/** The auction is switched off ("coming soon") unless VITE_ADS_LIVE=true at build time. */
export const ADS_LIVE = import.meta.env.VITE_ADS_LIVE === 'true';

export interface AdStatus {
  next: { weekStart: string; label: string; closesAt: string; open: boolean; highest: number | null; minBid: number };
  live: { brand: string; text: string; url: string } | null;
}

export interface AdminBid {
  id: string;
  week_start: string;
  name: string;
  email: string;
  brand: string;
  website: string;
  ad_text: string;
  link_url: string;
  amount: number;
  created_at: string;
  verified_at: string | null;
  void_reason: string | null;
  review: 'pending' | 'approved' | 'rejected';
  payment_requested_at: string | null;
  payment_deadline: string | null;
  payment_link_url: string | null;
  paid_at: string | null;
  lapsed_at: string | null;
}

export interface AdminWeek {
  weekStart: string;
  label: string;
  phase: 'bidding' | 'closed' | 'live' | 'past';
  closesAt: string;
  winnerId: string | null;
  bids: AdminBid[];
}

export class AdsError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/ads/${path}`, init);
  } catch {
    throw new AdsError('Couldn’t connect. Check your internet connection and try again.', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AdsError(body.message ?? 'Something went wrong. Please try again.', res.status, body);
  return body as T;
}

export const fetchAdStatus = () => call<AdStatus>('status');

export const submitBid = (data: Record<string, unknown>) =>
  call<{ ok: true }>('bid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export const fetchAdminOverview = (password: string) =>
  call<{ weeks: AdminWeek[]; razorpay: boolean; now: string }>('admin/overview', { headers: { 'x-admin-password': password } });

export const adminAction = (password: string, id: string, action: 'approve' | 'reject' | 'mark_paid') =>
  call<{ ok: true }>('admin/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
    body: JSON.stringify({ id, action }),
  });
