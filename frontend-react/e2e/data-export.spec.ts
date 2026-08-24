import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [S2-G1] Exportar datos offline — E2E Playwright
 * docs/testing/e2e-stage-2/S2-G1.md
 *
 * Tests the data export UI: download a ZIP file, password validation,
 * and offline mode.
 *
 * Uses `owner-admin-with-products` persona (has seeded data to export).
 */

// i18n literal strings from es.ts
const EXPORT_TITLE = 'Exportar datos'; // SYNC.EXPORT_TITLE
const PASSWORD_EMPTY_ERROR = 'La contraseña no puede estar vacía.'; // SYNC.ERROR_EMPTY_PASSWORD

/**
 * Navigate to the export page and verify it loaded.
 */
async function navigateToExport(page: Page): Promise<void> {
  await page.goto('/sync/export');
  await expect(page.getByText(EXPORT_TITLE, { exact: true })).toBeVisible();
}

test.describe.serial('S2-G1 — Exportar datos offline', () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('la exportación descarga un archivo ZIP con firma válida', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToExport(page);

    // Fill the password field
    await page.locator('#export-password').fill('test-password-123');

    // Wait for the download event before clicking export
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar' }).click();

    const download = await downloadPromise;

    // Verify the filename matches the expected pattern: datosYYMMDD-HHMM.zip
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^datos\d{6}-\d{4}\.zip$/);

    // Read the downloaded file and verify it starts with ZIP signature
    const buffer = await download.path().then(async (p) => {
      const fs = await import('fs/promises');
      return fs.readFile(p!);
    });

    // ZIP files start with PK\x03\x04 (local file header)
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });

  test('contraseña vacía muestra error sin descargar', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToExport(page);

    // Leave password empty and click export
    await page.getByRole('button', { name: 'Exportar' }).click();

    // Error message should appear
    await expect(page.getByText(PASSWORD_EMPTY_ERROR)).toBeVisible();

    // No download should have been triggered — verify the button is still enabled
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeEnabled();
  });

  test('la operación funciona correctamente en modo offline', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToExport(page);

    // Go offline
    await page.context().setOffline(true);

    // Fill the password and export
    await page.locator('#export-password').fill('offline-test-123');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar' }).click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^datos\d{6}-\d{4}\.zip$/);

    await page.context().setOffline(false);
  });
});
