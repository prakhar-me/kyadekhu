/**
 * Week maths in India Standard Time (UTC+5:30, no daylight saving).
 * A week is keyed by its Monday as 'YYYY-MM-DD'. It runs Monday 00:00 to
 * Sunday 23:59 IST; bidding for it closes the Sunday before at 20:00 IST.
 */
const IST_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const keyOf = (utcMidnight: number) => new Date(utcMidnight).toISOString().slice(0, 10);

export function weekKey(now: Date): string {
  const ist = new Date(now.getTime() + IST_MS);
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7;
  return keyOf(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysSinceMonday));
}

export const addWeeks = (key: string, n: number) => keyOf(Date.parse(`${key}T00:00:00Z`) + n * 7 * DAY_MS);

/** Monday 00:00 IST of the week, as an instant. */
export const weekStartsAt = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - IST_MS);

/** The following Monday 00:00 IST. */
export const weekEndsAt = (key: string) => new Date(weekStartsAt(key).getTime() + 7 * DAY_MS);

/** Sunday 20:00 IST before the week starts. */
export const biddingClosesAt = (key: string) => new Date(weekStartsAt(key).getTime() - 4 * 60 * 60 * 1000);

/** The week currently open for bids (always next week). */
export const biddingWeek = (now: Date) => addWeeks(weekKey(now), 1);

export const isBiddingOpen = (key: string, now: Date) => now < biddingClosesAt(key) && key === biddingWeek(now);
