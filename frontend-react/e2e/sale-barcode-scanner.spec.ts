import { test, expect } from './support/test';

/**
 * sale-barcode-scanner — E2E (React-only feature, no Angular correlate)
 *
 * 2026-09-07 redesign: the scanner modal dropped the manual barcode form
 * (the old E2E-testable path), its + submit button and the "Listo" button.
 * In their place sits a quantity stepper (default 1, cart-style round −/+
 * buttons) whose value each decoded scan multiplies. The camera decode
 * itself cannot run under Playwright (no fake camera device; zxing needs
 * real frames), so the add-to-cart flow is pinned by the unit suite
 * (sale.test.tsx — onScanned(barcode, quantity) contract through a
 * ScannerModal mock; scanner-modal.test.tsx — stepper behavior).
 *
 * What this E2E still proves end-to-end: the scanner entry point opens the
 * real modal on the sale view, the redesigned modal renders the quantity
 * stepper with NO manual form, the stepper's −/+ buttons behave (floor 1),
 * and closing works through the X button.
 */

const SALE_HEADER = 'Productos para vender'; // SALES.HEADER, es.ts
const SCANNER_TITLE = 'Escanear producto'; // SCANNER.TITLE, es.ts

test.describe('sale-barcode-scanner — modal redesign (quantity stepper, no manual form)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('the scanner entry point opens the redesigned modal with the quantity stepper', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await page.goto('/sales/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(SALE_HEADER)).toBeVisible();

    const scannerButton = page.getByTestId('quick-sale-scanner');
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

    // The −/+ buttons behave: + increments, − floors at 1.
    await page.getByTestId('scanner-quantity-increase').click();
    await expect(quantityInput).toHaveValue('2');
    await page.getByTestId('scanner-quantity-increase').click();
    await expect(quantityInput).toHaveValue('3');
    await page.getByTestId('scanner-quantity-decrease').click();
    await expect(quantityInput).toHaveValue('2');
    await page.getByTestId('scanner-quantity-decrease').click();
    await expect(quantityInput).toHaveValue('1');
    await expect(page.getByTestId('scanner-quantity-decrease')).toBeDisabled();

    // Closing via X removes the modal.
    await page.getByTestId('scanner-close').click();
    await expect(page.getByTestId('scanner-modal')).toHaveCount(0);
  });
});
