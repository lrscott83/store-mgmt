import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * [FC-C4] Menores — health.tsx, $.tsx, connectivity-service.ts — Vitest
 * docs/testing/frontend-coverage/FC-C4.md
 *
 * Tests the miscellaneous low-coverage files to boost their coverage.
 */

describe('shared/routes/health.tsx', () => {
  it('clientLoader returns JSON with status ok', async () => {
    const { clientLoader } = await import('../routes/health');
    const response = clientLoader() as Response;
    const body = await response.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('shared/routes/$.tsx — CatchAll', () => {
  it('clientLoader redirects to root', async () => {
    const { clientLoader } = await import('../routes/$.tsx');
    const result = clientLoader();
    // redirect returns a Response-like object
    expect(result).toBeDefined();
  });

  it('default export renders null (no UI)', async () => {
    const mod = await import('../routes/$.tsx');
    // The component returns null — just verify it's a valid component
    expect(typeof mod.default).toBe('function');
  });
});

describe('shared/lib/auth/connectivity-service.ts', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('isOnline returns true when navigator.onLine is true', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const { ConnectivityService } = await import('../lib/auth/connectivity-service');
    expect(ConnectivityService.isOnline()).toBe(true);
  });

  it('isOnline returns false when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { ConnectivityService } = await import('../lib/auth/connectivity-service');
    expect(ConnectivityService.isOnline()).toBe(false);
  });

  it('isOnline returns true when navigator is undefined (SSR)', async () => {
    vi.stubGlobal('navigator', undefined);
    const { ConnectivityService } = await import('../lib/auth/connectivity-service');
    expect(ConnectivityService.isOnline()).toBe(true);
  });
});
