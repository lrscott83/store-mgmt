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
    await page.waitForTimeout(1000);

    // Get initial owner count
    const initialCards = await page.locator('[data-slot="card"]').count();

    // Open gear menu and click delete
    const gearButton = page.getByRole('button', { name: /acciones/i }).first();
    await gearButton.click();
    const deleteItem = page.getByRole('menuitem', { name: /eliminar/i }).first();
    await deleteItem.click();

    // Cancel
    const cancelButton = page.getByRole('button', { name: /cancelar/i });
    await cancelButton.click();

    // Wait a moment
    await page.waitForTimeout(500);

    // Owner count should remain the same
    const finalCards = await page.locator('[data-slot="card"]').count();
    expect(finalCards).toBe(initialCards);
  });
});
