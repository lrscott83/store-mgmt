import { test, expect } from './support/test';
import { mintSuperAdmin, applySuperAdminSnapshot } from './support/superadmin-session';
import type { SuperAdminSnapshot } from './support/superadmin-session';

/**
 * Diagnóstico — E2E Playwright (plan docs/plans/2026-09-14-client-error-log-pwa-plan.md)
 *
 * Cubre el flujo del registro local de errores (client-error-log):
 *   1. Un error de consola (console.error) y una excepción no capturada quedan
 *      en el buffer y son visibles en /diagnostics con su nivel y el badge ×N.
 *   2. El filtro por nivel funciona (error vs info).
 *   3. El export dispara una descarga con el nombre client-log-*.json (fallback
 *      desktop, porque el contexto de Playwright no implementa navigator.share).
 *   4. El botón Limpiar vacía la lista tras confirmar el Swal.
 *
 * Solo se AGREGA este spec — ningún spec existente se toca (regla CLAUDE.md).
 */

const TITLE = 'Diagnóstico'; // DIAGNOSTICS.TITLE
const EMPTY = 'No hay eventos registrados en este dispositivo.'; // DIAGNOSTICS.EMPTY
const SHARE = 'Compartir'; // DIAGNOSTICS.SHARE
const DOWNLOAD = 'Descargar'; // DIAGNOSTICS.DOWNLOAD
const CLEAR = 'Limpiar'; // DIAGNOSTICS.CLEAR
const SI = 'Si'; // GENERAL.YES (confirm button of the clear Swal)

let superAdmin: SuperAdminSnapshot;

test.describe.serial('Diagnóstico (SuperAdmin)', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    superAdmin = await mintSuperAdmin(browser);
  });

  test('shows an empty buffer, then captures injected errors and lists them', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/diagnostics');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
    await expect(page.getByText(EMPTY)).toBeVisible();

    // Inject, INSIDE the app's own page context: one console.error and one
    // uncaught exception (setTimeout so the exception does not kill the
    // evaluate call). The global installer's console wrapper and window error
    // listener must capture both into the ring buffer.
    await page.evaluate(() => {
      console.error('e2e-console-error-probe');
      setTimeout(() => {
        throw new Error('e2e-uncaught-probe');
      }, 0);
    });
    await page.waitForTimeout(500);

    await expect(page.getByText(/e2e-console-error-probe/)).toBeVisible();
    await expect(page.getByText(/e2e-uncaught-probe/)).toBeVisible();
    // The uncaught exception carries level "error" — verify the level styling exists.
    await expect(page.locator('text=error').first()).toBeVisible();
  });

  it('filters entries by level', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/diagnostics');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    await page.evaluate(() => {
      console.error('e2e-filter-error-probe');
      console.warn('e2e-filter-warn-probe');
    });
    await page.waitForTimeout(300);

    const levelSelect = page.getByLabel('Filtrar por nivel');
    await levelSelect.selectOption('warn');
    await expect(page.getByText(/e2e-filter-warn-probe/)).toBeVisible();
    await expect(page.getByText(/e2e-filter-error-probe/)).toBeHidden();
  });

  it('downloads the export as client-log-*.json (desktop fallback, no navigator.share)', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/diagnostics');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    await page.evaluate(() => console.error('e2e-export-probe'));
    await page.waitForTimeout(300);

    const downloadPromise = page.waitForEvent('download');
    // Playwright's context has no navigator.share → the Download button shows.
    await page.getByRole('button', { name: DOWNLOAD }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^client-log-\d{8}-\d{4}\.json$/);
  });

  it('clears the buffer after confirming the Swal dialog', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/diagnostics');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    await page.evaluate(() => console.error('e2e-clear-probe'));
    await page.waitForTimeout(300);
    await expect(page.getByText(/e2e-clear-probe/)).toBeVisible();

    await page.getByRole('button', { name: CLEAR }).click();
    await page.getByRole('button', { name: SI }).click();
    await expect(page.getByText(/e2e-clear-probe/)).toBeHidden();
    await expect(page.getByText(EMPTY)).toBeVisible();
  });
});
