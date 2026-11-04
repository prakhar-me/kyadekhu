/**
 * Prints the top 10 recommendations for a set of seeds so quality can be
 * checked by eye. Uses the same engine and TMDB cache as the app.
 *
 *   npm run test:recs                 # default seeds
 *   npm run test:recs -- "Dark" Ludo  # your own
 *   npm run test:recs -- --why        # include the score breakdown
 */
import { readFileSync } from 'node:fs';
import { recommend, resolveQuery } from '../server/recommend/engine.js';

for (const line of (() => {
  try {
    return readFileSync('.env', 'utf8').split('\n');
  } catch {
    return [];
  }
})()) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const args = process.argv.slice(2);
const showWhy = args.includes('--why');
const seeds = args.filter((a) => !a.startsWith('--'));
const DEFAULT = ['Interstellar', 'Ludo', 'Zindagi Na Milegi Dobara', 'Andhadhun', 'The Dark Knight', 'Panchayat', 'Breaking Bad', 'Sacred Games', 'Dark'];
const env = { TMDB_READ_ACCESS_TOKEN: process.env.TMDB_READ_ACCESS_TOKEN, TMDB_API_KEY: process.env.TMDB_API_KEY };

for (const q of seeds.length ? seeds : DEFAULT) {
  const started = Date.now();
  const resolved = await resolveQuery(env, q);
  if (!resolved) {
    console.log(`\n## ${q}: no match`);
    continue;
  }
  const { seed, results, debug } = await recommend(env, resolved.match.type, resolved.match.id, { debug: true });
  const same = results.filter((r) => r.type === seed.type);
  const cross = results.filter((r) => r.type !== seed.type).slice(0, 3);
  console.log(`\n## ${seed.title} (${seed.type}, ${seed.year})  ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`   keywords used: ${debug?.keywords.join(', ') || '(none)'} | pool ${debug?.pool}, scored ${debug?.scored}`);
  console.log(`   alternatives: ${resolved.alternatives.map((a) => `${a.title} (${a.type} ${a.year})`).join('; ') || '-'}`);
  same.slice(0, 10).forEach((r, i) => {
    const year = r.release_date.slice(0, 4);
    console.log(`${String(i + 1).padStart(3)}. ${r.title} (${year}, ${r.original_language}) ${r.score.toFixed(2)}  ${r.reason}`);
    if (showWhy) console.log(`       ${JSON.stringify(r.why)}`);
  });
  if (cross.length) console.log(`   other type: ${cross.map((r) => `${r.title} (${r.score.toFixed(1)})`).join('; ')}`);
}
