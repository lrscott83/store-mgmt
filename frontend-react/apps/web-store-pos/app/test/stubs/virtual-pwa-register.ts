// Test-only stub for vite-plugin-pwa's `virtual:pwa-register` module.
//
// That virtual module only exists while the PWA plugin runs (real dev/build).
// Vitest has no PWA plugin, so `vitest.config.ts` aliases the specifier to this
// file to keep it resolvable at transform time. Individual tests still override
// the behaviour with `vi.doMock('virtual:pwa-register', …)`; this default is a
// harmless no-op registrar so any un-mocked import stays inert.
export const registerSW = () => () => Promise.resolve();
