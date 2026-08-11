import { expect, test } from '@playwright/test';
import { installCspViolationObserver } from './support/csp-violations';

// CÓMO CORRER (desde frontend-react/):
//   npx playwright test e2e/csp-report-only.spec.ts --project=chromium
//
// Covers `content-security-policy` — "Dev Header Delivery", "script-src
// Excludes Unsafe Keywords", "style-src Permanent Carve-out", "Report-Only
// Does Not Block", "No Violations on Real Routes" (openspec/changes/
// content-security-policy/specs/content-security-policy/spec.md), plus the
// pwa-install-capture-script "Script load produces no violation" scenario
// (folded into the zero-violation sweep below, since `/` loads that script).
// Design: design.md §4.4.
//
// RED at this point in WU2: no CSP header exists yet, `vite.config.ts` is
// untouched (task 2.4 wires it). All three tests fail until then.

test.describe('CSP report-only header (dev)', () => {
  test('header is present, report-only, and carries the required directives', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();

    const headers = response!.headers();
    const csp = headers['content-security-policy-report-only'];
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");

    // The negative assertion that catches the worst possible mistake in this
    // change: an ENFORCING header would break the app on the spot, while
    // report-only never does. Proving we shipped the right ONE matters as
    // much as proving the directives are right.
    expect(headers['content-security-policy']).toBeUndefined();
  });

  test('a real violation is reported, not enforced', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cspTestViolation?: unknown }).__cspTestViolation = null;
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { __cspTestViolation?: unknown }).__cspTestViolation = {
          disposition: event.disposition,
          effectiveDirective: event.effectiveDirective,
        };
      });
    });

    await page.goto('/');

    // A cross-origin classic script — script-src 'self' forbids it. In
    // report-only this still EXECUTES (fails to load, since example.com
    // serves no such file, but that failure is a 404, not CSP enforcement —
    // the event is what proves the policy engine evaluated it).
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = 'https://example.com/x.js';
      document.body.appendChild(script);
    });

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __cspTestViolation?: unknown }).__cspTestViolation))
      .not.toBeNull();

    const violation = (await page.evaluate(
      () => (window as unknown as { __cspTestViolation?: unknown }).__cspTestViolation
    )) as { disposition: string; effectiveDirective: string };

    expect(violation.disposition).toBe('report');
    // Chrome may report either — NOT VERIFIED which, design.md §4.4.2 /
    // register of unverified claims #3. Accept both.
    expect(violation.effectiveDirective).toMatch(/^script-src(-elem)?$/);
  });

  test('zero violations across the primary unauthenticated routes', async ({ page }) => {
    // KNOWN_DEV_ONLY_VIOLATIONS started empty and gained exactly one entry
    // once this sweep actually ran (design.md §6.7's predicted "single most
    // likely thing to force a revision of §4.4" — see the comment on the
    // constant in csp-violations.ts for the full finding). Any OTHER
    // violation still fails this test.
    const observer = await installCspViolationObserver(page);

    for (const route of ['/', '/login', '/register']) {
      await page.goto(route);
      observer.expectZeroViolations(route);
      observer.reset();
    }
  });
});
