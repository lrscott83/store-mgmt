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
    // NARROW addition: only `scripts/**/*.test.mjs` (plain JS, build-script
    // helpers, never part of the app's client module graph or DOM-lib
    // typecheck — design.md's "Unit: build scripts: NONE" rejection was about
    // moving these files under `app/`, not about testing them at all). Used
    // to regression-test the extracted pure precache-diff comparison
    // (verify-report SUGGESTION #3, pwa-offline-shell).
    include: ['app/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
    // Type-testing: `expectTypeOf`/`assertType` contracts in `*.test-d.ts`
    // files are checked by the real TypeScript compiler (unlike the runtime
    // suite, which esbuild-transpiles and never type-checks). Without this,
    // a generic that lies about its shape (e.g. `BaseResponseModel<string>`
    // when the wire returns an `Owner`) passes `pnpm test` silently; it only
    // gets caught by a separate manual `tsc --noEmit` run outside the loop.
    typecheck: {
      enabled: true,
      include: ['app/**/*.test-d.ts'],
    },
  },
});
