import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * wholesale-scanner — E2E (React-only feature, no Angular correlate)
 *
 * Parity with /sales/new (2026-09-07): the wholesale view carries the same
 * toolbar as the sale view — scanner button next to the product search box
 * and the "Todos" search-scope switch.
 *
 * 2026-09-07 redesign: the scanner modal dropped the manual barcode form
 * (the old E2E-testable path), its + submit button and the "Listo" button.
 * The camera decode itself cannot run under Playwright (no fake camera
 * device; zxing needs real frames), so the add-to-cart flow — including the
 * first-tier-minimum × scanned-quantity contract and the inventory gate —
 * is pinned by the unit suite (wholesale.test.tsx — onScanned(barcode,
 * quantity) contract through a ScannerModal mock).
 *
 * What this E2E still proves end-to-end: the wholesale scanner entry point
 * opens the real modal, the redesigned modal renders the quantity stepper
 * with NO manual form, and the "Todos" search-scope switch restricts the
 * name search to the selected category when OFF.
 *
 * Uses the `owner-admin-with-products` persona: seeded category + product
 * in plaintext localStorage, same seam as mayorista-sale.spec.ts.
 */

const WHOLESALE_HEADER = 'Ventas Mayoristas'; // SALES.WHOLESALE.HEADER, es.ts
const SCANNER_TITLE = 'Escanear producto'; // SCANNER.TITLE, es.ts

/**
 * Same seed shape as mayorista-sale.spec.ts's seedWholesaleProduct: wholesale
 * config (packSize 24, minPacks 5 → $6, minPacks 12 → $5) and an inventory
 * entry so the availability gate sees `available` units. Returns the product
 * name + id.
 */
async function seedWholesaleProduct(
  page: Page,
  storeId: string,
  available = 1000,
): Promise<{ name: string; id: string } | null> {
  return page.evaluate(
    ({ sid, units }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) return null;
      let entries: [string, Record<string, unknown>][];
      try {
        entries = JSON.parse(rawProducts);
      } catch {
        return null;
      }

      const sellable = entries.find(([, p]) => p['isActive'] && p['availableToSale']);
      if (!sellable) return null;
      const [productId, product] = sellable;

      product['wholesaleEnabled'] = true;
      product['wholesalePackSize'] = 24;
      product['wholesaleTiers'] = [
        { minPacks: 5, pricePerUnit: 6 },
        { minPacks: 12, pricePerUnit: 5 },
      ];
      localStorage.setItem(productKey, JSON.stringify(entries));

      const invKey = `lizoft.store-inventory-entries-${sid}`;
      const rawInv = localStorage.getItem(invKey);
      let invEntries: [string, Record<string, unknown>[]][] = [];
      if (rawInv) {
        try {
          invEntries = JSON.parse(rawInv);
        } catch {
          invEntries = [];
        }
      }
      const bucket = invEntries.find(([pid]) => pid === productId);
      const now = new Date().toISOString();
      const entry = {
        id: crypto.randomUUID(),
        productId,
        categoryId: '',
        quantity: units,
        available: units,
        costPrice: 5,
        date: now,
        order: 0,
        isActive: true,
        createdDate: now,
        createdByName: 'e2e-seed',
        updatedDate: undefined,
        updatedByName: undefined,
      };
      if (bucket) {
        if (!bucket[1].some((e) => e['isActive'])) bucket[1].push(entry);
      } else {
        invEntries.push([productId, [entry]]);
      }
      localStorage.setItem(invKey, JSON.stringify(invEntries));

      return { name: (product['name'] as string) ?? '', id: productId };
    },
    { sid: storeId, units: available },
  );
}

/** Opens the wholesale screen, seeds, and re-enters so state re-reads localStorage. */
async function openWholesaleSeeded(
  page: Page,
  storeId: string,
  available = 1000,
): Promise<{ name: string; id: string }> {
  await page.goto('/sales/wholesale');
  await expect(page.getByText(WHOLESALE_HEADER)).toBeVisible();
  const seeded = await seedWholesaleProduct(page, storeId, available);
  expect(seeded).not.toBeNull();
  const product = seeded as { name: string; id: string };

  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/wholesale');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(WHOLESALE_HEADER)).toBeVisible();
  await expect(page.getByTestId(`wholesale-packs-input-${product.id}`)).toBeVisible();
  return product;
}

