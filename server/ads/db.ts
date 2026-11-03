/**
 * Minimal Postgres access. Uses Neon's HTTP driver when DATABASE_URL is set
 * (production), otherwise an embedded PGlite database in ./data for local
 * development.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface DbEnv {
  DATABASE_URL?: string;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bids (
    id TEXT PRIMARY KEY,
    week_start TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    brand TEXT NOT NULL,
    website TEXT NOT NULL,
    ad_text TEXT NOT NULL,
    link_url TEXT NOT NULL,
    amount INTEGER NOT NULL,
    ip_hash TEXT,
    token_hash TEXT,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at TIMESTAMPTZ,
    void_reason TEXT,
    review TEXT NOT NULL DEFAULT 'pending',
    payment_requested_at TIMESTAMPTZ,
    payment_deadline TIMESTAMPTZ,
    payment_link_id TEXT,
    payment_link_url TEXT,
    paid_at TIMESTAMPTZ,
    lapsed_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS bids_week_amount_idx ON bids (week_start, amount DESC)`,
  `CREATE INDEX IF NOT EXISTS bids_email_created_idx ON bids (email, created_at)`,
  `CREATE INDEX IF NOT EXISTS bids_token_idx ON bids (token_hash)`,
];

let ready: Promise<Db> | null = null;

export class DbNotConfiguredError extends Error {}

export function getDb(env: DbEnv): Promise<Db> {
  ready ??= connect(env).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

async function connect(env: DbEnv): Promise<Db> {
  let db: Db;
  const url = env.DATABASE_URL?.trim();
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    db = { query: (text, params = []) => sql(text, params) as never };
  } else if (process.env.VERCEL) {
    throw new DbNotConfiguredError('DATABASE_URL is not set.');
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    await mkdir(join(process.cwd(), 'data'), { recursive: true });
    const lite = new PGlite(join(process.cwd(), 'data', 'pglite'));
    db = { query: async (text, params = []) => (await lite.query(text, params)).rows as never };
  }
  for (const statement of SCHEMA) await db.query(statement);
  return db;
}

/** Bids that can still win: confirmed, not voided, rejected or lapsed. */
export const ELIGIBLE = `verified_at IS NOT NULL AND void_reason IS NULL AND review <> 'rejected' AND lapsed_at IS NULL`;
