import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // vite-plugin-pwa's `virtual:pwa-register` only exists when the PWA plugin
      // runs; Vitest doesn't load it, so alias the specifier to a resolvable
      // stub. Tests still override behaviour via `vi.doMock('virtual:pwa-register')`.
      'virtual:pwa-register': resolve(__dirname, './app/test/stubs/virtual-pwa-register.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['app/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
});
