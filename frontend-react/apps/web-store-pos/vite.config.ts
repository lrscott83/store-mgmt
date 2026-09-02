import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';
import { join } from 'path';
// `.mjs` single source of truth for every CSP directive (design.md D1/D2) —
// `csp-policy.d.mts` is the sibling declaration `tsc` resolves under
// `moduleResolution: "bundler"` (tsconfig.json:16), proven by this file's own
// `typecheck` gate (design.md D2's mandatory WU2 acceptance check).
import { buildCspHeaderValue, CSP_HEADER_NAME } from './scripts/csp-policy.mjs';

const ENV_DIR = join(__dirname, '../..');
const ENV_PREFIXES = ['VITE_', 'API_', 'SESSION_', 'NODE_', 'APP_'];
const DEV_SERVER_HOST = 'localhost';
const DEV_SERVER_PORT = 3333;

export default defineConfig(({ mode }) => {
  // Same envDir/envPrefix the app itself uses (below), so this sees exactly
  // what `import.meta.env['API_URL']` gives `api-client.ts:21` — including
  // Playwright's injected `API_URL` (`playwright.config.ts:111`), design.md D4.
  const env = loadEnv(mode, ENV_DIR, ENV_PREFIXES);
  const csp = buildCspHeaderValue('dev', {
    apiUrl: env['API_URL'],
    devServerOrigin: `http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}`,
  });

  return {
    plugins: [
      tailwindcss(),
      // Sets the dev CSP header directly via a `configureServer` middleware,
      // NOT via Vite's `server.headers` config option below (kept only for
      // documentation/discoverability, see the comment on `server.headers`).
      // Empirically verified in THIS repo (curl against the running dev
      // server, no Playwright involved): `@react-router/dev`'s vite plugin —
      // running in SPA mode (`react-router.config.ts` `ssr: false`) — installs
      // its request handler as a `configureServer` POST-hook (the function
      // RETURNED from `configureServer`, `@react-router/dev/dist/vite.js`
      // "return () => { ... viteDevServer.middlewares.use(...) }"), which Vite
      // runs AFTER its own internal middlewares — including
      // `indexHtmlMiddleware`, the ONLY internal middleware that applies
      // `config.server.headers`, and only for requests whose URL literally
      // ends in `.html`. A document navigation to `/`, `/login`, etc. never
      // matches that suffix, falls through every internal middleware, and is
      // answered directly by react-router's handler via
      // `sendResponse(nodeRes, response)` — a plain `Response`→Node bridge
      // that carries no CSP header of its own. `server.headers` is therefore
      // silently a no-op for every real page load in this project's dev
      // server, contradicting design.md D4's snippet. The fix: register OUR
      // OWN middleware in a plugin's `configureServer(server)` hook WITHOUT
      // returning a closure — that runs synchronously, in plugin order,
      // strictly BEFORE every internal middleware and BEFORE react-router's
      // deferred post-hook handler. It sets the header via `res.setHeader`
      // and calls `next()`; Node's `res.writeHead(status, headers)` (used by
      // `sendResponse`) MERGES with headers already set via `setHeader`
      // rather than clearing them, so the header survives intact.
      {
        name: 'csp-report-only-dev-header',
        configureServer(server) {
          server.middlewares.use((_req, res, next) => {
            res.setHeader(CSP_HEADER_NAME, csp);
            next();
          });
        },
      },
      reactRouter(),
      tsconfigPaths(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'app',
        filename: 'service-worker.ts',
        registerType: 'prompt',
        injectRegister: false,
        manifest: false, // We use our own public/manifest.webmanifest
        injectManifest: {
          // NOT authoritative. The real precache manifest is injected by
          // scripts/build-sw.mjs (via workbox-build's injectManifest) as a
          // dedicated post-build step, reading patterns from
          // scripts/precache-patterns.mjs — the single source of truth shared
          // with scripts/verify-sw-precache.mjs. This plugin's own
          // `closeBundle` injection runs too early (before react-router build
          // has finished writing build/client/index.html and the hashed
          // route-manifest chunk), so it must never be relied on to produce a
          // complete manifest. Left empty rather than removed because
          // vite-plugin-pwa still resolves `virtual:pwa-register` and serves
          // the worker in dev (design.md D10).
          globPatterns: [],
        },
        devOptions: {
          // Serve the service worker in `pnpm dev` too, so the PWA install flow
          // (beforeinstallprompt → InstallAppButton) can be exercised locally.
          enabled: true,
          // REQUIRED: without an explicit type, vite-plugin-pwa's dev register
          // template interpolates the string "undefined" into
          // `new Workbox(url, { type: "undefined" })`, an invalid WorkerType that
          // makes the browser reject registration (empty SW panel → no
          // beforeinstallprompt → install button stuck disabled). service-worker.ts
          // is a classic worker (no ES imports), so 'classic' is correct.
          type: 'classic',
          // Caveat: a live SW in dev can serve cached responses — unregister it in
          // DevTools > Application if HMR ever misbehaves.
        },
      }),
    ],
    server: {
      port: DEV_SERVER_PORT,
      host: DEV_SERVER_HOST,
      // NOT `headers: { [CSP_HEADER_NAME]: csp }` here — see the
      // `csp-report-only-dev-header` plugin above for why that option is a
      // no-op for actual page loads in this dev harness.
    },
    preview: {
      // MUST differ from `server.port`. A service worker's scope is its origin,
      // so sharing a port makes `vite preview` and `pnpm dev` share one SW
      // registration: the worker installed by a production preview survives and
      // keeps controlling dev tabs, serving cached responses over HMR (observed
      // as a blank screen in `pnpm dev`). `devOptions.enabled: true` above means
      // dev registers a real worker too, so the collision goes both ways.
      port: 4173,
      host: 'localhost',
    },
    envDir: ENV_DIR,
    envPrefix: ENV_PREFIXES,
    resolve: {
      // Force a single copy of React and React Router. web-common declares its
      // own react/react-dom/react-router deps; without dedupe pnpm resolves them
      // as separate instances, producing "Cannot read properties of null
      // (reading 'useContext')" during client render.
      dedupe: ['react', 'react-dom', 'react-router'],
    },
    optimizeDeps: {
      include: ['@store-mgmt/domain'],
    },
  };
});
