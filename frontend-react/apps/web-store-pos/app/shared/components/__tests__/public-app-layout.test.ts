import { describe, it, expect } from 'vitest';

// route-guard-parity: public-app-layout re-exports AppLayout's chrome (default
// export) WITHOUT its `clientLoader` (== authLoader). This is what makes
// `help/tutorial` reachable without authentication when nested under this
// layout in routes.ts (React Router 7 always runs a layout route's own
// clientLoader before rendering its children, so the child route's own
// absence of a loader is not enough — the wrapping layout module must not
// export one either).
//
// `timeout: 60_000`: importar `public-app-layout` arrastra todo el grafo de
// AppLayout (~2 s en aislado). Bajo la carga paralela de la suite completa
// superaba los 15 s anteriores y hacía flaky el test; el import es inherente a
// lo que se comprueba, así que lo que se amplía es el presupuesto de tiempo.
describe('public-app-layout', { timeout: 60_000 }, () => {
  it('does not export a clientLoader — proves the layout is NOT auth-gated', async () => {
    const mod = await import('../public-app-layout');
    expect((mod as Record<string, unknown>).clientLoader).toBeUndefined();
  });

  it('exports a default component — chrome still renders', async () => {
    const mod = await import('../public-app-layout');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});
