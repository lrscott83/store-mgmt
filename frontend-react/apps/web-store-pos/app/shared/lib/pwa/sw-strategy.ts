// Pure fetch-routing decision for the service worker (pwa-offline-shell
// spec). Deliberately has no dependency on `caches`/`self` so it can be
// covered by plain Vitest (design.md D5) — `app/service-worker.ts` only
// executes the verdict this returns.
export type FetchStrategy = 'shell' | 'cache-first' | 'passthrough';

export interface StrategyInput {
  readonly url: URL;
  readonly method: string;
  readonly mode: string;
  readonly selfOrigin: string;
}

const API_PREFIX = '/api';

export const SHELL_URL = '/index.html';
export const LANDING_URL = '/landing.html';

/**
 * Which precached HTML answers a navigation. The landing (`/`) is served from
 * the head-injected `landing.html` so its SEO metadata survives once the
 * service worker controls the page; every other route keeps the plain SPA
 * shell. Pure, so the decision is testable without a service-worker runtime.
 */
export function shellUrlFor(pathname: string): string {
  return pathname === '/' ? LANDING_URL : SHELL_URL;
}

function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}

/**
 * Order matters and mirrors the pwa-offline-shell spec exactly:
 * non-GET → cross-origin → /api (exact or prefix) → navigate → cache-first.
 */
export function resolveStrategy(input: StrategyInput): FetchStrategy {
  const { url, method, mode, selfOrigin } = input;

  if (method !== 'GET') {
    return 'passthrough';
  }

  if (url.origin !== selfOrigin) {
    return 'passthrough';
  }

  if (isApiPath(url.pathname)) {
    return 'passthrough';
  }

  if (mode === 'navigate') {
    return 'shell';
  }

  return 'cache-first';
}
