const IMG_BASE = 'https://image.tmdb.org/t/p';

export type PosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780';
export type BackdropSize = 'w300' | 'w780' | 'w1280';

export function imageUrl(path: string | null | undefined, size: PosterSize | BackdropSize | 'original') {
  return path ? `${IMG_BASE}/${size}${path}` : undefined;
}

export function posterSrcSet(path: string | null | undefined) {
  if (!path) return undefined;
  return (['w185', 'w342', 'w500'] as const).map((s) => `${IMG_BASE}/${s}${path} ${s.slice(1)}w`).join(', ');
}

export function backdropSrcSet(path: string | null | undefined) {
  if (!path) return undefined;
  return (['w780', 'w1280'] as const).map((s) => `${IMG_BASE}/${s}${path} ${s.slice(1)}w`).join(', ');
}

export const yearOf = (date?: string) => (date ? date.slice(0, 4) : '');

export function formatRuntime(minutes: number | null) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export const formatRating = (v: number) => (v ? v.toFixed(1) : '–');

const languageNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch {
    return null;
  }
})();

export function languageName(code: string) {
  if (!code || code === 'xx') return 'No language';
  try {
    return languageNames?.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
