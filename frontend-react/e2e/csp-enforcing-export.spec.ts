import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './support/test';
import { installCspViolationObserver, type CspViolationObserver } from './support/csp-violations';
import { buildCspHeaderValue } from '../apps/web-store-pos/scripts/csp-policy.mjs';
import { extractAddHeaders, parseCspHeaderValue } from '../apps/web-store-pos/scripts/csp-nginx.mjs';

/**
 * CSP ENFORCING export paths — Step 2 of the flip plan
 * (docs/plans/2026-09-10-csp-enforcing-flip-plan.md).
 *
 * These tests run ONLY under `playwright.csp.config.ts`, which serves the
 * real production build via `vite preview` (port 4174) with an ENFORCING
 * `Content-Security-Policy` header injected by the
 * `csp-enforcing-preview-header` middleware in apps/web-store-pos/vite.config.ts
 * (activated by E2E_CSP_ENFORCE=1).
 *
 * They exist to prove the two flows that report-only could never exercise —
 * the flip's two known risks (plan §"The blocker"):
 *   1. ZIP export (/sync/export, zip.js with useWebWorkers:false) — if a
 *      blob: worker were ever spawned, worker-src 'self' would block it.
 *   2. PDF export (/reports/today, jspdf + jspdf-autotable lazily imported)
 *      — html2canvas.esm (a jspdf dependency chunk) rasterizes data:image/*
 *      sources, which img-src 'self' data: must cover.
 *
 * The enforcing value the middleware serves is derived from csp-policy.mjs +
 * the served build's own hydration hashes. The EXPECTED value below is
 * derived independently from deploy/nginx.conf (the file Step 3 will flip) —
 * so a passing test proves the preview serves byte-identically what nginx
 * will serve after the flip. If the build's hashes and nginx's hashes ever
 * drift, this spec fails loudly (verify-csp.mjs would fail the build first).
 *
 * CÓMO CORRER (desde frontend-react/, que es el cwd del runner):
 *   pnpm --filter @store-mgmt/web-store-pos build   # real build first (API_URL=/api)
 *   npx playwright test --config=playwright.csp.config.ts
 *
 * The persona mint (register + login through the real UI) is itself a
 * hydration proof: under an enforcing header that blocked the stable inline
 * scripts, the app would never hydrate and the mint would time out with a
 * clear waitForURL symptom.
 */

// i18n literal strings from es.ts (same policy as data-export.spec.ts).
const EXPORT_TITLE = 'Exportar datos'; // SYNC.EXPORT_TITLE
const PDF_BUTTON = 'Inventario a precio de venta'; // REPORT.INVENTORY_TODAY_SALE

/**
 * The enforcing value nginx.conf will serve after the Step-3 flip, computed
 * from nginx.conf itself: its script-src sha256 hashes + buildCspHeaderValue
 * ('prod') — the same generator verify-csp.mjs compares byte-for-byte.
 * Accepts either header name so this spec survives the Step-3 rename.
 */
function expectedEnforcingValue(): string {
  const conf = readFileSync(join(process.cwd(), 'deploy', 'nginx.conf'), 'utf8');
  const cspHeader = extractAddHeaders(conf).find((header) =>
    header.name.startsWith('Content-Security-Policy'),
  );
  if (!cspHeader) {
    throw new Error('deploy/nginx.conf carries no Content-Security-Policy add_header to derive the expectation from');
  }
  const scriptSrcTokens = parseCspHeaderValue(cspHeader.value).get('script-src') ?? [];
  const hydrationHashes = scriptSrcTokens.filter((token) => token.startsWith("'sha256-"));
  return buildCspHeaderValue('prod', { hydrationScriptHashes: hydrationHashes });
}

/**
 * Installs the violation observer BEFORE any navigation the test asserts on.
 * Deliberately per-test (not beforeEach): `signedInPage` resolution order
 * relative to hooks must not decide which navigations get observed. Installed
 * after the restore, the observer still sees every TEST-body navigation —
 * including the full app-shell load of each goto, which runs the hydration
 * scripts this spec must prove execute cleanly.
 */
