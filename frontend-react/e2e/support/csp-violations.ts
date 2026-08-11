import type { Page } from '@playwright/test';

/**
 * `content-security-policy` spec — "No Violations on Real Routes". Observer
 * for the zero-violation sweep (design.md §4.4.3), matching the existing
 * `e2e/support/*-observer.ts` convention (`store-network-observer.ts`,
 * `any-request-observer.ts`).
 *
 * Node-side (not `window.__cspViolations`, unlike the discrimination probe in
 * `pwa-install-capture.spec.ts`): a `securitypolicyviolation` listener
 * installed via `addInitScript` fires per-document, and a document-scoped
 * global would reset on every navigation — the sweep needs to isolate one
 * route's violations from the next, but the *observer* itself must survive
 * across `page.goto()` calls the way `page.on('request', ...)` does in
 * `store-network-observer.ts`. `page.exposeFunction` bridges the in-page
 * event to this Node-side array once per page, and `addInitScript` re-applies
 * the listener on every subsequent document automatically.
 */

export interface CspViolationRecord {
  documentURI: string;
  effectiveDirective: string;
  disposition: string;
  blockedURI: string;
  violatedDirective: string;
}

export interface KnownDevOnlyViolation {
  effectiveDirective: string;
  blockedURI: string;
}

/**
 * Started empty (design.md §4.4.3, spec.md "No Violations on Real Routes")
 * and gained its first, and so far only, entry the moment task 2.3's RED
 * sweep actually ran — design.md §6.7 named this in advance as "the single
 * most likely thing to force a revision of §4.4":
 *
 * `@react-router/dev@7.15.1`'s dev SSR document — which runs even in SPA mode
 * (`react-router.config.ts` `ssr: false`; the dev server still SSRs the
 * initial HTML, only the BUILD skips it) — inlines the client hydration
 * payload as three bare `<script>` tags with no `src`:
 * `window.__reactRouterContext = {...}`, then two
 * `window.__reactRouterContext.streamController.enqueue(...)` /
 * `.close()` calls (verified by curling `http://localhost:3333/` directly
 * and inspecting the raw HTML — NOT a Playwright artifact). Chrome reports
 * all three identically: `effectiveDirective: 'script-src-elem'`,
 * `blockedURI: 'inline'` — the browser gives no finer-grained identifier for
 * a blocked inline script without the `report-sample` CSP keyword, which
 * this change's directive table does not declare, so one entry covers all
 * three.
 *
 * Never fixed by adding `'unsafe-inline'` to `script-src` — that deletes the
 * reason this change exists (spec.md, "script-src Excludes Unsafe
 * Keywords"). **NOT VERIFIED**: whether `react-router build`'s static output
 * (SPA mode, prerendered once at build time) carries the same inline
 * payload — this sweep only reaches the dev server (design.md §5, "NOT
 * PROVEN ... only the dev document is observable"). If it does, the
 * production build carries the same, harmless-in-report-only violation,
 * subject to WU3's §3.7 manual pass.
 */
export const KNOWN_DEV_ONLY_VIOLATIONS: readonly KnownDevOnlyViolation[] = [
  {
    effectiveDirective: 'script-src-elem',
    blockedURI: 'inline',
  },
];

export interface CspViolationObserver {
  /** All violations recorded so far, in order, since the last reset()/install. */
  violations(): CspViolationRecord[];
  /** Clears recorded violations — call between route visits to isolate each one. */
  reset(): void;
  /**
   * Throws unless zero violations were recorded (after filtering
   * `KNOWN_DEV_ONLY_VIOLATIONS` matches out) since the last reset()/install.
   */
  expectZeroViolations(context?: string): void;
}

const BINDING_NAME = '__reportCspViolation';

function isKnownDevOnly(record: CspViolationRecord): boolean {
  return KNOWN_DEV_ONLY_VIOLATIONS.some(
    (known) => known.effectiveDirective === record.effectiveDirective && known.blockedURI === record.blockedURI
  );
}

export async function installCspViolationObserver(page: Page): Promise<CspViolationObserver> {
  const records: CspViolationRecord[] = [];

  await page.exposeFunction(BINDING_NAME, (record: CspViolationRecord) => {
    records.push(record);
  });

  await page.addInitScript((bindingName: string) => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = {
        documentURI: event.documentURI,
        effectiveDirective: event.effectiveDirective,
        disposition: event.disposition,
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
      };
      (window as unknown as Record<string, (record: unknown) => void>)[bindingName](report);
    });
  }, BINDING_NAME);

  return {
    violations: () => records.map((record) => ({ ...record })),

    reset: () => {
      records.length = 0;
    },

    expectZeroViolations: (context?: string) => {
      const unexpected = records.filter((record) => !isKnownDevOnly(record));
      if (unexpected.length === 0) return;
      const summary = unexpected
        .map((r) => `${r.effectiveDirective} blocked ${r.blockedURI} on ${r.documentURI} (${r.disposition})`)
        .join('; ');
      throw new Error(
        `Expected zero CSP violations${context ? ` (${context})` : ''}, observed ${unexpected.length}: ${summary}.`
      );
    },
  };
}
