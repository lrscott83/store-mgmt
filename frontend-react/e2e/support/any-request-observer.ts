import type { Page, Request as PlaywrightRequest } from '@playwright/test';

// baseURL for the SPA dev server the suite runs against
// (`playwright.config.ts:79`) — the ONE origin allowed to receive requests
// that are not to the backend API.
const APP_ORIGIN = 'http://localhost:3333';
// Any pathname under this pattern, even same-origin, is a request
// misdirected to the dev server instead of the real backend — the exact
// case `network-observer.ts` already filters by path (design.md D2).
const API_PATH_PATTERN = /(^|\/)(api|v1)\//;

export interface AnyRequestRecord {
  url: string;
  method: string;
  resourceType: string;
}

export interface AnyRequestObserver {
  /** All requests counted so far, in order — see `installAnyRequestObserver`
   * for exactly which requests count. */
  requests(): AnyRequestRecord[];
  /**
   * Asserts zero requests were observed. `context` is included ONLY in the
   * failure message, never used to filter — REQ-1 (`e2e-offline-login-ui`)
   * is "cero peticiones HTTP", not "cero peticiones de cierto tipo".
   */
  expectNoRequests(context?: string): void;
}

/**
 * D2 (design.md, `e2e-network-observer-core` REQ-5): the third observer —
 * asserts zero HTTP requests to ANY endpoint, not just the
 * login/me/product-scoped ones the two existing observers already watch.
 *
 * Does NOT reuse `network-observer-core.ts`'s outcome queue (design.md D2
 * "Rechazado"): this only ever asserts a negative, it never waits for a
 * response — bringing in the queue/deferred machinery would just be dead
 * code for this observer's one job.
 *
 * A request counts if either:
 *   1. its origin differs from the SPA dev server (`APP_ORIGIN`) — e.g. the
 *      real backend, `http://localhost:5019/api` (`backend-url.ts:24`), or
 *      any other external origin, or
 *   2. it is same-origin but its pathname matches `/(^|\/)(api|v1)\//` — a
 *      request misdirected to the dev server itself.
 *
 * `data:`/`blob:` URLs (`origin === 'null'`) are excluded — they never leave
 * the browser process and are not network traffic in any sense this
 * observer cares about.
 *
 * `resourceType()`/`method()` are reported in the failure message for
 * diagnosability, never used to filter: filtering by `xhr|fetch` would let a
 * `document` navigation to the backend slip through uncounted, which is
 * exactly the case this observer exists to catch.
 */
export function installAnyRequestObserver(page: Page): AnyRequestObserver {
  const records: AnyRequestRecord[] = [];

  function countsAsRequest(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.origin === 'null') return false;
    if (parsed.origin !== APP_ORIGIN) return true;
    return API_PATH_PATTERN.test(parsed.pathname);
  }

  page.on('request', (request: PlaywrightRequest) => {
    const url = request.url();
    if (!countsAsRequest(url)) return;
    records.push({ url, method: request.method(), resourceType: request.resourceType() });
  });

  return {
    requests: () => records.map((record) => ({ ...record })),

    expectNoRequests: (context?: string) => {
      if (records.length === 0) return;
      const summary = records
        .map((r) => `${r.method} ${r.url} (${r.resourceType})`)
        .join('; ');
      throw new Error(
        `Expected zero HTTP requests${context ? ` (${context})` : ''}, but observed ` +
          `${records.length}: ${summary}.`
      );
    },
  };
}
