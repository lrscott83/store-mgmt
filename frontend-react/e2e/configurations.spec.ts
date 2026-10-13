import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import {
  MODISTORES_MODULE_ID,
  disableStoreModule,
  enableStoreModule,
} from './support/multipayments-fixture';

/**
 * [FC-B2] Configurations — E2E Playwright
 * docs/testing/frontend-coverage/FC-B2.md
 *
 * Verifies that `/management/configurations` gates the active-store selector
 * (store-switcher-react) on the MultiStores module (14): without the module
 * the page renders the heading and NO selector (configurations.tsx:110,164);
 * with the module on the store the same page renders the select with at least
 * one option.
 *
 * ── The negative half is CONSTRUCTED, not assumed (2026-10-13) ────────────
 * BIRTH PLAN (owner decision 2026-10-13): a newly registered store is born on
 * the **Superior** plan (`store-birth-superior`, 2026-10-11), and Superior
 * INCLUDES MultiStores (14). This test used to lean on the opposite truth —
 * "the persona registers WITHOUT it" — so the heading-only shape it pins could
 * no longer happen naturally. The precondition is now built explicitly with
 * `disableStoreModule`, and pinning the session is done through a real
 * `GET /v1/auth/me`. The POSITIVE half is built with `enableStoreModule`, so
 * both sides of the gate pair are constructed rather than inherited from the
 * plan. Both halves keep every original assertion.
 *
 * PRIVATE identity for the negative half (e2e/README.md §"Specs que mutan
 * estado server-side"): removing a module is a server-side mutation, so the
 * shared worker-scoped persona must not be used for it. The positive half only
 * READS the store (its seed is idempotent and pinned through the API), so it
 * stays on the shared persona, which also has the Configurations feature.
 */

const MODULE_MULTISTORES = MODISTORES_MODULE_ID;

/** Module ids the CLIENT session currently carries (the gate's real input). */
async function sessionModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('configurations: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

/**
 * Refreshes the session profile through a REAL GET /v1/auth/me and rewrites
 * localStorage.currentUser — the gate reads `user.storeModuleIds` from the
 * client session, and cold-boot makes no backend call when the cached profile
 * matches (auth-store.ts:167-177), so the seeded module is invisible until
 * the cache is rewritten. Pattern copied from owner-store-create.spec.ts.
 */
async function refreshSessionFromMe(page: Page): Promise<void> {
  const token = await readBearerToken(page);
  const response = await page.request.get(`${E2E_API_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(`refreshSessionFromMe: GET /v1/auth/me failed (${response.status()})`);
  }
  const body = (await response.json()) as { data?: unknown };
  if (!body.data) {
    throw new Error('refreshSessionFromMe: /v1/auth/me returned no data payload');
  }
  await page.evaluate((profile) => {
    window.localStorage.setItem('currentUser', JSON.stringify(profile));
    window.localStorage.setItem(
      'current-store-id',
      (profile as { selectedStoreId?: string }).selectedStoreId ?? '',
    );
  }, body.data);
  await page.reload();
}

test.describe('FC-B2 — Configurations', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin' });

  test('sin MultiStores la página muestra el heading y NO el selector de tienda activa', async ({
    page,
  }) => {
    // PRIVATE identity: removing module 14 is a server-side mutation, so the
    // shared persona must not be touched (e2e/README.md §"Specs que mutan
    // estado server-side"). The store is born on Superior WITH the module.
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    const storeId = await readSelectedStoreId(page);

    // CONSTRUCT the negative precondition: drop the module the birth plan
    // granted, then pin the client session through a real /me.
    await disableStoreModule(page, storeId, MODULE_MULTISTORES);
    await refreshSessionFromMe(page);
    expect(await sessionModuleIds(page)).not.toContain(MODULE_MULTISTORES);

    await page.goto('/management/configurations');

    // The page heading (MENU.CONFIGURATIONS)
    await expect(page.getByRole('heading', { name: 'Configuraciones' })).toBeVisible();

    // The active-store selector (CONFIGURATIONS.STORE_LABEL) is gated on the
    // MultiStores module, so configurations.tsx:164 never renders the block
    // (absent, not disabled) now that the session really lacks module 14.
    await expect(page.getByLabel('Tienda activa')).toHaveCount(0);

    // No error overlay or blank page
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('con MultiStores el selector de tienda activa se renderiza con opciones', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    // Build the positive precondition explicitly (the seed is idempotent and
    // pinned through the real API) and refresh the cached session via a real
    // /me: the gate reads user.storeModuleIds from the client session, which
    // cold-boot takes from localStorage.
    await enableStoreModule(page, selectedStoreId, MODULE_MULTISTORES);
    await refreshSessionFromMe(page);
    expect(await sessionModuleIds(page)).toContain(MODULE_MULTISTORES);

    await page.goto('/management/configurations');

    await expect(page.getByRole('heading', { name: 'Configuraciones' })).toBeVisible();

    const storeSelect = page.getByLabel('Tienda activa');
    await expect(storeSelect).toBeVisible();
    // <option> elements are "hidden" by definition (Playwright never grants
    // visibility to a collapsed select's options) — assert existence + the
    // default selection instead (Grupo D fix, 2026-09-24, con autorización).
    await expect(storeSelect.locator('option')).not.toHaveCount(0);
    await expect(storeSelect).toHaveValue(selectedStoreId);
  });
});
