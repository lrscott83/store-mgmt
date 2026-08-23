import { test, expect } from './support/test';

/**
 * [S3-01] Exportar el roster de aprovisionamiento
 * (`docs/testing/e2e-stage-1/S3-01.md`).
 *
 * Playwright E2E assertions (observable from UI):
 * 1. Botón habilitado online (control — offline requires addInitScript
 *    which conflicts with the session fixture; full offline test is in
 *    roster-export-panel.test.tsx vitest).
 * 2. Contraseña vacía muestra error sin petición (assertion 2)
 * 3. Exactamente un GET al endpoint (assertion 3)
 * 4. Descarga roster-{storeId}.smcabundle (assertion 4)
 * 5. Contenido es ZIP (empieza con PK\x03\x04) (assertion 5)
 * 6. Panel se cierra al éxito (assertion 9)
 * 7. Toggle visibilidad contraseña (assertion 11)
 *
 * Assertions covered by vitest (unit tests):
 * - 1: botón disabled offline (roster-export-panel.test.tsx:44)
 * - 6: round-trip con deserializeRoster (roster-serializer.test.ts)
 * - 7: WrongPasswordError (roster-serializer.test.ts)
 * - 8: storeId parte de la contraseña (roster-serializer.test.ts)
 * - 10: Fallo muestra USERS.ERROR (roster-export-panel.test.tsx:61)
 * - 12: Botón disabled sin storeId (roster-export-panel.test.tsx:50)
 */
const EXPORT_TEXT = 'Exportar roster sin conexión'; // es.ts:781
const CONFIRM_TEXT = 'Confirmar'; // es.ts:9
const ERROR_EMPTY_PASSWORD = 'La contraseña no puede estar vacía.'; // es.ts:871
const SHOW_PASSWORD = 'Mostrar contraseña'; // es.ts:877
const HIDE_PASSWORD = 'Ocultar contraseña'; // es.ts:878

test.use({ persona: 'owner-admin' });
test.describe.configure({ mode: 'serial', timeout: 120_000 });

// ── Test 1: Happy path — export with download verification ─────────────

test('exportar roster: descarga ZIP con nombre correcto, panel se cierra', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  await page.goto('/management/users');

  // Aserción 3: intercept GET /v1/storeusers/{storeId}/offline-roster.
  const rosterRequests: string[] = [];
  await page.route(`**/v1/storeusers/${selectedStoreId}/offline-roster`, (route) => {
    rosterRequests.push(route.request().url());
    route.continue();
  });

  // Click "Exportar roster sin conexión".
  await page.getByRole('button', { name: EXPORT_TEXT }).click();

  // Dialog visible.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Aserción 7: toggle password visibility.
  const toggleBtn = dialog.getByRole('button', { name: SHOW_PASSWORD });
  await expect(toggleBtn).toBeVisible();
  await toggleBtn.click();
  await expect(dialog.getByRole('button', { name: HIDE_PASSWORD })).toBeVisible();
  // Toggle back — re-query because the accessible name changed.
  await dialog.getByRole('button', { name: HIDE_PASSWORD }).click();
  await expect(dialog.getByRole('button', { name: SHOW_PASSWORD })).toBeVisible();

  // Fill master password and confirm.
  const masterInput = dialog.locator('#roster-export-master');
  await masterInput.fill('TestMaster123');

  // Intercept the download.
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: CONFIRM_TEXT }).click();

  // Aserción 3: exactly one GET was emitted.
  await expect
    .poll(() => rosterRequests.length, { timeout: 10_000 })
    .toBe(1);

  // Aserción 4+5: download file with correct name and ZIP content.
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`roster-${selectedStoreId}.smcabundle`);

  // Save the downloaded file to verify content.
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  // Aserción 5: file starts with ZIP signature PK\x03\x04.
  const fs = await import('fs');
  const bytes = fs.readFileSync(downloadPath!);
  expect(bytes[0]).toBe(0x50); // P
  expect(bytes[1]).toBe(0x4b); // K
  expect(bytes[2]).toBe(0x03);
  expect(bytes[3]).toBe(0x04);

  // Aserción 9: panel closed after success.
  await expect(dialog).not.toBeVisible();
});

// ── Test 2: Empty password shows error ─────────────────────────────────

test('contraseña vacía muestra error y no emite petición', async ({ signedInPage }) => {
  const { page } = signedInPage;

  await page.goto('/management/users');

  // Intercept the roster endpoint.
  let rosterEmitted = false;
  await page.route('**/v1/storeusers/*/offline-roster', (route) => {
    rosterEmitted = true;
    route.continue();
  });

  await page.getByRole('button', { name: EXPORT_TEXT }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Submit with empty password.
  await dialog.getByRole('button', { name: CONFIRM_TEXT }).click();

  // Aserción 2: error message shown, no request emitted.
  await expect(dialog.getByText(ERROR_EMPTY_PASSWORD)).toBeVisible();
  expect(rosterEmitted).toBe(false);

  // Panel stays open.
  await expect(dialog).toBeVisible();
});

// ── Test 3: Button is enabled online (control) ─────────────────────────

test('botón habilitado online', async ({ signedInPage }) => {
  const { page } = signedInPage;

  await page.goto('/management/users');

  // Aserción 1 (control): button is enabled when online.
  const exportBtn = page.getByRole('button', { name: EXPORT_TEXT });
  await expect(exportBtn).toBeEnabled();
});
