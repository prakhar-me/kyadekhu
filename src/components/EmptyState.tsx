import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, children, action }: Props) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h2 className="display text-3xl">{title}</h2>
      {children && <div className="mt-3 text-muted">{children}</div>}
      {action && <div className="mt-8 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

/** Error state with guidance; recognises the missing-credentials case. */
export function ErrorState({ error, onRetry }: { error: Error & { code?: string }; onRetry?: () => void }) {
  const setup = error.code === 'missing_credentials';
  return (
    <EmptyState
      title={setup ? 'TMDB is not connected yet' : 'Movies didn’t load'}
      action={
        onRetry && (
          <button type="button" className="btn-ghost" onClick={onRetry}>
            Try again
          </button>
        )
      }
    >
      {setup ? (
        <p>
          Add <code className="text-ink">TMDB_READ_ACCESS_TOKEN</code> to a <code className="text-ink">.env</code> file and
          restart the server. See <code className="text-ink">.env.example</code>.
        </p>
      ) : (
        <p>{error.message}</p>
      )}
    </EmptyState>
  );
}

/** Route-level fallback so a crash shows a way back instead of a stack trace. */
export function CrashState() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <EmptyState
        title="Something broke on this page"
        action={
          <>
            <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>
              Reload
            </button>
            <Link to="/" reloadDocument className="btn-primary">
              Go to home
            </Link>
          </>
        }
      >
        Reload to try again, or start a new search from the homepage.
      </EmptyState>
    </div>
  );
}
