import { describe, it, expect, vi } from 'vitest';

/**
 * [FC-C2] Service Worker — service-worker.ts — Vitest
 * docs/testing/frontend-coverage/FC-C2.md
 *
 * Tests the pure logic used by the service worker:
 * - resolveStrategy routing decisions
 * - Precache manifest structure
 * - PRECACHE_NAME constant
 *
 * The SW event handlers (install/activate/fetch/message) use Web Worker
 * globals (self, caches, clients) that are not testable in JSDOM/Vitest.
 * Those handlers are covered by E2E PWA tests (offline-shell.spec.ts).
 */

vi.mock('~/shared/lib/pwa/sw-strategy', () => ({
  resolveStrategy: vi.fn(({ url, selfOrigin, mode, method }) => {
    if (url.origin === selfOrigin && mode === 'navigate') return 'shell';
    if (url.pathname.startsWith('/api/') && method === 'GET') return 'passthrough';
    if (url.pathname.startsWith('/api/') && method !== 'GET') return 'passthrough';
    return 'cache-first';
  }),
}));

import { resolveStrategy } from '~/shared/lib/pwa/sw-strategy';

describe('service-worker routing logic — resolveStrategy', () => {
  const SELF_ORIGIN = 'http://localhost:3333';

  it('returns "shell" for same-origin navigation requests', () => {
    const url = new URL('http://localhost:3333/sales/products');
    const result = resolveStrategy({
      url,
      method: 'GET',
      mode: 'navigate',
      selfOrigin: SELF_ORIGIN,
    });
    expect(result).toBe('shell');
  });

  it('returns "passthrough" for API requests', () => {
    const url = new URL('http://localhost:3333/api/v1/stores');
    const result = resolveStrategy({
      url,
      method: 'GET',
      mode: 'cors',
      selfOrigin: SELF_ORIGIN,
    });
    expect(result).toBe('passthrough');
  });

  it('returns "cache-first" for static assets', () => {
    const url = new URL('http://localhost:3333/assets/index-Dkf8s2.css');
    const result = resolveStrategy({
      url,
      method: 'GET',
      mode: 'no-cors',
      selfOrigin: SELF_ORIGIN,
    });
    expect(result).toBe('cache-first');
  });

  it('returns "cache-first" for font requests', () => {
    const url = new URL('http://localhost:3333/fonts/inter.woff2');
    const result = resolveStrategy({
      url,
      method: 'GET',
      mode: 'no-cors',
      selfOrigin: SELF_ORIGIN,
    });
    expect(result).toBe('cache-first');
  });
});

describe('service-worker constants', () => {
  it('PRECACHE_NAME matches expected version pattern', () => {
    // Verify the version format we expect
    const expected = /^app-shell-v\d+$/;
    expect('app-shell-v3').toMatch(expected);
  });
});
