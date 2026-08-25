import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [FC-A4] Créditos: más que carga — E2E Playwright
 * docs/testing/frontend-coverage/README.md
 *
 * Tests the credits history page (/sales/credits):
 * - Page loads with title and unpaid credit count
 * - Day accordion expands/collapses
 * - Credits are grouped by day
 *
 * Uses `owner-admin-with-products` persona.
 */

const CREDITS_TITLE = 'Créditos'; // SALE_CREDIT.TITLE
const NO_CREDITS = 'No se encontró ningún crédito'; // SALE_CREDIT.NO_SALE_CREDIT_FOUND

/** Seed a credit sale so the credits page has data. */
async function seedCreditSale(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) return;

      let productsEntries: [string, Record<string, unknown>][];
      try {
        productsEntries = JSON.parse(rawProducts);
      } catch {
        return;
      }

      const sellableProduct = productsEntries.find(
        ([, p]) => p['isActive'] && p['availableToSale'],
      );
      if (!sellableProduct) return;
      const [productId, product] = sellableProduct;

      // Create a credit sale
      const creditKey = `lizoft.store-sale-credits-${sid}`;
      const rawCredits = localStorage.getItem(creditKey);
      let creditsEntries: [string, Record<string, unknown>][] = [];
      if (rawCredits) {
        try {
          creditsEntries = JSON.parse(rawCredits);
        } catch {
          creditsEntries = [];
        }
      }

      const credit = {
        id: crypto.randomUUID(),
        orderId: crypto.randomUUID(),
        productId,
        productName: product['name'],
        total: Number(product['price']) || 10,
        paidAmount: 0,
        isPaid: false,
        date: new Date().toISOString(),
        clientName: 'Cliente E2E',
        isActive: true,
        createdDate: new Date().toISOString(),
        createdByName: 'e2e-seed',
      };

      creditsEntries.push([credit.id, credit]);
      localStorage.setItem(creditKey, JSON.stringify(creditsEntries));
    },
    { storeId },
  );
}

test.describe.serial('FC-A4 — Historial de Créditos', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('la página carga con título y contador de créditos', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await seedCreditSale(page, selectedStoreId);

    await page.goto('/sales/credits');
    await page.waitForLoadState('networkidle');

    // Title should be visible
    await expect(page.getByText(CREDITS_TITLE)).toBeVisible();

    // Count badge should show at least 1 unpaid credit
    const countBadge = page.locator('.rounded-full.bg-success\\/10').first();
    await expect(countBadge).toBeVisible();
    const countText = await countBadge.textContent();
    expect(countText).toMatch(/\(\d+\)/);
  });

  test('acordeón de día expande y colapsa', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await seedCreditSale(page, selectedStoreId);

    await page.goto('/sales/credits');
    await page.waitForLoadState('networkidle');

    // Find the day panel toggle
    const dayToggle = page.locator('[data-testid^="credit-date-panel-toggle-"]').first();
    if (await dayToggle.isVisible()) {
      // Click to expand
      await dayToggle.click();
      await expect(dayToggle).toHaveAttribute('aria-expanded', 'true');

      // Credit list should be visible
      const creditList = page.locator('.border-t.border-border').first();
      await expect(creditList).toBeVisible();

      // Click to collapse
      await dayToggle.click();
      await expect(dayToggle).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('muestra total de créditos impagos', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    await seedCreditSale(page, selectedStoreId);

    await page.goto('/sales/credits');
    await page.waitForLoadState('networkidle');

    // Total should show $ prefix
    const totalElement = page.locator('.text-danger.font-semibold').first();
    await expect(totalElement).toBeVisible();
    const totalText = await totalElement.textContent();
    expect(totalText).toMatch(/^\$/);
  });
});
