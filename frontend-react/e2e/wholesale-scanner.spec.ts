import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * wholesale-scanner — E2E (React-only feature, no Angular correlate)
 *
 * Parity with /sales/new (2026-09-07): the wholesale view carries the same
 * toolbar as the sale view — scanner button next to the product search box
 * and the "Todos" search-scope switch.
 *
 * Tests the MANUAL-ENTRY path of the scanner modal (camera decoding is not
 * E2E-testable — same contract as sale-barcode-scanner.spec.ts) and the
 * "Todos" search-scope switch semantics.
 *
 * Scanner contract (user decision 2026-09-07): each scan adds the FIRST
 * tier's minimum packs (minPacks × packSize units) with the first tier's
 * unit price, so the POS scan-scan-scan cadence never trips the min-packs
 * error.
 *
 * Uses the `owner-admin-with-products` persona: seeded category + product
 * in plaintext localStorage, same seam as mayorista-sale.spec.ts.
 */

const WHOLESALE_HEADER = 'Ventas Mayoristas'; // SALES.WHOLESALE.HEADER, es.ts
const SCANNER_TITLE = 'Escanear producto'; // SCANNER.TITLE, es.ts
const DONE_TEXT = 'Listo'; // SCANNER.DONE, es.ts
const NOT_FOUND_TEXT = (barcode: string) => `Producto no encontrado: ${barcode}`;
const NOT_WHOLESALE_TEXT = (name: string) =>
  `El producto ${name} no tiene configuración mayorista y no se puede vender en esta vista`;

/**
 * Same seed shape as mayorista-sale.spec.ts's seedWholesaleProduct, plus a
 * barcode on the product: wholesale config (packSize 24, minPacks 5 → $6,
 * minPacks 12 → $5) and an inventory entry so the availability gate passes.
 * Returns the product name + id.
 */
