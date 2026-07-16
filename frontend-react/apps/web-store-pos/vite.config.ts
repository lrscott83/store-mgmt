import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';
import { join } from 'path';

export default defineConfig({
  plugins: [
    tailwindcss(),
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
        globDirectory: 'build/client',
        globPatterns: [
          '**/*.{js,css,html,woff2}',
          'icons/*.png',
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
    port: 3333,
    host: 'localhost',
  },
  preview: {
    port: 3333,
    host: 'localhost',
  },
  envDir: join(__dirname, '../..'),
  envPrefix: ['VITE_', 'API_', 'SESSION_', 'NODE_', 'APP_'],
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
});
