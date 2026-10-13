import { test, expect } from './support/test';
import { mintStoreWithoutMultiMonedas } from './support/store-without-multimonedas';

/**
 * [FC-A5] Dashboard de estadísticas — métricas con valores — E2E Playwright
 * docs/testing/frontend-coverage/FC-A5.md
 *
 * Verifies the dashboard KPI cards, currency toggle, trend indicators,
 * charts, and top products with actual data.
 *
 * Uses `owner-admin-with-products` persona which has sales, expenses,
 * credits, and products data.
 *
 * EXCEPTION (birth plan Superior, owner decision 2026-10-13): the legacy
 * "Moneda: CUP/USD + tasa" toggle lives in its OWN describe below. It renders
 * only without MultiMonedas (`dashboard.tsx:257`, `legacyCurrencySelector =
 * !multiMonedas && …`), and since `store-birth-superior` a newly registered
 * store already carries module 15 — so the persona's store can no longer
 * satisfy that precondition by accident.
 */

const DASHBOARD_HEADER = 'Panel de Control';
const DASHBOARD_PATH = '/stats/dashboard';

test.describe.serial('FC-A5 — Dashboard: métricas con valores', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test.beforeEach(async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.goto(DASHBOARD_PATH);
    await expect(page.getByText(DASHBOARD_HEADER)).toBeVisible();
  });

  test('KPI cards: Ventas, Gastos, Créditos, Ganancias son visibles', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Ventas KPI card (precise locator — "Ventas" is also the chart section title)
    await expect(page.getByTestId('kpi-sales')).toBeVisible();
    // The card shows a value with the currency code (e.g. "0 CUP")
    await expect(page.getByTestId('kpi-sales-value')).toBeVisible();
    await expect(page.getByTestId('kpi-sales-value')).toHaveText(/\d/);

    // Gastos KPI card (with expenses module)
    await expect(page.getByTestId('kpi-expenses')).toBeVisible();

    // Créditos por cobrar KPI card (with credits module)
    await expect(page.getByTestId('kpi-credits')).toBeVisible();

    // Ganancias KPI card
    await expect(page.getByTestId('kpi-netProfit')).toBeVisible();
  });

  test('trend indicators show glyph (▲, ▼, or –) and "vs anterior" text', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    // Each KPI card has a trend line with "vs anterior"
    const trendTexts = page.locator('small:has-text("vs anterior")');
    await expect(trendTexts.first()).toBeVisible();

    // Should have 4 trend indicators (one per KPI card)
    const count = await trendTexts.count();
    expect(count).toBeGreaterThanOrEqual(3); // at least 3 (Ventas, Gastos, Ganancias)
  });

  test('sales and profit charts render with data or empty state', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Sales chart section — text from STATISTICS.SALES.TITLE
    await expect(page.getByText('Ventas').first()).toBeVisible();

    // Profit chart section — text from STATISTICS.PROFIT.TITLE
    await expect(page.getByText('Ganancia bruta').first()).toBeVisible();

    // Either chart has data or shows empty state message
    const hasContent = (await page.locator('canvas, svg, .recharts-surface').count()) > 0;
    const hasEmptyState = (await page.getByText('Sin datos').count()) > 0;

    expect(hasContent || hasEmptyState).toBeTruthy();
  });

  test('top products lists render', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Top profit products (stable title; the range is a separate element)
    await expect(page.getByText('Productos mayor ganancias')).toBeVisible();

    // Top sold products
    await expect(page.getByText('Productos más vendidos')).toBeVisible();
  });
});

/**
 * The legacy CUP/USD + exchange-rate toggle — the pre-MultiMonedas dashboard.
 * `dashboard.tsx:74-80, 213-225, 257` documents it as the surface that exists
 * ONLY without module 15 (with the module the amounts are grouped per currency
 * and the selector is not rendered at all), so the precondition is BUILT with
 * `disableStoreModule` instead of being assumed from the birth plan. Every
 * assertion is the one the shared-persona version made.
 */
test.describe('FC-A5 — Dashboard: toggle de moneda legado (sin MultiMonedas)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('currency toggle switches from CUP to USD', async ({ page }) => {
    await mintStoreWithoutMultiMonedas(page);

    await page.goto(DASHBOARD_PATH);
    await expect(page.getByText(DASHBOARD_HEADER)).toBeVisible();

    // Default currency is CUP
    const currencySelect = page.locator('#dashboard-currency');
    await expect(currencySelect).toHaveValue('CUP');

    // Switch to USD
    await currencySelect.selectOption('USD');

    // A rate input should appear
    const rateInput = page.locator('input[type="number"][placeholder*="USD"]');
    await expect(rateInput).toBeVisible();

    // All KPI values should show "vs anterior" trend text
    await expect(page.locator('small:has-text("vs anterior")').first()).toBeVisible();
  });
});
