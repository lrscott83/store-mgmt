import type { Page } from '@playwright/test';
import {
  KNOWN_DEV_ONLY_VIOLATIONS,
  isKnownDevOnly,
} from '../../apps/web-store-pos/scripts/csp-known-dev-violations.mjs';

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
  /**
   * First ~40 chars of the offending script. Populated ONLY because
   * `script-src` declares `'report-sample'` (scripts/csp-policy.mjs). Empty
   * string when the browser has nothing to sample.
   */
  sample: string;
}

// KNOWN_DEV_ONLY_VIOLATIONS and isKnownDevOnly moved to
// scripts/csp-known-dev-violations.mjs (2026-08-12) — that matcher is now
// Vitest-covered (vitest.config.ts's `include` globs never reached
// e2e/support/), and shared verbatim with the plain re-export below so this
// file's public API is unchanged for anything still importing it.
export type { KnownDevOnlyViolation } from '../../apps/web-store-pos/scripts/csp-known-dev-violations.d.mts';
export { KNOWN_DEV_ONLY_VIOLATIONS };

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
        sample: event.sample ?? '',
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
      // The sample is in the message on purpose: it is the one field that
      // says WHICH inline script this was, and it is what a new
      // KNOWN_DEV_ONLY_VIOLATIONS entry would have to be written against. An
      // empty sample on an inline violation means `'report-sample'` went
      // missing from script-src (scripts/csp-policy.mjs) — that breaks this
      // allowlist by design, loudly, instead of silently widening it.
      const summary = unexpected
        .map(
          (r) =>
            `${r.effectiveDirective} blocked ${r.blockedURI} on ${r.documentURI} (${r.disposition})` +
            `${r.sample ? ` sample: ${JSON.stringify(r.sample)}` : ' sample: <empty>'}`
        )
        .join('; ');
      throw new Error(
        `Expected zero CSP violations${context ? ` (${context})` : ''}, observed ${unexpected.length}: ${summary}.`
      );
    },
  };
}
