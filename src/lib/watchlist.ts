import { useCallback, useSyncExternalStore } from 'react';
import type { CardItem, MediaType } from './types';

export type SavedMovie = Required<Pick<CardItem, 'id' | 'title' | 'poster_path' | 'release_date' | 'vote_average' | 'overview' | 'original_language'>> & {
  type: MediaType;
  genre_ids?: number[];
  savedAt: number;
};

const KEY = 'kd:watchlist:v1';
const listeners = new Set<() => void>();
let items: SavedMovie[] = load();

function load(): SavedMovie[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Entries saved before series existed have no type: they're movies.
    return Array.isArray(parsed) ? parsed.map((m) => ({ ...m, type: m.type === 'tv' ? 'tv' : 'movie' })) : [];
  } catch {
    return [];
  }
}

function commit(next: SavedMovie[]) {
  items = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — keep in memory for this visit */
  }
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      items = load();
      listeners.forEach((l) => l());
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type Saveable = Omit<CardItem, 'type'> & { type: MediaType; genres?: { id: number }[] };
const same = (m: { type: MediaType; id: number }, type: MediaType, id: number) => m.type === type && m.id === id;

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, () => items);

  const has = useCallback((type: MediaType, id: number) => list.some((m) => same(m, type, id)), [list]);

  const toggle = useCallback((movie: Saveable) => {
    if (items.some((m) => same(m, movie.type, movie.id))) {
      commit(items.filter((m) => !same(m, movie.type, movie.id)));
      return false;
    }
    const saved: SavedMovie = {
      type: movie.type,
      id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      release_date: movie.release_date ?? '',
      vote_average: movie.vote_average,
      overview: movie.overview,
      original_language: movie.original_language,
      genre_ids: movie.genre_ids ?? movie.genres?.map((g) => g.id),
      savedAt: Date.now(),
    };
    commit([saved, ...items]);
    return true;
  }, []);

  const remove = useCallback((type: MediaType, id: number) => commit(items.filter((m) => !same(m, type, id))), []);

  return { list, has, toggle, remove };
}
