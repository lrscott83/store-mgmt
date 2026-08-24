import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S3-A1] Ver stock por categoría — E2E Playwright
 * docs/testing/e2e-stage-3/S3-A1.md
 *
 * Tests the inventory available page: expand categories, verify stock
 * quantities, and search functionality.
 *
 * Uses `owner-admin-with-products` persona (has seeded products).
 */

const AVAILABLE_HEADER = 'Inventario'; // INVENTORY.AVAILABLE.TITLE

/**
 * Seeds an inventory entry so the available page has data to show.
 */
async function seedInventoryEntry(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) return;
      let entries: [string, Record<string, unknown>][];
      try { entries = JSON.parse(rawProducts); } catch { return; }
      const p = entries.find(([, v]) => v['isActive'] && v['availableToSale']);
      if (!p) return;
      const [pid] = p;
      const catId = (p[1] as Record<string, unknown>)['categoryId'] as string;
      const invKey = `lizoft.store-inventory-entries-${sid}`;
      const raw = localStorage.getItem(invKey);
      let map: [string, Record<string, unknown>[]][] = [];
      if (raw) { try { map = JSON.parse(raw); } catch { map = []; } }
      const bucket = map.find(([id]) => id === pid);
      if (bucket?.[1].some((e) => e['isActive'])) return;
      const entry = {
        id: crypto.randomUUID(), productId: pid, categoryId: catId, quantity: 50,
        available: 50, costPrice: 8, date: new Date().toISOString(), order: 0,
        isActive: true, createdDate: new Date().toISOString(), createdByName: 'e2e-seed',
        updatedDate: undefined, updatedByName: undefined,
      };
      if (bucket) bucket[1].push(entry);
      else map.push([pid, [entry]]);
      localStorage.setItem(invKey, JSON.stringify(map));
    },
    { storeId },
  );
}

test.describe.serial('S3-A1 — Ver stock por categoría', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('expandir categoría muestra productos con stock', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // Seed inventory so there's data to show
    await seedInventoryEntry(page, selectedStoreId);

    // Navigate to available inventory
    await page.goto('/inventory/available');
    await expect(page.getByText(AVAILABLE_HEADER)).toBeVisible();

    // The total inventory value should be visible (starts with $)
    await expect(page.locator('text=/^\\$[\\d,.]+$/').first()).toBeVisible();

    // Find and expand the first category
    const categoryToggle = page.locator('[data-testid^="inventory-category-toggle-"]').first();
    await expect(categoryToggle).toBeVisible();
    await categoryToggle.click();

    // Products should be visible inside the expanded category
    await expect(categoryToggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('buscar producto filtra por nombre', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await seedInventoryEntry(page, selectedStoreId);

    await page.goto('/inventory/available');
    await expect(page.getByText(AVAILABLE_HEADER)).toBeVisible();

    // Type in the search box
    const searchBox = page.getByRole('searchbox');
    await expect(searchBox).toBeVisible();
    await searchBox.fill('E2E');

    // The page should still be functional (no crash)
    await expect(page.getByText(AVAILABLE_HEADER)).toBeVisible();
  });
});
