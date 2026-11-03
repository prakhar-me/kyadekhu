import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleEnquiry, type EnquiryEnv } from './server/enquiry';
import { handleTmdbRequest, type TmdbEnv } from './server/tmdbProxy';

// Serves /api/tmdb/* from the dev and preview servers so the TMDB key stays
// on the server, mirroring the Vercel function in /api.
function tmdbProxy(env: TmdbEnv): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
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
  const env = loadEnv(mode, process.cwd(), ['TMDB_', 'RESEND_', 'ENQUIRY_']);
  const pick = (k: string) => env[k] ?? process.env[k];
  return {
    plugins: [
      react(),
      tmdbProxy({
        TMDB_READ_ACCESS_TOKEN: env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_READ_ACCESS_TOKEN,
        TMDB_API_KEY: env.TMDB_API_KEY ?? process.env.TMDB_API_KEY,
      }),
      enquiryEndpoint({
        RESEND_API_KEY: pick('RESEND_API_KEY'),
        ENQUIRY_TO_EMAIL: pick('ENQUIRY_TO_EMAIL'),
        ENQUIRY_FROM_EMAIL: pick('ENQUIRY_FROM_EMAIL'),
      }),
    ],
  };
});
