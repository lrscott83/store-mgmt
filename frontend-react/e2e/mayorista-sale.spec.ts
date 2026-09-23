import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import {
  applyWholesaleSnapshot,
  mintWholesaleSuperiorOwner,
  type WholesaleSnapshot,
} from './support/store-wholesale-fixture';

/**
 * Ventas Mayoristas — E2E Playwright (plan 2026-09-04-wholesale-sales-plan.md)
 *
 * Covers the wholesale flow: a product configured with wholesale config
 * (packSize 24, tiered unit prices) is sold by PACKS from /sales/wholesale,
 * the cart receives UNITS (packs × packSize) with OrderType.Mayorista and the
 * tiered unit price, and the created order lands in today's orders.
 *
 * Scenarios:
 *  1. base flow: 12 packs → 288 units → cash order in today's orders
 *  2. payment method: a CUP Transferencia sale is filterable by payment type
 *     (Zelle ya no es elegible en el carrito para ventas CUP — catálogo del
 *     plan 2026-09-17: CUP → Efectivo · Transferencia (CUP)).
 *  3. credit: wholesale credit with client → SaleCredit in today's credits
 *  4. inventory: requesting more units than available blocks the sale
 *
 * Uses the NEW private Superior-owner persona (store-wholesale-fixture.ts:
 * plan-upgraded store with module 12/feature 39 — wholesale is Superior/VIP
 * only as of 2026-09-23) whose seeded product is plaintext in localStorage,
 * and seeds the wholesale config + inventory via page.evaluate — same seam
 * create-sale.spec.ts uses.
 *
 * Product seed: retail price $10, wholesale packSize 24, tiers
 * minPacks 1 → $9, minPacks 11 → $8. 12 packs → 288 units at $8 → $2,304;
 * 1 pack → 24 units at $9 → $216.
 */

const WHOLESALE_HEADER = 'Ventas Mayoristas'; // SALES.WHOLESALE.HEADER
const ADDED_TEXT = 'adicionado a la venta mayorista'; // SALES.WHOLESALE.ADDED
const REGISTER_TEXT = 'Registrar'; // SHOPPING_CART.REGISTER
const ORDER_CREATED_TEXT = 'La venta fue creada satisfactoriamente.'; // SHOPPING_CART.ORDER_CREATED
const TODAY_ORDERS_HEADER = 'Ventas del día'; // TODAY_ORDERS.HEADER
const TODAY_CREDITS_HEADER = 'Créditos del día'; // SALE_CREDIT.TODAY_CREDITS
const NO_ORDER_FOUND = 'No se ha realizado ninguna venta en el día de hoy.'; // TODAY_STATS.NO_ORDER_FOUND
const NO_CREDIT_FOUND = 'No existe ningún crédito en el día'; // SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY
const QUANTITY_NOT_AVAILABLE = 'La cantidad del producto no está disponible en el inventario.'; // ProductErrors.ProductQuantityNotAvailable

interface SeededProduct {
  name: string;
  id: string;
}

/**
 * Seeds wholesale config + an inventory entry for the first sellable product,
 * so the wholesale screen lists it and the availability gate sees `available`
 * units. Returns the product name + id.
 */
