/**
 * E2E — sync export/import v2 (SDD change `sync-export-import-v2`).
 *
 * Proves V2-08 (two-device round trip) and V2-11 (empty store) end to end:
 * device A exports a password-protected v2 backup ZIP from the real UI
 * (`/sync/export`), device B (a fresh browser context — a *different*
 * device) logs into the SAME store with its own roster user and imports
 * the file at `/sync/import`, and the imported data is visible back in the
 * UI on device B's products screen.
 *
 * Zero-login proof (SYNC-02): both devices run the whole scenario with the
 * roster fixture only — `plantRoster` + `LoginPage`, no `signedInPage`, no
 * persona minting — and both assert `expectNoLoginAttempt()`. The app's
 * offline auth handles everything below the login form, so a single login
 * POST to `/v1/auth/login` would be proof the fixture was bypassed.
 *
 * The password used at export (`BACKUP_PASSWORD`) deliberately differs from
 * the roster `KAT_PASSWORD`: the v2 envelope derives the AES key from the
 * backup password ALONE (PBKDF2, 100k iterations, fresh salt — V2-03/04), so
 * the same file must decrypt on device B with a password neither device
 * ever logged in with.
 *
 * Toast assertions use a MutationObserver instead of a visibility check:
 * `root.tsx:68` mounts `<ToastContainer autoClose={1000} />`, so the success
 * toast is gone ~1s after it appears — the observer records the text the
 * instant it lands in the DOM and `expect.poll` reads that flag (same
 * observer philosophy as `any-request-observer.ts`).
 *
 * Both devices move between routes with plain `goto()` navigations, never
 * the sidebar: the roster fixture's users carry `featureIds: []`, and
 * `isUserAuthorized` (authorization-service.ts:31) grants owner-admins only
 * features they actually hold — so the sidebar renders ZERO links for a
 * roster user. A hard reload is safe here precisely because this spec uses
 * `wrap: 'kat'` (see `rosterLogin`): the device-key wrap (`device-wrapped-dek`,
 * WU9) recovers the entity DEK from IndexedDB on load without any network —
 * login-offline.spec.ts T10 already proves products survive a `reload()`
 * and no unlock gate appears. The routes themselves stay reachable because
 * the feature loader bypasses owner-admins (`feature-loader.ts`).
 */

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { KAT_PASSWORD, plantRoster } from './support/roster-fixture';
import type { OfflineRosterBundle } from './support/roster-fixture';
import { seedCategoryAndProduct } from './support/store-seed';
import { installAnyRequestObserver } from './support/any-request-observer';
import type { AnyRequestObserver } from './support/any-request-observer';
import { installLoginNetworkObserver } from './support/login-network-observer';

// The backup password is intentionally NOT KAT_PASSWORD — see header comment.
const BACKUP_PASSWORD = 'BackupE2E-123';

// `SYNC.IMPORT_SUCCESS` (es.ts:844) — hardcoded, the only locale file is es.
const IMPORT_SUCCESS_TEXT = 'Los datos se importaron correctamente.';

// `ENTITY_ENVELOPE_PREFIX` (`entity-crypto.ts:23`) — product entities written
// by the import are re-encrypted with the importing device's DEK.
const ENTITY_ENVELOPE_PREFIX = 'enc:v1:';

// The ONLY backend traffic the suite tolerates, from login-offline.spec.ts:
// the usage tracker POST that fires on route changes after login.
const USAGE_TRACKER_PATH = '/v1/usages/store-daily-usage';

let loginSequence = 0;
function uniqueLogin(prefix: string): string {
  loginSequence += 1;
  return `${prefix}-${loginSequence}@offline.test`;
}

/**
 * REQ-1 tolerated-traffic helper (login-offline.spec.ts convention): every
 * observed request must be the usage tracker POST, or the assertion fails
 * with the full request list for diagnosis.
 */
function expectOnlyKnownTelemetry(anyRequest: AnyRequestObserver, context: string): void {
  const unexpected = anyRequest
    .requests()
    .filter((r) => !r.url.includes(USAGE_TRACKER_PATH));
  expect(unexpected, `${context} — zero HTTP beyond the tolerated usage tracker`).toEqual([]);
}

