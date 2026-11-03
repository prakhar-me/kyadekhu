// Shared by the advertise page, the admin page and the server-side validator.
export const MIN_BID = 500;
export const BID_INCREMENT = 100;
export const MAX_BID = 1_000_000;
export const AD_TEXT_MAX = 90;
export const BRAND_MAX = 60;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export const minNextBid = (highest: number | null) => (highest ? highest + BID_INCREMENT : MIN_BID);

export const formatINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;
