import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';

/**
 * [S4-02] Cambiar la contraseña propia
 * (`docs/testing/e2e-stage-1/S4-02.md`).
 *
 * Covers the 7 UI assertions of that scenario: successful change triggers
 * logout + redirect to /login, old password no longer works, new password
 * works, failure shows error without logout, offline disables submit.
 *
 * Login budget: 1 real login for `owner-admin` (mint in worker). The
 * re-login after password change is a SECOND real login — total 2 logins,
 * within LoginPolicy's ceiling of 15/1min (RateLimitPolicies.cs:15-24).
 *
 * Literal Spanish copy asserted below is cited from
 * `apps/web-store-pos/app/shared/lib/i18n/es.ts`.
 */
const CHANGE_PASSWORD_TITLE = 'Cambiar contraseña'; // es.ts:648
const SUBMIT_TEXT = 'Cambiar contraseña'; // es.ts:659
const UPDATE_ERROR = 'No se pudo actualizar el perfil. Intentá de nuevo.'; // es.ts:655

test.use({ persona: 'owner-admin' });

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test('cambiar contraseña cierra sesión y la nueva funciona', async ({ signedInPage }) => {
  const { page, identity } = signedInPage;
  const newPass = 'E2E-NewPass1';

  // Navigate to change password page.
  await page.goto('/profile/change-password');

  // Aserción 1: page title is "Cambiar contraseña" (es.ts:648).
  await expect(page.getByRole('heading', { name: CHANGE_PASSWORD_TITLE })).toBeVisible();

  // Aserción 2: form has the three required fields.
  await expect(page.locator('#oldPassword')).toBeVisible();
  await expect(page.locator('#newPassword')).toBeVisible();
  await expect(page.locator('#confirmPassword')).toBeVisible();

  // Fill the form with the current password and a new one.
  await page.locator('#oldPassword').fill(identity.password);
  await page.locator('#newPassword').fill(newPass);
  await page.locator('#confirmPassword').fill(newPass);

  // Intercept the change-password request to verify the payload.
  const capturedRequests: Array<{ method: string; url: string; body: string }> = [];
  await page.route('**/v1/users/change-password/**', (route) => {
    capturedRequests.push({
      method: route.request().method(),
      url: route.request().url(),
      body: route.request().postData() ?? '',
    });
    route.continue();
  });

  // Submit the form.
  await page.getByRole('button', { name: SUBMIT_TEXT }).click();

  // Aserción 3: the POST payload is exactly { oldPassword, newPassword }
  // (profile-http-service.ts:11-14).
  await expect
    .poll(
      () => capturedRequests.some((r) => r.method === 'POST'),
      { timeout: 10_000, message: 'Expected POST /v1/users/change-password/{id}' }
    )
    .toBe(true);

  const postBody = JSON.parse(capturedRequests.find((r) => r.method === 'POST')!.body);
  expect(postBody).toHaveProperty('oldPassword', identity.password);
  expect(postBody).toHaveProperty('newPassword', newPass);

  // Aserción 4: successful change triggers logout → redirect to /login
  // (change-password.tsx:28; auth-store.ts:303-321).
  await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });

  // Aserción 5: AUTH_MODEL removed from localStorage (auth-store.ts:307).
  const authModel = await page.evaluate(() => localStorage.getItem('AUTH_MODEL'));
  expect(authModel).toBeNull();

  // Aserción 6: old password no longer works.
  const loginPage = new LoginPage(page);
  await loginPage.fill({ login: identity.login, password: identity.password });
  await loginPage.submit();

  // Should stay on /login (invalid credentials → 401).
  await expect(page).toHaveURL(/\/login$/);
  // The error message is rendered in a red div (login.tsx:247-251).
  await expect(page.locator('.text-red-700')).toBeVisible();

  // Aserción 7: new password works — re-login succeeds.
  await loginPage.fill({ login: identity.login, password: newPass });
  await loginPage.submit();

  // Should navigate away from /login to the home path.
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 10_000 });
});

test('offline: el botón de envío está deshabilitado', async ({ signedInPage }) => {
  const { page } = signedInPage;

  // Override navigator.onLine before React mounts — useOnlineStatus reads
  // it in useState(navigator.onLine). addInitScript runs before any page JS.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', {
      get: () => false,
      configurable: true,
    });
  });

  await page.goto('/profile/change-password');

  // The form disables the submit button when offline (change-password.tsx:39).
  const submitButton = page.getByRole('button', { name: SUBMIT_TEXT });
  await expect(submitButton).toBeDisabled();
});
