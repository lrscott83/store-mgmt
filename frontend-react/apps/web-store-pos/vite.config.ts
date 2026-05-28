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
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
    host: 'localhost',
  },
  preview: {
    port: 3000,
    host: 'localhost',
  },
  envDir: join(__dirname, '../..'),
  envPrefix: ['VITE_', 'API_', 'SESSION_', 'NODE_', 'APP_'],
  optimizeDeps: {
    include: ['@store-mgmt/domain'],
  },
});
