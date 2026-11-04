import { Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync, useDebounce } from '../hooks/useAsync';
import { MOODS, parseFacets } from '../lib/discovery';
import { imageUrl, yearOf } from '../lib/format';
import { searchMulti } from '../lib/tmdb';
import { TypeBadge } from './MovieCard';

interface Props {
  variant?: 'hero' | 'compact';
  initialValue?: string;
  autoFocus?: boolean;
}

type Suggestion =
  | { kind: 'query'; label: string; hint: string }
  | { kind: 'title'; type: 'movie' | 'tv'; id: number; label: string; year: string; poster: string | null };

const GENRE_WORDS = ['Comedy', 'Thriller', 'Romance', 'Sci-Fi', 'Drama', 'Horror', 'Action', 'Crime', 'Mystery', 'Animation'];

export function SearchBar({ variant = 'hero', initialValue = '', autoFocus }: Props) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const query = value.trim();
  const debounced = useDebounce(query, 280);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const movies = useAsync(
    () => (debounced.length >= 2 && !parseFacets(debounced) ? searchMulti(debounced) : null),
    [debounced],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    const words: Suggestion[] = [
      ...Object.values(MOODS)
        .filter((m) => m.label.startsWith(q) || m.label.replace('-', ' ').startsWith(q))
        .map((m) => ({ kind: 'query' as const, label: m.label[0].toUpperCase() + m.label.slice(1), hint: 'Mood' })),
      ...GENRE_WORDS.filter((g) => g.toLowerCase().startsWith(q)).map((g) => ({ kind: 'query' as const, label: g, hint: 'Genre' })),
    ].slice(0, 2);
    const titles: Suggestion[] =
      movies.status === 'success' && debounced === query
        ? movies.data.results
            .filter((m) => m.media_type === 'movie' || m.media_type === 'tv')
            .slice(0, 6)
            .map((m) => ({
              kind: 'title' as const,
              type: m.media_type as 'movie' | 'tv',
              id: m.id,
              label: (m.title ?? m.name) as string,
              year: yearOf(m.release_date ?? m.first_air_date),
              poster: m.poster_path,
            }))
        : [];
    return [...words, ...titles];
  }, [query, debounced, movies.status, movies.data]);

  const showList = open && suggestions.length > 0;

  function go(s?: Suggestion) {
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    if (s?.kind === 'title') {
      setValue(s.label);
      navigate(`/search?${s.type}=${s.id}&q=${encodeURIComponent(s.label)}`);
    } else {
      const q = s ? s.label : query;
      if (!q) return;
      setValue(q);
      navigate(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(active >= 0 ? suggestions[active] : undefined);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  const hero = variant === 'hero';

  return (
    <form role="search" onSubmit={onSubmit} className="relative w-full">
      <div
        className={`flex items-center gap-3 rounded-full border border-line bg-surface transition-colors duration-300 focus-within:border-white/40 hover:border-white/20 ${
          hero ? 'h-16 pl-6 pr-2 sm:h-[4.5rem] sm:pl-7' : 'h-12 pl-5 pr-1.5'
        }`}
      >
        <Search size={hero ? 22 : 17} className="shrink-0 text-muted" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Name the last movie you loved, or a genre or mood"
          placeholder="Name the last movie you loved…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className={`min-w-0 flex-1 bg-transparent text-ink placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden ${
            hero ? 'text-[1.05rem] font-medium tracking-[-0.03em] sm:text-[1.5rem]' : 'text-base'
          }`}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-3xl border border-line bg-surface p-1.5 shadow-2xl shadow-black/60"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.kind === 'title' ? `${s.type}-${s.id}` : `q-${s.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(s)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 ${i === active ? 'bg-raised' : ''}`}
            >
              {s.kind === 'title' ? (
                <>
                  <span className="h-12 w-8 shrink-0 overflow-hidden rounded-md bg-raised">
                    {s.poster && <img src={imageUrl(s.poster, 'w92')} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <TypeBadge type={s.type} />
                  <span className="w-9 text-right font-mono text-xs text-faint">{s.year}</span>
                </>
              ) : (
                <>
                  <span className="flex-1">{s.label}</span>
                  <span className="text-sm text-faint">{s.hint}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