async function seedWholesaleProduct(
  page: Page,
  storeId: string,
  available = 1000,
  tiers?: { minPacks: number; pricePerUnit: number }[],
): Promise<SeededProduct | null> {
  return page.evaluate(
    ({ sid, units, customTiers }) => {
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

      // Wholesale config: pack of 24, $9 from 1 pack, $8 from 11 packs (retail $10).
      // Custom tiers (e.g. first tier > 1) win when provided.
      product['wholesaleEnabled'] = true;
      product['wholesalePackSize'] = 24;
      product['wholesaleTiers'] = customTiers ?? [
        { minPacks: 1, pricePerUnit: 9 },
        { minPacks: 11, pricePerUnit: 8 },
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
      const entry = {
        id: crypto.randomUUID(),
        productId,
        categoryId: '',
        quantity: units,
        available: units,
        costPrice: 5,
        date: new Date().toISOString(),
        order: 0,
        isActive: true,
        createdDate: new Date().toISOString(),
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
    { sid: storeId, units: available, customTiers: tiers },
  );
}

/**
 * Opens the wholesale screen, seeds the product and navigates away/back so the
 * app re-reads products + inventory from localStorage.
 */
async function openWholesaleWithSeededProduct(
  page: Page,
  storeId: string,
  available = 1000,
  tiers?: { minPacks: number; pricePerUnit: number }[],
): Promise<SeededProduct> {
  await page.goto('/sales/wholesale');
  await expect(page.getByText(WHOLESALE_HEADER)).toBeVisible();
  const seeded = await seedWholesaleProduct(page, storeId, available, tiers);
  expect(seeded).not.toBeNull();
  const product = seeded as SeededProduct;

  await page.goto('/profile/edit');
  await page.waitForLoadState('networkidle');
  await page.goto('/sales/wholesale');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(WHOLESALE_HEADER)).toBeVisible();
  // The seeded category and product share the same name (store-seed.ts:33,44), and the
  // category-tabs row added 2026-09-05 renders that name a SECOND time — the product's
  // own packs input is the unambiguous proof the product is listed (used below anyway).
  await expect(page.getByTestId(`wholesale-packs-input-${product.id}`)).toBeVisible();
  return product;
}

/** Adds `packs` of the product to the Mayorista cart and opens the cart panel. */
async function addWholesalePacksAndOpenCart(
  page: Page,
  product: SeededProduct,
  packs: string,
): Promise<void> {
  await page.getByTestId(`wholesale-packs-input-${product.id}`).fill(packs);
  await page.getByTestId(`wholesale-add-${product.id}`).click();
  await expect(page.getByText(ADDED_TEXT)).toBeVisible();
  const badge = page.getByTestId('cart-badge');
  await expect(badge).not.toHaveText('0');
  await badge.locator('..').click();
}

let wholesaleOwner: WholesaleSnapshot;

test.describe.serial('Ventas Mayoristas — flujo completo', () => {
  test.describe.configure({ timeout: 120_000 });

  // Mint the private Superior owner once (2 registrations + 3-4 logins + 1
  // plaintext product seed); snapshots are replayed per test, zero logins.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    wholesaleOwner = await mintWholesaleSuperiorOwner(browser);
  });

  test('configurar producto mayorista y vender 12 paquetes como 288 unidades', async ({
    page,
  }) => {
    await applyWholesaleSnapshot(page, wholesaleOwner);
    const selectedStoreId = wholesaleOwner.selectedStoreId;

    const product = await openWholesaleWithSeededProduct(page, selectedStoreId);

    // Enter 12 packs → live quote 12 × 24 × 8 = 2 304.
    await page.getByTestId(`wholesale-packs-input-${product.id}`).fill('12');
    const quote = page.getByTestId(`wholesale-quote-${product.id}`);
    await expect(quote).toContainText('12 × 24 ×');

    // Add to the (Mayorista) cart and register a cash sale.
    await addWholesalePacksAndOpenCart(page, product, '12');
    const registerButton = page.getByRole('button', { name: REGISTER_TEXT });
    await expect(registerButton).toBeEnabled();
    const paymentInput = page.getByRole('spinbutton', { name: 'Pago' });
    await paymentInput.fill('2304');
    await registerButton.click();

    // Success toast — order created.
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();

    // The order lands in today's orders: per-hour summary shows (288 units, $2 304).
    await page.goto('/sales/today-orders');
    await expect(page.getByText(TODAY_ORDERS_HEADER)).toBeVisible();
    await expect(page.getByText(NO_ORDER_FOUND)).toHaveCount(0);
    const hourSummary = page.getByRole('button', { name: /288/ });
    await expect(hourSummary).toBeVisible();
    await expect(hourSummary).toContainText('2 304');

    // Expand the hour panel → the item row shows the product sold.
    await hourSummary.click();
    await expect(page.getByText(product.name)).toBeVisible();
  });

  test('venta mayorista con Transferencia (CUP) queda filtrable por método de pago', async ({
    page,
  }) => {
    await applyWholesaleSnapshot(page, wholesaleOwner);
    const selectedStoreId = wholesaleOwner.selectedStoreId;

    const product = await openWholesaleWithSeededProduct(page, selectedStoreId);

    // 1 pack → 24 units × $9 = $216, pagada con Transferencia (CUP) — el método
    // no-efectivo disponible en el carrito para ventas CUP (catálogo 2026-09-17).
    await addWholesalePacksAndOpenCart(page, product, '1');
    await page.getByTestId('payment-method-2').check(); // SalePaymentMethod.Transferencia

    const registerButton = page.getByRole('button', { name: REGISTER_TEXT });
    await expect(registerButton).toBeEnabled();
    await registerButton.click();
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();

    // En Ventas del día, el filtro dinámico (2026-09-19) ofrece Transferencia (CUP)
    // — la única venta del día es esta, así que es la única opción de método.
    await page.goto('/sales/today-orders');
    await expect(page.getByText(TODAY_ORDERS_HEADER)).toBeVisible();
    await page.getByRole('radio', { name: 'Transferencia (CUP)' }).click();
    const transferSummary = page.getByRole('button', { name: /216/ });
    await expect(transferSummary).toBeVisible();

    // El método quedó persistido: la venta sigue filtrable bajo Transferencia (CUP).
    await expect(page.getByText(NO_ORDER_FOUND)).toHaveCount(0);
  });

  test('venta mayorista a crédito genera un crédito con el cliente', async ({ page }) => {
    await applyWholesaleSnapshot(page, wholesaleOwner);
    const selectedStoreId = wholesaleOwner.selectedStoreId;

    const product = await openWholesaleWithSeededProduct(page, selectedStoreId);

    // 1 pack → 24 units × $9 = $216, a crédito con cliente.
    await addWholesalePacksAndOpenCart(page, product, '1');
    const creditSwitch = page.getByRole('switch', { name: 'Crédito' });
    await expect(creditSwitch).toBeVisible();
    await creditSwitch.click();
    const clientInput = page.getByRole('textbox', { name: 'Cliente' });
    await clientInput.fill('Mayorista Test');

    await page.getByRole('button', { name: REGISTER_TEXT }).click();
    await expect(page.getByText(ORDER_CREATED_TEXT)).toBeVisible();

    // El crédito aparece en Créditos del día con el nombre del cliente.
    await page.goto('/sales/today-credits');
    await expect(page.getByText(TODAY_CREDITS_HEADER)).toBeVisible();
    await expect(page.getByText(NO_CREDIT_FOUND)).toHaveCount(0);
    await expect(page.getByText('Mayorista Test')).toBeVisible();
  });

  test('solicitar más unidades de las disponibles bloquea la venta mayorista', async ({
    page,
  }) => {
    await applyWholesaleSnapshot(page, wholesaleOwner);
    const selectedStoreId = wholesaleOwner.selectedStoreId;

    // Solo 100 unidades disponibles: 12 paquetes (288 unidades) no caben.
    const product = await openWholesaleWithSeededProduct(page, selectedStoreId, 100);

    await page.getByTestId(`wholesale-packs-input-${product.id}`).fill('12');
    await page.getByTestId(`wholesale-add-${product.id}`).click();

    // El gate de inventario (en unidades) bloquea con su mensaje…
    await expect(page.getByText(QUANTITY_NOT_AVAILABLE)).toBeVisible();

    // …y el carrito queda vacío.
    await expect(page.getByTestId('cart-badge')).toHaveText('0');
  });

  test('el icono de info abre el popup readonly con los rangos y precios', async ({
    page,
  }) => {
    await applyWholesaleSnapshot(page, wholesaleOwner);
    const selectedStoreId = wholesaleOwner.selectedStoreId;

    const product = await openWholesaleWithSeededProduct(page, selectedStoreId);

    await page.getByTestId(`wholesale-tiers-info-${product.id}`).click();

    // Popup SweetAlert2 con el título de rangos y las filas de precio.
    const popup = page.locator('.swal2-popup');
    await expect(page.getByText('Rangos de precio mayorista')).toBeVisible();
    await expect(popup.getByText(/Unidades por paquete: 24/)).toBeVisible();
    await expect(popup.getByText(/Desde 1 paquetes: \$9 por unidad/)).toBeVisible();
    await expect(popup.getByText(/Desde 11 paquetes: \$8 por unidad/)).toBeVisible();

    // Cerrar el popup para liberar el puntero (patrón del test de mínimo).
    await page.locator('.swal2-confirm').click();
    await expect(page.getByText('Rangos de precio mayorista')).toHaveCount(0);
  });

  test('una cantidad menor al primer rango se bloquea con el error de mínimo', async ({
    page,
  }) => {
    await applyWholesaleSnapshot(page, wholesaleOwner);
    const selectedStoreId = wholesaleOwner.selectedStoreId;

    // Primer rango en 6 paquetes ($6/ud): 3 paquetes no alcanzan el mínimo.
    const product = await openWholesaleWithSeededProduct(page, selectedStoreId, 1000, [
      { minPacks: 6, pricePerUnit: 6 },
      { minPacks: 12, pricePerUnit: 5 },
    ]);

    await page.getByTestId(`wholesale-packs-input-${product.id}`).fill('3');
    await page.getByTestId(`wholesale-add-${product.id}`).click();

    // El error de mínimo aparece y el carrito queda vacío.
    await expect(
      page.getByText(/cantidad mínima para la venta mayorista es de 6 paquetes/),
    ).toBeVisible();
    await expect(page.getByTestId('cart-badge')).toHaveText('0');

    // Cerrar el diálogo de error para liberar el puntero.
    await page.locator('.swal2-confirm').click();
    await expect(
      page.getByText(/cantidad mínima para la venta mayorista es de 6 paquetes/),
    ).toHaveCount(0);

    // Con exactamente el mínimo (6 paquetes) la venta sí procede.
    await page.getByTestId(`wholesale-packs-input-${product.id}`).fill('6');
    await page.getByTestId(`wholesale-add-${product.id}`).click();
    await expect(page.getByText(ADDED_TEXT)).toBeVisible();
    await expect(page.getByTestId('cart-badge')).not.toHaveText('0');
  });
});
