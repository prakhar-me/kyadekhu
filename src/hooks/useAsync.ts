import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'idle' | 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

/** Runs `fn` whenever `deps` change; ignores results from stale runs. */
export function useAsync<T>(fn: () => Promise<T> | null, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });
  const run = useRef(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const id = ++run.current;
    const promise = fn();
    if (!promise) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    promise.then(
      (data) => id === run.current && setState({ status: 'success', data }),
      (error: Error) => id === run.current && setState({ status: 'error', error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, retry };
}

export function useDebounce<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
