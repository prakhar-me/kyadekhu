# Kya Dekhu

Find your next favourite movie. Search a film you loved, a genre or a mood, and get
recommendations, trailers, reviews and where to watch it in India.

## Setup

```bash
npm install
cp .env.example .env      # add TMDB_READ_ACCESS_TOKEN (or TMDB_API_KEY)
npm run dev
```

Get credentials at https://www.themoviedb.org/settings/api.

## How it works

- **The key never reaches the browser.** The client calls `/api/tmdb/*`, and
  [server/tmdbProxy.ts](server/tmdbProxy.ts) adds credentials, allows only the endpoints
  the app needs, and caches responses for 6 hours. In dev and `vite preview` the proxy runs as
  Vite middleware. In production it runs as the Vercel function [api/tmdb.ts](api/tmdb.ts).
  On other hosts, mount `handleTmdbRequest` in any Node handler.
- **Search** uses TMDB multi-search (movies and series).
  - Queries made only of genre, mood or language words ("feel-good", "hindi thriller") browse TMDB Discover
    in the browser ([src/lib/discovery.ts](src/lib/discovery.ts)).
  - A title query goes to `GET /api/discover`. The server runs
    [server/recommend/engine.ts](server/recommend/engine.ts) in two steps:
    1. **Candidates:** TMDB recommendations (pages 1–2), /similar, other work by the director, writer or
       creator, /discover on the seed's specific keywords (up to three queries), the collection (max 2),
       same-language titles for non-English seeds, and a smaller pool of the other type.
    2. **Scoring:** every candidate's details, keywords and credits are fetched in one call each and
       scored. The weights are the `W` object at the top of the engine. Keyword overlap is IDF-weighted
       using TMDB keyword frequencies, and ratings are vote-adjusted. A diversity pass then spreads out
       directors and franchises. Documentaries, shorts, concert films, unreleased and low-vote titles
       are filtered out first.
  - Check quality with `npm run test:recs` (add `-- --why` for score breakdowns, or pass your own seeds).
- **Caching:** TMDB responses are cached for 24 hours in memory, and also under `data/tmdb-cache`
  locally. Finished recommendation lists are cached for 6 hours.
- **Where to watch** uses TMDB watch providers for region `IN` (data from JustWatch). TMDB
  doesn't provide per-title deep links. Each platform tile opens the platform's official site,
  and the TMDB watch page link has verified per-title links. If nothing is listed, the app says
  so and doesn't guess.
- **Watchlist** is stored in `localStorage`. There are no accounts.

## Deploy (Vercel)

Import the repo, set `TMDB_READ_ACCESS_TOKEN` in Project Settings → Environment Variables, and
deploy. `vercel.json` routes the API and the SPA fallback.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability
data is from JustWatch.
