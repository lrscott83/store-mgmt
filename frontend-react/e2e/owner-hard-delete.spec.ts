import { test, expect } from './support/test';
import { mintSuperAdmin, applySuperAdminSnapshot } from './support/superadmin-session';
import type { SuperAdminSnapshot } from './support/superadmin-session';

/**
 * S5-A1 — Hard delete owner with confirmation dialog
 * Tests the gear menu option to permanently delete an owner with store and users.
 */

let superAdmin: SuperAdminSnapshot;

test.describe.serial('Owner hard delete (SuperAdmin)', () => {
  test.beforeAll(async ({ browser }) => {
    superAdmin = await mintSuperAdmin(browser);
  });

  test('gear menu shows Eliminar option', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/admin/owners');
    await page.waitForTimeout(1000);

    // Find the gear button (first owner card)
    const gearButton = page.getByRole('button', { name: /acciones/i }).first();
    await gearButton.click();

    // Should have Eliminar menu item
    const deleteItem = page.getByRole('menuitem', { name: /eliminar/i }).first();
    await expect(deleteItem).toBeVisible();
  });

  test('clicking Eliminar opens confirmation dialog', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/admin/owners');
    await page.waitForTimeout(1000);

    // Open gear menu
    const gearButton = page.getByRole('button', { name: /acciones/i }).first();
    await gearButton.click();

    // Click delete
    const deleteItem = page.getByRole('menuitem', { name: /eliminar/i }).first();
    await deleteItem.click();

    // Confirmation dialog should appear
    const confirmButton = page.getByRole('button', { name: /eliminar permanentemente/i });
    await expect(confirmButton).toBeVisible();

    // Should have cancel button
    const cancelButton = page.getByRole('button', { name: /cancelar/i });
    await expect(cancelButton).toBeVisible();

    // Cancel to avoid actual deletion
    await cancelButton.click();
  });

  test('canceling dialog does not delete owner', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/admin/owners');

    // The owner list is fetched asynchronously from the API, so a raw
    // `.count()` right after goto routinely reads 0 under the 8-worker dev
    // machine (the ~1s compile/serve turns the blind waitForTimeout into a
    // race). Anchor first on a rendered card with an auto-retrying expect —
    // only then is the count a real baseline.
    const ownerCards = page.locator('[data-slot="card"]');
    await expect(ownerCards).not.toHaveCount(0);

    // Get initial owner count
    const initialCards = await ownerCards.count();

    // Open gear menu and click delete
    const gearButton = page.getByRole('button', { name: /acciones/i }).first();
    await gearButton.click();
    const deleteItem = page.getByRole('menuitem', { name: /eliminar/i }).first();
    await deleteItem.click();

    // Cancel
    const cancelButton = page.getByRole('button', { name: /cancelar/i });
    await cancelButton.click();

    // Owner count should remain the same — auto-retrying, no blind sleep.
    await expect(ownerCards).toHaveCount(initialCards);
  });
});