/**
 * Logs a roster user in with the app's own offline-auth login form. The
 * returned bundle carries `storeId` — pass it as `storeId` for a second
 * device's roster so both devices belong to the SAME store (V2-08).
 *
 * `wrap: 'kat'` is mandatory for a login that must SUCCEED: the device-key
 * unlock gate (`device-wrapped-dek`, WU9) decrypts the user's `wrappedDek`
 * on login, and a `wrap: 'none'` user has none — the app answers
 * "No se pudieron desbloquear los datos de este dispositivo" (es.ts) and
 * stays on `/login`. login-offline.spec.ts T1/T2 plant `wrap: 'kat'` for
 * exactly this reason; the KAT wrap is memoized in the fixture, so the
 * roster still costs one PBKDF2 verifier derivation per distinct password.
 */
async function rosterLogin(
  page: Page,
  login: string,
  opts: { storeId?: string } = {},
): Promise<OfflineRosterBundle> {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  const bundle = await plantRoster(page, {
    users: [{ login, wrap: 'kat' }],
    ...(opts.storeId ? { storeId: opts.storeId } : {}),
  });
  await loginPage.fill({ login, password: KAT_PASSWORD });
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);
  return bundle;
}

/**
 * Hard navigation to an app route — safe for these roster users, see the
 * header comment (the `wrap: 'kat'` device-key wrap recovers the DEK on
 * load, T10 precedent).
 */
async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
}

/**
 * Drives the real export form (`/sync/export`, `export-form.tsx`): types the
 * backup password, submits, captures the browser download event, and returns
 * the ZIP bytes the browser actually produced. The download is written to
 * `testInfo.outputPath` so Playwright cleans it up with the run.
 */
async function exportBackupZip(
  page: Page,
  password: string,
  outputPath: string,
): Promise<Buffer> {
  await navigateTo(page, '/sync/export');
  await page.locator('#export-password').fill(password);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(outputPath);
  return readFileSync(outputPath);
}

/**
 * Deterministic success-toast assertions (see header comment). Two steps:
 * `installToastObserver` must be called BEFORE the action that triggers the
 * toast; `expectToastSeen` then reads the MutationObserver's flag with
 * `expect.poll` — a visibility assertion would race the 1000ms autoClose.
 */
async function installToastObserver(page: Page, text: string): Promise<void> {
  await page.evaluate((target) => {
    const w = window as unknown as { __syncToastSeen?: string };
    w.__syncToastSeen = undefined;
    const root = document.body ?? document.documentElement;
    const observer = new MutationObserver(() => {
      if (w.__syncToastSeen === undefined && root.textContent?.includes(target)) {
        w.__syncToastSeen = target;
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }, text);
}

async function expectToastSeen(page: Page, text: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const seen = await page.evaluate(() => {
          const w = window as unknown as { __syncToastSeen?: string };
          return w.__syncToastSeen;
        });
        return seen === text;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

/**
 * Local replica of login-offline.spec.ts's `expectProductVisibleInCategory`
 * (support files are untouchable — see CLAUDE.md): the category panel mounts
 * collapsed, so toggle it open first, then assert the name scoped INSIDE the
 * expanded panel (the category and the product share one name — an unscoped
 * `getByText` is a strict-mode violation).
 */
async function expectProductVisibleInCategory(page: Page, name: string): Promise<void> {
  const panelToggle = page.locator('[data-testid^="category-panel-toggle-"]');
  if ((await panelToggle.getAttribute('aria-expanded')) !== 'true') {
    await panelToggle.click();
  }
  const expandedPanel = page.locator('div:has(> [data-testid^="category-panel-toggle-"]) + div');
  await expect(expandedPanel.getByText(name, { exact: true })).toBeVisible();
}

/**
 * Proves the import wrote re-encrypted ciphertext to THIS device's storage:
 * after a successful import the product entity under
 * `lizoft.store-products-{storeId}` must exist and start with the
 * `enc:v1:` envelope prefix — i.e. the v2 file was decrypted with the backup
 * password and merged through the real repository layer.
 */
async function expectProductsEntityEncrypted(page: Page, storeId: string): Promise<void> {
  const key = `lizoft.store-products-${storeId}`;
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, prefix }) => {
          const raw = window.localStorage.getItem(storageKey);
          return raw === null ? null : raw.slice(0, prefix.length);
        },
        { storageKey: key, prefix: ENTITY_ENVELOPE_PREFIX },
      ),
    )
    .toBe(ENTITY_ENVELOPE_PREFIX);
}