async function armObserver(page: import('@playwright/test').Page): Promise<CspViolationObserver> {
  return installCspViolationObserver(page);
}

test.describe.serial('CSP enforcing — export paths', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('sirve el header enforcing exacto que nginx servirá tras el flip', async ({ page }) => {
    const observer = await armObserver(page);

    const response = await page.goto('/');
    expect(response).not.toBeNull();

    const headers = response!.headers();
    const enforcing = headers['content-security-policy'];
    expect(enforcing).toBeDefined();

    // The negative assertion that matters most: this config must never
    // silently serve report-only — the whole point of Step 2 is enforcement.
    expect(headers['content-security-policy-report-only']).toBeUndefined();

    // Byte-identical to the post-flip nginx value: same directives, same
    // hydration hashes. Drift here means preview and production disagree.
    expect(enforcing).toBe(expectedEnforcingValue());

    // Hydration proof under enforcement — the direct one. The first stable
    // inline script (hash-allowlisted in script-src) is exactly the
    // `window.__reactRouterContext = {...}` assignment: if the hash ever
    // drifted, CSP would BLOCK it, the property would stay undefined, and
    // the app would be dead on top of a prerendered shell. '/' is the public
    // landing (VendeDTo marketing page), so there is no /login redirect to
    // wait for — the context property IS the proof the script executed.
    const contextAssigned = await page.evaluate(
      () => Boolean((window as { __reactRouterContext?: unknown }).__reactRouterContext),
    );
    expect(contextAssigned).toBe(true);

    // And the landing rendered its interactive shell — the register CTA the
    // router itself links to /register with.
    await expect(page.getByRole('link', { name: 'Crear cuenta gratis' })).toBeVisible();

    // The shell + the landing rendered under enforcement with zero
    // violations — hydration scripts included.
    observer.expectZeroViolations('guest shell load bajo CSP enforcing');
  });

  test('ZIP export bajo enforcing: descarga completa sin violaciones CSP', async ({ signedInPage }) => {
    const { page } = signedInPage;
    const observer = await armObserver(page);

    await page.goto('/sync/export');
    await expect(page.getByText(EXPORT_TITLE, { exact: true })).toBeVisible();

    await page.locator('#export-password').fill('csp-enforce-test-123');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^datos\d{6}-\d{4}\.zip$/);

    const buffer = await download.path().then(async (p) => {
      const fs = await import('fs/promises');
      return fs.readFile(p!);
    });

    // ZIP files start with PK\x03\x04 (local file header) — same signature
    // check as data-export.spec.ts.
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);

    // The core assertion of this whole config: zip.js ran to completion
    // (serialization + crypto + Blob download) without a single CSP
    // violation — worker-src 'self' with useWebWorkers:false held.
    observer.expectZeroViolations('ZIP export bajo CSP enforcing');
  });

  test('PDF export bajo enforcing: descarga completa sin violaciones CSP', async ({ signedInPage }) => {
    const { page } = signedInPage;
    const observer = await armObserver(page);

    await page.goto('/reports/today');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: PDF_BUTTON })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: PDF_BUTTON }).click();
    const download = await downloadPromise;

    // Default filename is {yyyy-mm-dd}_ipv.pdf (inventory-today-sale-pdf.ts).
    expect(download.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}_ipv\.pdf$/);

    const buffer = await download.path().then(async (p) => {
      const fs = await import('fs/promises');
      return fs.readFile(p!);
    });

    // PDF files start with the literal '%PDF' magic.
    expect(buffer.subarray(0, 4)).toEqual(Buffer.from('%PDF'));

    // The second flip risk, closed: jspdf + jspdf-autotable lazy chunks
    // loaded and html2canvas's data:image/* sources passed img-src 'self' data:.
    observer.expectZeroViolations('PDF export bajo CSP enforcing');
  });
});
