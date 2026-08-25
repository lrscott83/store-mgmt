import { test, expect } from './support/test';
import { assertStoresFeature } from './support/store-fixture';
import { installStoreNetworkObserver } from './support/store-network-observer';

/**
 * [FC-B1] Store edit /:id — E2E Playwright
 * docs/testing/frontend-coverage/FC-B1.md
 *
 * Verifies that `/management/stores/edit/:id` loads with prefilled data
 * from the URL param, saves without moduleIds, and persists after reload.
 *
 * Complements `store-update.spec.ts` (which tests `/management/stores/update`
 * via menu navigation) by hitting the edit/:id route directly.
 *
 * Uses `owner-admin` persona (has Stores feature).
 */

test.use({ persona: 'owner-admin' });

test.describe.serial('FC-B1 — Store edit por ID', () => {
  test.describe.configure({ timeout: 120_000 });

  test('formulario se pre-carga con datos de la tienda y guardar funciona', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    await assertStoresFeature(page);

    // Navigate to edit/:id directly (not via menu)
    await page.goto(`/management/stores/edit/${selectedStoreId}`);

    // Page loads with edit heading
    await expect(page.getByRole('heading', { name: 'Editar la tienda' })).toBeVisible();

    // Name field should be prefilled (not empty)
    const nameField = page.locator('#store-name');
    await expect(nameField).toBeVisible();
    const initialName = await nameField.inputValue();
    expect(initialName.length).toBeGreaterThan(0);

    // Edit name
    const newName = `E2E-EDIT-${Date.now()}`;
    await nameField.fill(newName);

    // Save
    const storeObserver = installStoreNetworkObserver(page, selectedStoreId);
    storeObserver.markDocumentBaseline();

    const saveButton = page.getByRole('button', { name: 'Guardar' });
    await saveButton.click();

    const putCapture = await storeObserver.waitForPutResponse();
    expect(putCapture.status).toBe(200);

    // Payload should NOT include moduleIds
    const payload = JSON.parse(putCapture.rawBody) as Record<string, unknown>;
    expect('moduleIds' in payload).toBe(false);
    expect(payload.name).toBe(newName);

    // Button re-enables after save
    await expect(saveButton).toBeEnabled();

    // Persist: reload → name still new
    await page.reload();
    await expect(nameField).toHaveValue(newName);
  });
});
