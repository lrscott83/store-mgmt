import { readFileSync } from 'node:fs';
import { test, expect } from './support/test';

/**
 * roster-any-filename (full-flow E2E, against the real backend): the REAL
 * export from the admin panel downloads an activation file, the user
 * RENAMES it, and the renamed file activates a fresh device through the
 * login screen's modal. One test, both ends of the contract:
 *   - the export writes the plaintext `meta.json` envelope inside the
 *     archive (without it, the renamed import cannot resolve the storeId);
 *   - the import reads the envelope, not the name.
 *
 * Requires the same backend as every signedInPage spec (`E2E_API_URL`),
 * and it consumes `GET /v1/storeusers/{storeId}/offline-roster` for real —
 * the roster downloaded here belongs to the persona's own store, so nothing
 * outside it is touched.
 */

const EXPORT_TEXT = 'Exportar roster sin conexión'; // es.ts (USERS.EXPORT_ROSTER)
const CONFIRM_TEXT = 'Confirmar'; // es.ts (GENERAL.CONFIRM)
const ENABLE_BUTTON = 'Activar acceso sin conexión'; // es.ts (OFFLINE_ACCESS.ENABLE_BUTTON)
const MODAL_TITLE = 'Activar acceso sin conexión'; // es.ts (OFFLINE_ACCESS.MODAL_TITLE)
const MODAL_SUBMIT = 'Activar'; // es.ts (OFFLINE_ACCESS.SUBMIT)
const DISABLE_BUTTON = 'Desactivar acceso sin conexión'; // es.ts

const ROSTER_STORAGE_KEY = 'lizoft.offline-roster'; // roster-store.ts:19

/** The master password the export is asked for and the import re-enters. */
const MASTER_PASSWORD = 'MasterE2E123';

test.describe('roster-any-filename — export real, renombrar, activar', () => {
  test('el archivo exportado, renombrado, activa otro dispositivo', async ({ signedInPage }) => {
    const { page, selectedStoreId } = signedInPage;

    // ---------------------------------------------------------------
    // 1. REAL EXPORT: admin panel → password → download.
    // ---------------------------------------------------------------
    await page.goto('/management/users');

    await page.getByRole('button', { name: EXPORT_TEXT }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('#roster-export-master').fill(MASTER_PASSWORD);

    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: CONFIRM_TEXT }).click();
    const download = await downloadPromise;

    // The export still downloads under its conventional name — that name is
    // now informational, not load-bearing.
    expect(download.suggestedFilename()).toBe(`roster-${selectedStoreId}.smcabundle`);

    const exportPath = await download.path();
    expect(exportPath).toBeTruthy();
    const archiveBytes = readFileSync(exportPath!);

    // ---------------------------------------------------------------
    // 2. RENAME: the user renames the file to something the old
    //    filename contract would have rejected.
    // ---------------------------------------------------------------
    const renamedName = 'activacion-de-mi-tienda.smcabundle';

    // ---------------------------------------------------------------
    // 3. LOGOUT: back to the login screen (guest-only route guard), the
    //    same device becomes "another device" once its roster is gone.
    // ---------------------------------------------------------------
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL(/\/login$/);

    // Precondition: this device holds NO roster (the signed-in persona
    // device never imported one) — the enable button is what shows.
    await expect(
      page.getByRole('button', { name: ENABLE_BUTTON, exact: true }),
    ).toBeVisible();

    // ---------------------------------------------------------------
    // 4. IMPORT THE RENAMED FILE through the login modal.
    // ---------------------------------------------------------------
    await page.getByRole('button', { name: ENABLE_BUTTON, exact: true }).click();
    await expect(page.getByRole('heading', { name: MODAL_TITLE, exact: true })).toBeVisible();

    await page.locator('#offline-access-file').setInputFiles({
      name: renamedName,
      mimeType: 'application/octet-stream',
      buffer: archiveBytes,
    });
    await page.locator('#offline-access-password').fill(MASTER_PASSWORD);
    await page.getByRole('button', { name: MODAL_SUBMIT, exact: true }).click();

    // The modal closing is the one signal that importRosterFile succeeded
    // — under the old contract this is exactly where "No pudimos reconocer
    // el archivo..." appeared.
    await expect(page.getByRole('heading', { name: MODAL_TITLE, exact: true })).toHaveCount(0, {
      timeout: 20_000,
    });

    // ---------------------------------------------------------------
    // 5. The roster in localStorage is the export's (bundleId matches what
    //    the backend minted — same store, same bundle the download carried).
    // ---------------------------------------------------------------
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ROSTER_STORAGE_KEY,
    );
    expect(stored).not.toBeNull();
    const bundle = JSON.parse(stored!) as { bundleId: string; storeId: string };
    expect(bundle.storeId).toBe(selectedStoreId);
    expect(bundle.bundleId).toBeTruthy();

    // The panel flipped: provisioned.
    await expect(page.getByRole('button', { name: DISABLE_BUTTON, exact: true })).toBeVisible();
  });
});
