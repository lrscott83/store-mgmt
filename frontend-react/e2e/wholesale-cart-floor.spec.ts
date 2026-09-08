import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * wholesale-cart-floor — E2E (2026-09-07)
 *
 * Mayorista cart floor rule + tier repricing:
 * 1. The − button cannot leave a wholesale line below the FIRST tier's
 *    minimum — when packs-1 < minPacks, the line is REMOVED from the cart
 *    (the first-tier minimum is the smallest sellable amount).
 * 2. When ± moves the pack count across tiers, the line's unit price is
 *    recalculated to the applicable tier's price.
 *
 * Uses the `owner-admin-with-products` persona; wholesale config is seeded
 * via the localStorage seam (same as mayorista-sale.spec.ts):
 * packSize 24, tiers minPacks 5 → $6, minPacks 12 → $5, retail $10.
 *
 * With minPacks 5 as the floor: adding 5 packs then pressing − four times
 * walks 5→4 (removed! — wait, no: the floor rule removes only when the
 * result would fall BELOW the minimum, i.e. below 5 packs). So the walk is:
 * 12 packs (tier 12, $5) → −1 = 11 packs (tier 5, $6, repriced) → keep
 * pressing − down to 5 packs → one more − removes the line.
 */

const WHOLESALE_HEADER = 'Ventas Mayoristas'; // SALES.WHOLESALE.HEADER
const ADDED_TEXT = 'adicionado a la venta mayorista'; // SALES.WHOLESALE.ADDED
const EMPTY_CART_TEXT =
  'La venta no tiene ningún producto. Usted debe adicionar algún producto a la venta para pagar.'; // SHOPPING_CART.DON_NOT_PAY_EMPTY_CART

/**
 * Seeds wholesale config (packSize 24, minPacks 5 → $6, minPacks 12 → $5)
 * + inventory on the first sellable product. Returns name + id.
 */
async function seedWholesale(
  page: Page,
  storeId: string,
): Promise<{ name: string; id: string } | null> {
  return page.evaluate(
    ({ sid }) => {
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
        quantity: 1000,
        available: 1000,
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
    { sid: storeId },
  );
}

/** Opens the wholesale screen with the seeded product re-read from storage. */
async function openWholesaleSeeded(
  page: Page,
  storeId: string,
): Promise<{ name: string; id: string }> {
  await page.goto('/sales/wholesale');
  await expect(page.getByText(WHOLESALE_HEADER)).toBeVisible();
  const seeded = await seedWholesale(page, storeId);
  expect(seeded).not.toBeNull();
  const product = seeded as { name: string; id: string };
  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/wholesale');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId(`wholesale-packs-input-${product.id}`)).toBeVisible();
  return product;
}

/** Adds `packs` of the product and opens the cart panel. */
async function addPacksAndOpenCart(page: Page, productId: string, packs: string): Promise<void> {
  await page.getByTestId(`wholesale-packs-input-${productId}`).fill(packs);
  await page.getByTestId(`wholesale-add-${productId}`).click();
  await expect(page.getByText(ADDED_TEXT)).toBeVisible();
  const badge = page.getByTestId('cart-badge');
  await expect(badge).not.toHaveText('0');
  await badge.locator('..').click();
}

test.describe.serial('wholesale cart — floor del menor rango y re-precificación por rango', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('− no baja del menor rango: al quedar por debajo, la línea se elimina del carrito', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    const product = await openWholesaleSeeded(page, selectedStoreId);

    // 12 paquetes (rango 12 → $5): 12 × 24 × $5 = $1 440.
    await addPacksAndOpenCart(page, product.id, '12');

    const badge = page.getByTestId('cart-badge');
    await expect(badge).toHaveText('12');

    // − hasta el mínimo: 12 → 5 paquetes (7 clicks). Cada − baja un pack.
    const decrease = page.getByRole('button', { name: /disminuir cantidad de/i });
    for (let i = 0; i < 7; i++) {
      await decrease.click();
    }
    await expect(badge).toHaveText('5');

    // Un − más: 5-1 = 4 < minPacks 5 → la línea se ELIMINA del carrito.
    await decrease.click();
    await expect(page.getByText(EMPTY_CART_TEXT)).toBeVisible();
    await expect(badge).toHaveText('0');
  });

  test('± cruza de rango y el precio de la línea se recalcula al rango aplicable', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    const product = await openWholesaleSeeded(page, selectedStoreId);

    // 12 paquetes → rango 12 ($5/ud). La línea muestra el PRECIO DEL PAQUETE:
    // $5 × 24 = $120.
    await addPacksAndOpenCart(page, product.id, '12');
    await expect(page.getByText(/Paquetes: 12/)).toBeVisible();
    await expect(page.getByText(/Precio: \$120/)).toBeVisible();

    // − → 11 paquetes cae al rango 5 ($6/ud): precio de paquete $6 × 24 = $144.
    const decrease = page.getByRole('button', { name: /disminuir cantidad de/i });
    await decrease.click();
    await expect(page.getByText(/Paquetes: 11/)).toBeVisible();
    await expect(page.getByText(/Precio: \$144/)).toBeVisible();

    // + → 12 paquetes vuelve al rango 12 ($5/ud): precio de paquete $120.
    const increase = page.getByRole('button', { name: /aumentar cantidad de/i });
    await increase.click();
    await expect(page.getByText(/Paquetes: 12/)).toBeVisible();
    await expect(page.getByText(/Precio: \$120/)).toBeVisible();
  });
});
