import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── PWA-PRELOAD-1 (pwa-framework-parity WU-1) ────────────────────────────────
// Mirrors Angular's `PreloadingService.preloadHeavyChunks()`
// (`preloading.service.ts:15-54`): fires a fire-and-forget dynamic `import()`
// per heavy route chunk. Each target below is mocked at the exact literal
// specifier `preload-heavy-chunks.ts` uses (Vite requires literal `import()`
// arguments for code-splitting — see the util's doc comment), so this test
// also guards against silently drifting from those literal paths.

const adminDashboardLoaded = vi.fn();
const statsDashboardLoaded = vi.fn();
const reportsTodayLoaded = vi.fn();

vi.mock('../../../../admin/dashboard/routes/dashboard', () => {
  adminDashboardLoaded();
  return {};
});
vi.mock('../../../../statistics/routes/dashboard', () => {
  statsDashboardLoaded();
  return {};
});
vi.mock('../../../../reports/routes/today-report', () => {
  reportsTodayLoaded();
  return {};
});

import { preloadHeavyChunks } from '../preload-heavy-chunks';

describe('preloadHeavyChunks — PWA-PRELOAD-1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires a dynamic import for each of the 3 heavy route chunks', async () => {
    preloadHeavyChunks();
    // Let the fire-and-forget microtasks (the dynamic imports) settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(adminDashboardLoaded).toHaveBeenCalledTimes(1);
    expect(statsDashboardLoaded).toHaveBeenCalledTimes(1);
    expect(reportsTodayLoaded).toHaveBeenCalledTimes(1);
  });

  it('returns void synchronously (fire-and-forget, never returns a Promise to the caller)', () => {
    const result = preloadHeavyChunks();
    expect(result).toBeUndefined();
  });
});

describe('preloadHeavyChunks — resilience (mirrors Angular .catch(console.error))', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('swallows a rejected preload without throwing to the caller', async () => {
    vi.doMock('../../../../admin/dashboard/routes/dashboard', () => {
      throw new Error('chunk load failed');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { preloadHeavyChunks: preload } = await import('../preload-heavy-chunks');

    expect(() => preload()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    vi.doUnmock('../../../../admin/dashboard/routes/dashboard');
  });

  it('still preloads the other two chunks when one rejects', async () => {
    vi.doMock('../../../../admin/dashboard/routes/dashboard', () => {
      throw new Error('chunk load failed');
    });
    vi.doMock('../../../../statistics/routes/dashboard', () => {
      statsDashboardLoaded();
      return {};
    });
    vi.doMock('../../../../reports/routes/today-report', () => {
      reportsTodayLoaded();
      return {};
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { preloadHeavyChunks: preload } = await import('../preload-heavy-chunks');
    preload();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statsDashboardLoaded).toHaveBeenCalledTimes(1);
    expect(reportsTodayLoaded).toHaveBeenCalledTimes(1);

    vi.doUnmock('../../../../admin/dashboard/routes/dashboard');
    vi.doUnmock('../../../../statistics/routes/dashboard');
    vi.doUnmock('../../../../reports/routes/today-report');
  });
});
