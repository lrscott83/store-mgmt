import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import path from 'path';

/**
 * [S2-G2] Importar datos offline — E2E Playwright
 * docs/testing/e2e-stage-2/S2-G2.md
 *
 * Tests the data import UI: valid import, password validation,
 * file validation, and offline mode.
 *
 * Uses `owner-admin-with-products` persona (has seeded data).
 *
 * The import test first exports a valid backup via the export page,
 * then uploads it to the import page to verify the round-trip.
 */

// i18n literal strings from es.ts
const IMPORT_TITLE = 'Importar datos'; // SYNC.IMPORT_TITLE
const IMPORT_SUCCESS = 'Los datos se importaron correctamente.'; // SYNC.IMPORT_SUCCESS
const ERROR_NO_FILE = 'Selecciona un archivo de respaldo.'; // SYNC.ERROR_NO_FILE
const ERROR_EMPTY_PASSWORD = 'La contraseña no puede estar vacía.'; // SYNC.ERROR_EMPTY_PASSWORD

/**
 * Navigate to the import page and verify it loaded.
 */
async function navigateToImport(page: Page): Promise<void> {
  await page.goto('/sync/import');
  await expect(page.getByText(IMPORT_TITLE, { exact: true })).toBeVisible();
}

/**
 * Exports a valid backup file and returns its filesystem path.
 * Uses the export page to create a real encrypted ZIP.
 */
async function exportBackupFile(page: Page, password: string): Promise<string> {
  await page.goto('/sync/export');
  await expect(page.getByText('Exportar datos', { exact: true })).toBeVisible();

  await page.locator('#export-password').fill(password);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const download = await downloadPromise;

  const downloadPath = await download.path();
  return downloadPath!;
}

test.describe.serial('S2-G2 — Importar datos offline', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ persona: 'owner-admin-with-products' });

  test('seleccionar archivo y contraseña válida importa los datos', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // First, export a valid backup
    const backupPath = await exportBackupFile(page, 'import-test-123');

    // Navigate to import page
    await navigateToImport(page);

    // Upload the exported file
    await page.locator('#import-file').setInputFiles(backupPath);

    // Enter the password
    await page.locator('#import-password').fill('import-test-123');

    // Click import
    await page.getByRole('button', { name: 'Importar' }).click();

    // Success toast should appear
    await expect(page.getByText(IMPORT_SUCCESS)).toBeVisible();
  });

  test('sin archivo seleccionado muestra error', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToImport(page);

    // Enter password but no file
    await page.locator('#import-password').fill('some-password');
    await page.getByRole('button', { name: 'Importar' }).click();

    // Error should appear
    await expect(page.getByText(ERROR_NO_FILE)).toBeVisible();
  });

  test('contraseña vacía muestra error', async ({ signedInPage }) => {
    const { page } = signedInPage;

    await navigateToImport(page);

    // Create a dummy file to upload (we need a file to pass the file check)
    // Use a temp file approach: create a small ZIP in the browser
    const dummyZip = await page.evaluate(() => {
      // Create a minimal valid ZIP file (PK\x03\x04 header + empty content)
      const bytes = new Uint8Array([
        0x50, 0x4b, 0x03, 0x04, // PK\x03\x04 local file header
        0x0a, 0x00,             // version needed
        0x00, 0x00,             // flags
        0x00, 0x00,             // compression: none
        0x00, 0x00,             // mod time
        0x00, 0x00,             // mod date
        0x00, 0x00, 0x00, 0x00, // CRC-32
        0x00, 0x00, 0x00, 0x00, // compressed size
        0x00, 0x00, 0x00, 0x00, // uncompressed size
        0x00, 0x00,             // filename length
        0x00, 0x00,             // extra field length
      ]);
      return Array.from(bytes);
    });

    // Write the dummy ZIP to a temp file
    const fs = await import('fs/promises');
    const tmpFile = path.join(process.cwd(), 'test-results', 'dummy-import.zip');
    await fs.mkdir(path.dirname(tmpFile), { recursive: true });
    await fs.writeFile(tmpFile, Buffer.from(dummyZip));

    // Upload the dummy file
    await page.locator('#import-file').setInputFiles(tmpFile);

    // Leave password empty and submit
    await page.getByRole('button', { name: 'Importar' }).click();

    // Error should appear
    await expect(page.getByText(ERROR_EMPTY_PASSWORD)).toBeVisible();

    // Clean up
    await fs.unlink(tmpFile).catch(() => {});
  });

  test('la operación funciona correctamente en modo offline', async ({ signedInPage }) => {
    const { page } = signedInPage;

    // Export a backup first (while online)
    const backupPath = await exportBackupFile(page, 'offline-import-123');

    // Navigate to import page
    await navigateToImport(page);

    // Go offline
    await page.context().setOffline(true);

    // Upload the file and enter password
    await page.locator('#import-file').setInputFiles(backupPath);
    await page.locator('#import-password').fill('offline-import-123');

    // Import should work offline (all data is in localStorage)
    await page.getByRole('button', { name: 'Importar' }).click();

    // Success toast should appear
    await expect(page.getByText(IMPORT_SUCCESS)).toBeVisible();

    await page.context().setOffline(false);
  });
});