async function seedWholesaleProductWithBarcode(
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
      // First tier minPacks 5 → each scan adds 5 packs = 120 units at $6.
      product['wholesaleTiers'] = [
        { minPacks: 5, pricePerUnit: 6 },
        { minPacks: 12, pricePerUnit: 5 },
      ];
      product['barcode'] = '7501234567890';
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
  const seeded = await seedWholesaleProductWithBarcode(page, storeId, available);
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

test.describe.serial('wholesale-scanner — escaneo manual y filtro Todos en venta mayorista', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('el botón del scanner junto al searchbox abre el modal', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    const product = await openWholesaleSeeded(page, selectedStoreId);

    // The scanner button sits in the toolbar next to the search input.
    const scannerButton = page.getByTestId('wholesale-scanner');
    await expect(scannerButton).toBeVisible();
    await scannerButton.click();
    await expect(page.getByTestId('scanner-modal')).toBeVisible();
    await expect(page.getByText(SCANNER_TITLE)).toBeVisible();

    // Close via Done.
    await page.getByTestId('scanner-done').click();
    await expect(page.getByTestId('scanner-modal')).toHaveCount(0);
  });

  test('manual barcode entry adds the first tier minimum (5 packs = 120 units)', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await openWholesaleSeeded(page, selectedStoreId);

    await page.getByTestId('wholesale-scanner').click();
    await expect(page.getByTestId('scanner-modal')).toBeVisible();

    const manualInput = page.getByTestId('scanner-manual-input');
    await manualInput.fill('7501234567890');
    await page.getByTestId('scanner-manual-submit').click();

    // The scanner-added toast names the packs and units (first tier minimum).
    await expect(page.getByText(/5 paquetes \(120 unidades\) a \$6 por unidad/)).toBeVisible();

    // The product landed in the cart — same outcome as a manual row add.
    const badge = page.getByTestId('cart-badge');
    await expect(badge).not.toHaveText('0');

    // Close via Done and the modal is gone.
    await page.getByTestId('scanner-done').click();
    await expect(page.getByTestId('scanner-modal')).toHaveCount(0);
  });

  test('repeated scans of the same barcode accumulate in the cart', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await openWholesaleSeeded(page, selectedStoreId);

    await page.getByTestId('wholesale-scanner').click();
    const manualInput = page.getByTestId('scanner-manual-input');

    // First scan: 5 packs (first tier minimum) — the badge counts PACKS.
    await manualInput.fill('7501234567890');
    await page.getByTestId('scanner-manual-submit').click();
    const badge = page.getByTestId('cart-badge');
    await expect(badge).toHaveText('5');

    // Second scan of the same barcode: the same line accumulates to 10 packs.
    await manualInput.fill('7501234567890');
    await page.getByTestId('scanner-manual-submit').click();
    await expect(badge).toHaveText('10');
  });

  test('unknown barcode shows the not-found message and adds nothing', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await openWholesaleSeeded(page, selectedStoreId);

    await page.getByTestId('wholesale-scanner').click();
    await expect(page.getByTestId('scanner-modal')).toBeVisible();

    const manualInput = page.getByTestId('scanner-manual-input');
    await manualInput.fill('0000000000000');
    await page.getByTestId('scanner-manual-submit').click();

    await expect(page.getByText(NOT_FOUND_TEXT('0000000000000'))).toBeVisible();

    const badge = page.getByTestId('cart-badge');
    await expect(badge).toHaveText('0');

    // The modal STAYS OPEN (POS cadence: scan-scan-scan, then close).
    await expect(page.getByTestId('scanner-modal')).toBeVisible();
    await expect(page.getByText(DONE_TEXT)).toBeVisible();
  });

  test('a sellable product without wholesale config gets its own message, not not-found', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    const product = await openWholesaleSeeded(page, selectedStoreId);

    // Seed a SECOND product (same category): sellable but NO wholesale config,
    // with its own barcode — the scanner finds it but cannot sell it wholesale.
    // Products use Map-entries wire format [id, product] (not [id, [product]]).
    await page.evaluate(
      ({ sid, refProduct }) => {
        const productKey = `lizoft.store-products-${sid}`;
        const entries = JSON.parse(
          localStorage.getItem(productKey) ?? '[]',
        ) as [string, Record<string, unknown>][];
        const prodId = crypto.randomUUID();
        const prod = {
          id: prodId,
          name: 'Producto Sin Mayorista',
          categoryId: refProduct.categoryId,
          categoryName: refProduct.categoryName,
          price: 10,
          order: 0,
          availableToSale: true,
          discountFromInvantory: false,
          businessId: refProduct.businessId,
          isActive: true,
          barcode: '7598765432109',
          createdDate: new Date().toISOString(),
          createdByName: 'e2e-seed',
        };
        entries.push([prodId, prod]);
        localStorage.setItem(productKey, JSON.stringify(entries));
      },
      {
        sid: selectedStoreId,
        refProduct: await page.evaluate(({ sid, pid }) => {
          const entries = JSON.parse(
            localStorage.getItem(`lizoft.store-products-${sid}`) ?? '[]',
          ) as [string, Record<string, unknown>][];
          const found = entries.find(([id]) => id === pid);
          return {
            categoryId: String(found?.[1]['categoryId'] ?? ''),
            categoryName: String(found?.[1]['categoryName'] ?? ''),
            businessId: String(found?.[1]['businessId'] ?? ''),
          };
        }, { sid: selectedStoreId, pid: product.id }),
      },
    );
    await page.goto('/profile/edit');
    await page.waitForLoadState('networkidle');
    await page.goto('/sales/wholesale');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('wholesale-scanner').click();
    const manualInput = page.getByTestId('scanner-manual-input');
    await manualInput.fill('7598765432109');
    await page.getByTestId('scanner-manual-submit').click();

    // The NOT_WHOLESALE message names the product — distinct from not-found.
    await expect(page.getByText(NOT_WHOLESALE_TEXT('Producto Sin Mayorista'))).toBeVisible();
    const badge = page.getByTestId('cart-badge');
    await expect(badge).toHaveText('0');
  });

  test('el switch "Todos" ON busca en todas las categorías; OFF restringe a la seleccionada', async ({ signedInPage }) => {
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
        const entries = JSON.parse(
          localStorage.getItem(productKey) ?? '[]',
        ) as [string, Record<string, unknown>][];
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
