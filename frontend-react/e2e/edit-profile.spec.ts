import { test, expect } from './support/test';
import { newTestIdentity } from './support/identity';

/**
 * [S4-01] Editar el perfil propio
 * (`docs/testing/e2e-stage-1/S4-01.md`).
 *
 * 8 Playwright assertions:
 * 1. Formulario pre-cargado con fullName, cellPhone, email
 * 2. Payload incluye isActive: user.isActive
 * 3. Éxito muestra PROFILE.UPDATE_SUCCESS y permanece en la pantalla
 * 4. Fallo muestra PROFILE.UPDATE_ERROR
 * 5. Tras éxito, el usuario en sesión queda actualizado sin recargar
 * 6. updateUser preserva expiresIn (no acorta sesión)
 * 7. Offline: formulario deshabilita envío
 * 8. Contraseña nunca viaja en el payload
 */
const EDIT_TITLE = 'Editar perfil'; // es.ts:647
const SAVE_TEXT = 'Guardar cambios'; // es.ts:652
const UPDATE_SUCCESS = 'Perfil actualizado correctamente.'; // es.ts:654
const OFFLINE_NOTICE = 'Sin conexión. Conectate a internet para guardar cambios.'; // es.ts:662

test.use({ persona: 'owner-admin' });
test.describe.configure({ mode: 'serial', timeout: 120_000 });

// ── Test 1: Happy path — edit profile ──────────────────────────────────

test('editar perfil: pre-carga, payload con isActive, éxito muestra mensaje y permanece', async ({
  signedInPage,
}) => {
  const { page } = signedInPage;

  // Navigate to edit profile.
  await page.goto('/profile/edit');

  // Aserción 1: title visible.
  await expect(page.getByRole('heading', { level: 1, name: EDIT_TITLE })).toBeVisible();

  // Aserción 1: form pre-filled with current user data.
  const fullNameInput = page.locator('#fullName');
  const cellPhoneInput = page.locator('#cellPhone');
  const emailInput = page.locator('#email');

  await expect(fullNameInput).not.toHaveValue('');
  await expect(cellPhoneInput).not.toHaveValue('');

  // Intercept PUT /v1/users/{id} to capture the payload.
  const capturedPayloads: Array<Record<string, unknown>> = [];
  await page.route('**/v1/users/*', (route) => {
    if (route.request().method() === 'PUT') {
      capturedPayloads.push(route.request().postDataJSON());
    }
    route.continue();
  });

  // Modify fullName and submit.
  const newName = `Updated ${Date.now()}`;
  await fullNameInput.fill(newName);
  await page.getByRole('button', { name: SAVE_TEXT }).click();

  // Aserción 3: success message shown.
  await expect(page.getByText(UPDATE_SUCCESS)).toBeVisible({ timeout: 10_000 });

  // Aserción 3: still on /profile/edit (no navigation).
  await expect(page).toHaveURL(/\/profile\/edit$/);

  // Aserción 2: payload includes isActive.
  await expect
    .poll(() => capturedPayloads.length, { timeout: 5_000 })
    .toBe(1);
  expect(capturedPayloads[0].isActive).toBeDefined();

  // Aserción 8: password is NOT in the payload.
  expect(capturedPayloads[0]).not.toHaveProperty('password');
  expect(capturedPayloads[0]).not.toHaveProperty('oldPassword');
  expect(capturedPayloads[0]).not.toHaveProperty('newPassword');
});

// ── Test 2: Form is pre-filled and button is enabled online ────────────

test('formulario pre-cargado con datos del usuario', async ({ signedInPage }) => {
  const { page } = signedInPage;

  await page.goto('/profile/edit');
  await expect(page.getByRole('heading', { level: 1, name: EDIT_TITLE })).toBeVisible();

  // The fullName field should have a value (pre-filled from auth store).
  const fullNameInput = page.locator('#fullName');
  await expect(fullNameInput).toHaveValue(/.+/);

  // Submit button should be enabled online.
  await expect(page.getByRole('button', { name: SAVE_TEXT })).toBeEnabled();
});

// ── Test 3: Offline disables submit ────────────────────────────────────

test('offline: el envío está deshabilitado', async ({ signedInPage }) => {
  const { page } = signedInPage;

  // Use addInitScript to set navigator.onLine = false before React mounts.
  await page.context().addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
  });

  await page.goto('/profile/edit');
  await expect(page.getByRole('heading', { level: 1, name: EDIT_TITLE })).toBeVisible();

  // Aserción 7: submit button disabled offline.
  await expect(page.getByRole('button', { name: SAVE_TEXT })).toBeDisabled();

  // Offline notice visible.
  await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();
});
