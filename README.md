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
- **Search** ([src/lib/discovery.ts](src/lib/discovery.ts)):
  - Queries made only of genre, mood or language words ("feel-good", "hindi thriller",
    "sci-fi") browse TMDB Discover.
  - Any other query finds the best title match. Its results blend TMDB recommendations,
    similar titles, the same director, the two lead actors and shared keywords. They are then
    re-ranked by genre overlap, language and rating. Each card says why it's there.
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
