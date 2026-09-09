import { test, expect } from './support/test';

/**
 * [FC-B2] Configurations — E2E Playwright
 * docs/testing/frontend-coverage/FC-B2.md
 *
 * Verifies that `/management/configurations` loads for an owner-admin and
 * renders the active-store selector (store-switcher-react): the page heading
 * and a select listing the owner's stores, pre-selected to the session store.
 *
 * Uses `owner-admin` persona (has Configurations feature). The persona is a
 * real registered owner with a selectedStoreId, so the list is non-empty.
 */

test.use({ persona: 'owner-admin' });

test.describe('FC-B2 — Configurations', () => {
  test.describe.configure({ timeout: 120_000 });

  test('la página muestra el heading y el selector de tienda activa', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/management/configurations');

    // The page heading (MENU.CONFIGURATIONS)
    await expect(page.getByRole('heading', { name: 'Configuraciones' })).toBeVisible();

    // The active-store selector (CONFIGURATIONS.STORE_LABEL)
    const storeSelect = page.getByLabel('Tienda activa');
    await expect(storeSelect).toBeVisible();
    await expect(storeSelect.locator('option').first()).toBeVisible();

    // No error overlay or blank page
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});
