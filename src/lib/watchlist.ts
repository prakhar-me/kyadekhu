import { useCallback, useSyncExternalStore } from 'react';
import type { MovieSummary } from './types';

export type SavedMovie = Pick<
  MovieSummary,
  'id' | 'title' | 'poster_path' | 'release_date' | 'vote_average' | 'overview' | 'original_language'
> & { genre_ids?: number[]; savedAt: number };

const KEY = 'kd:watchlist:v1';
const listeners = new Set<() => void>();
let items: SavedMovie[] = load();

function load(): SavedMovie[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
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

type Saveable = Pick<MovieSummary, 'id' | 'title' | 'poster_path' | 'release_date' | 'vote_average' | 'overview' | 'original_language'> & {
  genre_ids?: number[];
  genres?: { id: number }[];
};

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, () => items);

  const has = useCallback((id: number) => list.some((m) => m.id === id), [list]);

  const toggle = useCallback((movie: Saveable) => {
    if (items.some((m) => m.id === movie.id)) {
      commit(items.filter((m) => m.id !== movie.id));
      return false;
    }
    const saved: SavedMovie = {
      id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
      overview: movie.overview,
      original_language: movie.original_language,
      genre_ids: movie.genre_ids ?? movie.genres?.map((g) => g.id),
      savedAt: Date.now(),
    };
    commit([saved, ...items]);
    return true;
  }, []);

  const remove = useCallback((id: number) => commit(items.filter((m) => m.id !== id)), []);

  return { list, has, toggle, remove };
}