test.describe('wholesale-scanner — modal redesign y filtro Todos en venta mayorista', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('the wholesale scanner entry point opens the redesigned modal', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await openWholesaleSeeded(page, selectedStoreId);

    // The scanner button sits in the toolbar next to the search input.
    const scannerButton = page.getByTestId('wholesale-scanner');
    await expect(scannerButton).toBeVisible();
    await scannerButton.click();

    await expect(page.getByTestId('scanner-modal')).toBeVisible();
    await expect(page.getByText(SCANNER_TITLE)).toBeVisible();

    // The 2026-09-07 redesign dropped the manual-entry path entirely…
    await expect(page.getByTestId('scanner-manual-input')).toHaveCount(0);
    await expect(page.getByTestId('scanner-manual-submit')).toHaveCount(0);
    await expect(page.getByTestId('scanner-done')).toHaveCount(0);

    // …and the quantity stepper defaults to 1.
    const quantityInput = page.getByTestId('scanner-quantity-input');
    await expect(quantityInput).toHaveValue('1');
    await page.getByTestId('scanner-quantity-increase').click();
    await expect(quantityInput).toHaveValue('2');
    await page.getByTestId('scanner-quantity-decrease').click();
    await expect(quantityInput).toHaveValue('1');

    // Closing via X removes the modal.
    await page.getByTestId('scanner-close').click();
    await expect(page.getByTestId('scanner-modal')).toHaveCount(0);
  });

  test('el switch "Todos" ON busca en todas las categorías; OFF restringe a la seleccionada', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    const product = await openWholesaleSeeded(page, selectedStoreId);

    // Seed a SECOND category + wholesale product (localStorage seam, same as
    // mayorista-sale.spec.ts) so the category restriction is observable.
    // Both stores use Map-entries wire format [id, entity].
    const otherSeed = await page.evaluate(
      ({ sid }) => {
        const catKey = `lizoft.store-product-categories-${sid}`;
        const cats = JSON.parse(localStorage.getItem(catKey) ?? '[]') as [
          string,
          Record<string, unknown>,
        ][];
        const catId = crypto.randomUUID();
        const cat = {
          id: catId,
          name: 'Segunda',
          order: 2,
          isActive: true,
          createdDate: new Date().toISOString(),
          createdByName: 'e2e-seed',
        };
        cats.push([catId, cat]);
        localStorage.setItem(catKey, JSON.stringify(cats));

        const productKey = `lizoft.store-products-${sid}`;
        const entries = JSON.parse(localStorage.getItem(productKey) ?? '[]') as [
          string,
          Record<string, unknown>,
        ][];
        const prodId = crypto.randomUUID();
        const prod = {
          id: prodId,
          name: 'Producto Segunda',
          categoryId: catId,
          categoryName: 'Segunda',
          price: 10,
          order: 0,
          availableToSale: true,
          discountFromInvantory: false,
          businessId: '',
          isActive: true,
          wholesaleEnabled: true,
          wholesalePackSize: 6,
          wholesaleTiers: [{ minPacks: 1, pricePerUnit: 9 }],
          createdDate: new Date().toISOString(),
          createdByName: 'e2e-seed',
        };
        entries.push([prodId, prod]);
        localStorage.setItem(productKey, JSON.stringify(entries));
        return { catId, prodId };
      },
      { sid: selectedStoreId },
    );

    // Re-enter so the wholesale screen re-reads both categories.
    await page.goto('/profile/edit');
    await page.waitForLoadState('networkidle');
    await page.goto('/sales/wholesale');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Segunda').first()).toBeVisible();

    const search = page.getByTestId('wholesale-search-input');
    const searchSwitch = page.getByRole('switch', { name: 'Todos' });

    // ── Switch ON (default): selecting category "Segunda" but searching the
    // FIRST product's name still finds it (search crosses categories).
    await page.getByTestId(`wholesale-category-${otherSeed.catId}`).click();
    await expect(searchSwitch).toHaveAttribute('aria-checked', 'true');
    await search.fill(product.name);
    await expect(page.getByTestId(`wholesale-packs-input-${product.id}`)).toBeVisible();

    // ── Switch OFF: the same search now finds nothing (the product is in
    // another category)…
    await searchSwitch.click();
    await expect(searchSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId(`wholesale-packs-input-${product.id}`)).toHaveCount(0);
    // …while searching the selected category's own product still finds it.
    await search.fill('Producto Segunda');
    await expect(page.getByTestId(`wholesale-packs-input-${otherSeed.prodId}`)).toBeVisible();
  });
});
