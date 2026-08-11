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
  /**
   * First ~40 chars of the offending script. Populated ONLY because
   * `script-src` declares `'report-sample'` (scripts/csp-policy.mjs). Empty
   * string when the browser has nothing to sample.
   */
  sample: string;
}

export interface KnownDevOnlyViolation {
  effectiveDirective: string;
  blockedURI: string;
  /**
   * The violation's `sample` (leading whitespace trimmed) must match this.
   * This is what keeps the allowlist narrow: without it, an entry for
   * `blockedURI: 'inline'` would swallow every inline script on every route,
   * including one a future change introduces by accident.
   *
   * A RegExp rather than a plain prefix because the browser samples the
   * script's raw source — react-router's HydrateFallback warning carries a
   * newline and 16 spaces inside the first 40 characters, so no literal
   * prefix survives contact with it. Anchor every pattern with `^`.
   */
  sampleMatch: RegExp;
  /** Why this is dev-only. Required — an entry nobody can justify is an entry nobody can retire. */
  reason: string;
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
 * all three identically as `effectiveDirective: 'script-src-elem'`,
 * `blockedURI: 'inline'` — so those two fields alone cannot tell this
 * payload apart from a genuinely new inline script. `script-src` therefore
 * declares `'report-sample'` (scripts/csp-policy.mjs), which grants no
 * source any permission and only makes the report carry a `sample`. All
 * three scripts are emitted from string literals that begin with
 * `window.__reactRouterContext` (react-router@7.15.1
 * `dist/development/chunk-4N6VE7H7.mjs:8189, 8201, 9983` — read from the
 * package on disk, not inferred from a run), so ONE prefix covers all three
 * and nothing else.
 *
 * Never fixed by adding `'unsafe-inline'` to `script-src` — that deletes the
 * reason this change exists (spec.md, "script-src Excludes Unsafe
 * Keywords").
 *
 * **NOT VERIFIED**: whether `react-router build`'s static output (SPA mode,
 * prerendered once at build time) carries the same inline payload — this
 * sweep only reaches the dev server (design.md §5, "NOT PROVEN ... only the
 * dev document is observable"). If it does, production carries the same,
 * harmless-in-report-only violation, subject to WU3's §3.7 manual pass.
 */
export const KNOWN_DEV_ONLY_VIOLATIONS: readonly KnownDevOnlyViolation[] = [
  {
    effectiveDirective: 'script-src-elem',
    blockedURI: 'inline',
    sampleMatch: /^window\.__reactRouterContext/,
    reason:
      "react-router's dev SSR hydration payload — three inline scripts emitted from literals starting " +
      'with this (react-router@7.15.1 dist/development/chunk-4N6VE7H7.mjs:8189, :8201, :9983). The ' +
      'production build ships its state differently; NOT VERIFIED whether it inlines the same payload.',
  },
  {
    effectiveDirective: 'script-src-elem',
    blockedURI: 'inline',
    sampleMatch: /^console\.log\(\s*"\u{1F4BF} Hey dev/u,
    reason:
      "react-router's RemixRootDefaultHydrateFallback console warning " +
      '(chunk-4N6VE7H7.mjs:8903-8917), an inline `dangerouslySetInnerHTML` script gated on ' +
      '`ENABLE_DEV_WARNINGS` — it does not exist in a production build.',
  },
  {
    effectiveDirective: 'script-src-elem',
    blockedURI: 'inline',
    sampleMatch: /^import "\/@id\/__x00__virtual:react-router/,
    reason:
      "Vite's dev-only module injection for @react-router/dev's virtual modules " +
      '(@react-router/dev/dist/vite.js). The production build resolves these at bundle time and ' +
      'emits no inline import.',
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
    (known) =>
      known.effectiveDirective === record.effectiveDirective &&
      known.blockedURI === record.blockedURI &&
      known.sampleMatch.test(record.sample.trimStart())
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
