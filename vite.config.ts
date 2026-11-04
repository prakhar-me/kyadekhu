import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { adsEnvFrom, handleAdsRequest } from './server/ads/router';
import { handleEnquiry, type EnquiryEnv } from './server/enquiry';
import type { AdsEnv } from './server/ads/service';
import { handleDiscover } from './server/recommend/handler';
import { handleTmdbRequest, type TmdbEnv } from './server/tmdbProxy';

// Serves /api/tmdb/* from the dev and preview servers so the TMDB key stays
// on the server, mirroring the Vercel function in /api.
function tmdbProxy(env: TmdbEnv): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.startsWith('/api/discover') && req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      handleDiscover(url.searchParams, env)
        .then((r) => {
          res.statusCode = r.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(r.body);
        })
        .catch(next);
      return;
    }
    if (!req.url?.startsWith('/api/tmdb/') || req.method !== 'GET') return next();
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.slice('/api/tmdb/'.length);
    handleTmdbRequest(path, url.searchParams, env)
      .then((result) => {
        res.statusCode = result.status;
        for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
        res.end(result.body);
      })
      .catch(next);
  };
  return {
    name: 'tmdb-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// Serves /api/ads/* (weekly ad auction), mirroring api/ads.ts on Vercel.
function adsApi(env: AdsEnv): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith('/api/ads/')) return next();
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
      if (raw.length > 20_000) req.destroy();
    });
    req.on('end', () => {
      let body: unknown = null;
      if (req.method === 'POST') {
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          res.statusCode = 400;
          return res.end('{"error":"invalid_json"}');
        }
      }
      handleAdsRequest(
        {
          method: req.method ?? 'GET',
          path: url.pathname.slice('/api/ads/'.length),
          query: url.searchParams,
          body,
          ip: req.socket.remoteAddress ?? 'unknown',
          origin: env.SITE_URL?.replace(/\/$/, '') || url.origin,
          adminPassword: (req.headers['x-admin-password'] as string | undefined) ?? undefined,
        },
        env,
      )
        .then((r) => {
          res.statusCode = r.status;
          for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
          res.end(r.body);
        })
        .catch(next);
    });
  };
  return {
    name: 'ads-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// POST /api/enquiry for the advertiser form, mirroring api/enquiry.ts.
function enquiryEndpoint(env: EnquiryEnv): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url !== '/api/enquiry') return next();
    const send = (status: number, body: string) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(body);
    };
    if (req.method !== 'POST') return send(405, '{"error":"method_not_allowed"}');
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
      if (raw.length > 20_000) req.destroy();
    });
    req.on('end', () => {
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(400, '{"error":"invalid_json"}');
      }
      handleEnquiry(body, req.socket.remoteAddress ?? 'unknown', env)
        .then((r) => send(r.status, r.body))
        .catch(next);
    });
  };
  return {
    name: 'enquiry-endpoint',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  return {
    plugins: [
      react(),
      tmdbProxy({
        TMDB_READ_ACCESS_TOKEN: env.TMDB_READ_ACCESS_TOKEN,
        TMDB_API_KEY: env.TMDB_API_KEY,
      }),
      adsApi(adsEnvFrom(env)),
      enquiryEndpoint({
        RESEND_API_KEY: env.RESEND_API_KEY,
        ENQUIRY_TO_EMAIL: env.ENQUIRY_TO_EMAIL,
        ENQUIRY_FROM_EMAIL: env.ENQUIRY_FROM_EMAIL,
      }),
    ],
  };
});
