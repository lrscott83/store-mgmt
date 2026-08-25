import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [FC-A2] Reporte del día (/reports/today) — E2E Playwright
 * docs/testing/frontend-coverage/README.md
 *
 * Tests the today report page: loads with summary metrics,
 * shows sales summary section, and PDF export button is present.
 *
 * Uses `owner-admin-with-products` persona.
 */

const REPORT_TITLE = 'Reportes de hoy'; // REPORTS.TODAY.TITLE
const SALES_SUMMARY = 'Resumen de ventas'; // REPORTS.SALES_SUMMARY.TITLE
const ORDER_COUNT = 'Pedidos'; // REPORTS.SALES_SUMMARY.ORDER_COUNT
const TOTAL_REVENUE = 'Ingresos'; // REPORTS.SALES_SUMMARY.TOTAL_REVENUE
const TOTAL_COST = 'Costo'; // REPORTS.SALES_SUMMARY.TOTAL_COST
const TOTAL_PROFIT = 'Ganancia bruta'; // REPORTS.SALES_SUMMARY.TOTAL_PROFIT
const PDF_BUTTON = 'Inventario a precio de venta'; // REPORT.INVENTORY_TODAY_SALE

test.describe.serial('FC-A2 — Reporte del día', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('la página carga con título y resumen de ventas', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/reports/today');
    await page.waitForLoadState('networkidle');

    // Title should be visible
    await expect(page.getByText(REPORT_TITLE)).toBeVisible();

    // Sales summary section should be present
    await expect(page.getByText(SALES_SUMMARY)).toBeVisible();

    // All 4 metric cards should be visible
    await expect(page.getByText(ORDER_COUNT)).toBeVisible();
    await expect(page.getByText(TOTAL_REVENUE)).toBeVisible();
    await expect(page.getByText(TOTAL_COST)).toBeVisible();
    await expect(page.getByText(TOTAL_PROFIT)).toBeVisible();
  });

  test('los valores de métricas muestran formato de moneda', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/reports/today');
    await page.waitForLoadState('networkidle');

    // Revenue, Cost, and Profit should show $ prefix
    const revenueValue = page.locator('text=$').first();
    await expect(revenueValue).toBeVisible();

    // All metric values should be visible (even if 0)
    const metricCards = page.locator('.rounded.bg-gray-50.p-3.text-center');
    const count = await metricCards.count();
    expect(count).toBe(4); // orderCount, revenue, cost, profit
  });

  test('botón de exportar PDF está presente', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/reports/today');
    await page.waitForLoadState('networkidle');

    // PDF export button should be visible
    const pdfButton = page.getByRole('button', { name: PDF_BUTTON });
    await expect(pdfButton).toBeVisible();
  });
});
