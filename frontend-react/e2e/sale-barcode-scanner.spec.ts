import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * sale-barcode-scanner — E2E (React-only feature, no Angular correlate)
 *
 * Tests the scanner entry point on the sale view and the MANUAL-ENTRY
 * path of the scanner modal: typing a product's barcode and submitting
 * it must add the product to the cart through the SAME availability
 * gate as a manual row add (inventory check included).
 *
 * Camera decoding itself is NOT covered here: Playwright has no fake
 * camera device, and zxing's decode needs real frames. The manual
 * entry is the E2E-testable contract of the same onScanned flow.
 *
 * Uses the `owner-admin-with-products` persona: seeded category +
 * product in plaintext localStorage, no extra logins.
 */

const SALE_HEADER = 'Productos para vender'; // SALES.HEADER, es.ts
const SCANNER_TITLE = 'Escanear producto'; // SCANNER.TITLE, es.ts
const DONE_TEXT = 'Listo'; // SCANNER.DONE, es.ts

/**
 * Reads the first sellable product's id from the seeded plaintext
 * products key, sets a barcode on it (the persona seeds products
 * without one) so the lookup path has something to find, and seeds
 * an inventory entry for it — the persona's product has
 * discountFromInvantory:true and the OwnerAdmin carries the Inventory
 * module, so without stock the shared availability gate blocks the
 * add (same reason create-sale.spec.ts seeds an entry).
 */
async function seedBarcodeAndInventory(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) throw new Error('products key missing — persona not seeded');

      const entries = JSON.parse(rawProducts) as [string, Record<string, unknown>][];
      const sellable = entries.find(([, p]) => p['isActive'] && p['availableToSale']);
      if (!sellable) throw new Error('no sellable product seeded');

      const [productId, product] = sellable;
      const barcode = '7501234567890';
      product['barcode'] = barcode;
      localStorage.setItem(productKey, JSON.stringify(entries));

      // Inventory entry (Map-entries format, same as InventoryOfflineService)
      const invKey = `lizoft.store-inventory-entries-${sid}`;
      const rawInv = localStorage.getItem(invKey);
      let invMapEntries: [string, Record<string, unknown>[]][] = [];
      if (rawInv) {
        try {
          invMapEntries = JSON.parse(rawInv);
        } catch {
          invMapEntries = [];
        }
      }
      const existingBucket = invMapEntries.find(([pid]) => pid === productId);
      if (existingBucket) {
        if (!existingBucket[1].some((e) => e['isActive'])) {
          existingBucket[1].push(makeEntry(productId));
        }
      } else {
        invMapEntries.push([productId, [makeEntry(productId)]]);
      }
      localStorage.setItem(invKey, JSON.stringify(invMapEntries));

      function makeEntry(pid: string) {
        const now = new Date().toISOString();
        return {
          id: crypto.randomUUID(),
          productId: pid,
          categoryId: '',
          quantity: 100,
          available: 100,
          costPrice: 5,
          date: now,
          order: 0,
          isActive: true,
          createdDate: now,
          createdByName: 'e2e-seed',
          updatedDate: undefined,
          updatedByName: undefined,
        };
      }
    },
    { storeId },
  );
}

test.describe.serial('sale-barcode-scanner — escaneo manual en la vista de venta', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('manual barcode entry adds the product to the cart through the same flow as a manual add', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(SALE_HEADER)).toBeVisible();

    // Give the seeded product a barcode + stock (persona seeds neither)
    await seedBarcodeAndInventory(page, selectedStoreId);

    // Re-enter the page so the products state re-reads localStorage
    await page.goto('/profile/edit');
    await page.waitForLoadState('networkidle');
    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(SALE_HEADER)).toBeVisible();

    // The scanner entry point opens the modal
    const scannerButton = page.getByTestId('quick-sale-scanner');
    await expect(scannerButton).toBeVisible();
    await scannerButton.click();
    await expect(page.getByTestId('scanner-modal')).toBeVisible();
    await expect(page.getByText(SCANNER_TITLE)).toBeVisible();

    // Manual entry of the seeded barcode
    const manualInput = page.getByTestId('scanner-manual-input');
    await manualInput.fill('7501234567890');
    await page.getByTestId('scanner-manual-submit').click();

    // The product landed in the cart (badge count 1) — the exact same
    // outcome as a manual row add
    const badge = page.getByTestId('cart-badge');
    await expect(badge).toHaveText('1');

    // Close via Done and the modal is gone
    await page.getByTestId('scanner-done').click();
    await expect(page.getByTestId('scanner-modal')).toHaveCount(0);
  });

  test('unknown barcode shows the not-found message and adds nothing', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(SALE_HEADER)).toBeVisible();

    await page.getByTestId('quick-sale-scanner').click();
    await expect(page.getByTestId('scanner-modal')).toBeVisible();

    const manualInput = page.getByTestId('scanner-manual-input');
    await manualInput.fill('0000000000000');
    await page.getByTestId('scanner-manual-submit').click();

    // SCANNER.PRODUCT_NOT_FOUND with the barcode interpolated
    await expect(page.getByText('Producto no encontrado: 0000000000000')).toBeVisible();

    // Cart stays empty
    const badge = page.getByTestId('cart-badge');
    await expect(badge).toHaveText('0');

    // The modal STAYS OPEN (POS cadence: scan-scan-scan, then close)
    await expect(page.getByTestId('scanner-modal')).toBeVisible();
    await expect(page.getByText(DONE_TEXT)).toBeVisible();
  });
});