test.describe('sync export/import v2 — two-device round trip (V2-08, SYNC-02)', () => {
  test('T1 — device A exports a backup with a seeded product, device B imports it and sees the product', async ({
    page,
    browser,
    loginNetwork,
  }, testInfo) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginA = uniqueLogin('t1-a');
    const loginB = uniqueLogin('t1-b');
    const productName = `SyncV2 Product ${Date.now()}`;

    // --- Device A: roster login, seed one product, export the backup. ---
    const bundleA = await rosterLogin(page, loginA);
    await seedCategoryAndProduct(page, productName);

    const backupZip = await exportBackupZip(
      page,
      BACKUP_PASSWORD,
      testInfo.outputPath('t1-backup-v2.zip'),
    );

    // --- Device B: a fresh browser context — a different device. ---
    const contextB = await browser.newContext({ serviceWorkers: 'block' });
    const pageB = await contextB.newPage();
    try {
      const loginNetworkB = installLoginNetworkObserver(pageB);
      const anyRequestB = installAnyRequestObserver(pageB);

      // Same store as device A — V2-08 is a same-store round trip.
      const bundleB = await rosterLogin(pageB, loginB, { storeId: bundleA.storeId });

      await navigateTo(pageB, '/sync/import');
      await pageB.locator('#import-file').setInputFiles({
        name: 't1-backup-v2.zip',
        mimeType: 'application/zip',
        buffer: backupZip,
      });
      await pageB.locator('#import-password').fill(BACKUP_PASSWORD);
      await installToastObserver(pageB, IMPORT_SUCCESS_TEXT);
      await pageB.getByRole('button', { name: 'Importar', exact: true }).click();
      await expectToastSeen(pageB, IMPORT_SUCCESS_TEXT);

      // The v2 file decrypted with the backup password alone and the import
      // re-encrypted the product into device B's storage...
      await expectProductsEntityEncrypted(pageB, bundleB.storeId);

      // ...and the product is back in the UI.
      await navigateTo(pageB, '/sales/products');
      await expectProductVisibleInCategory(pageB, productName);

      // Zero-login proof on BOTH devices: no /v1/auth/login POST anywhere.
      loginNetwork.expectNoLoginAttempt();
      loginNetworkB.expectNoLoginAttempt();
      expectOnlyKnownTelemetry(anyRequest, 'device A');
      expectOnlyKnownTelemetry(anyRequestB, 'device B');
    } finally {
      await contextB.close();
    }
  });

  test('T2 — empty store round trip (V2-11): an empty store exports and imports cleanly', async ({
    page,
    browser,
    loginNetwork,
  }, testInfo) => {
    const anyRequest = installAnyRequestObserver(page);
    const loginA = uniqueLogin('t2-a');
    const loginB = uniqueLogin('t2-b');

    // --- Device A: fresh (empty) store, no seeding at all. ---
    const bundleA = await rosterLogin(page, loginA);

    const backupZip = await exportBackupZip(
      page,
      BACKUP_PASSWORD,
      testInfo.outputPath('t2-backup-v2-empty.zip'),
    );

    // --- Device B: imports the empty-store backup into the same store. ---
    const contextB = await browser.newContext({ serviceWorkers: 'block' });
    const pageB = await contextB.newPage();
    try {
      const loginNetworkB = installLoginNetworkObserver(pageB);
      const anyRequestB = installAnyRequestObserver(pageB);

      await rosterLogin(pageB, loginB, { storeId: bundleA.storeId });

      await navigateTo(pageB, '/sync/import');
      await pageB.locator('#import-file').setInputFiles({
        name: 't2-backup-v2-empty.zip',
        mimeType: 'application/zip',
        buffer: backupZip,
      });
      await pageB.locator('#import-password').fill(BACKUP_PASSWORD);
      await installToastObserver(pageB, IMPORT_SUCCESS_TEXT);
      await pageB.getByRole('button', { name: 'Importar', exact: true }).click();
      await expectToastSeen(pageB, IMPORT_SUCCESS_TEXT);

      // Empty store in, empty store out — no category panels on device B.
      await navigateTo(pageB, '/sales/products');
      await expect(pageB.locator('[data-testid^="category-panel-toggle-"]')).toHaveCount(0);

      loginNetwork.expectNoLoginAttempt();
      loginNetworkB.expectNoLoginAttempt();
      expectOnlyKnownTelemetry(anyRequest, 'device A');
      expectOnlyKnownTelemetry(anyRequestB, 'device B');
    } finally {
      await contextB.close();
    }
  });
});
