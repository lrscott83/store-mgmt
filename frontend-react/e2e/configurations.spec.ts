import { test, expect } from './support/test';
import { assertStoresFeature } from './support/store-fixture';

/**
 * [FC-B2] Configurations — E2E Playwright
 * docs/testing/frontend-coverage/FC-B2.md
 *
 * Verifies that `/management/configurations` loads for an owner-admin.
 * The page is currently a placeholder ("configurations works!"), so the
 * test verifies the route is accessible and the page renders without error.
 *
 * Uses `owner-admin` persona (has Configurations feature).
 */

test.use({ persona: 'owner-admin' });

test.describe('FC-B2 — Configurations', () => {
  test.describe.configure({ timeout: 120_000 });

  test('la página carga sin errores y muestra contenido', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    await page.goto('/management/configurations');

    // The placeholder renders "configurations works!"
    await expect(page.getByText('configurations works!')).toBeVisible();

    // No error overlay or blank page
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});
